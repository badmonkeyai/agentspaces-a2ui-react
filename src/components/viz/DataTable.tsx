/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/DataTable: a virtualised table over rows bound to the data model: only the rows in the viewport are in the
// DOM (a window of rows around the scroll position), with sort by column, a filter, paging, and a row action.
// Greeter chatbot, 2026-11-08 (H6): a date or datetime column reads in the viewer's own zone, as the chat's bubbles do,
// and sorts by its instant; the count says "row" for one.
// A row action's button reads rowActionLabel, else the action's name, and its accessible name adds the row's first
// column, so a screen reader tells "Open C-1001" from "Open C-1002" (AF-14). The scrolling wrapper takes the keyboard
// (tabindex 0) and is a region named for the table's columns (D-F11).
// srad/agentspaces-geo.md (GEO-D-06, D-07): each sort header is a button (Tab, Enter or
// Space) with aria-sort on the sorted column; rowActions add several row buttons beside rowAction; emptyText says the
// table's own words while it has no row; select puts a native checkbox before each row that adds the row's key to a map's
// pick set (in the browser's memory only, ../../viz/pick), kept by key across sort, filter, paging and scrolling, with
// the key's pick hue as a swatch, Clear (n) in the tools, the refusal past max in words, Shift with a click for a range,
// the arrow keys from one row's checkbox to the next, and the keys that leave the rows (or a change of the clearOn
// column) taken out of the set, each said in the table's polite live region; select.focus makes the first column's text
// a button that flies the map to the row's feature.
// srad/agentspaces-geo.md (GEO-D-09 to D-11): rowFilter keeps the rows whose columns equal the value at a data model
// path (../../viz/filter, the rule a GeoMap layer's filter shares), the count saying how many it keeps; a column of format
// state reads an A2A task state as its word beside its icon, in its colour, never colour alone; a row action with pick
// sets the map's pick set to the keys a row's column lists, in place of a dispatch (or beside it, with pick.dispatch,
// picking keys no table lists yet too), and says what it showed. The table
// says while its rows have not arrived (loading) and when the value at its path does not read as a table (error).
// kismet-life-patterns §10.13: a list in a cell reads as its first LIST_MAX items joined by "; " and "+N" for the rest
// (its whole text in the cell's title); a column whose text runs long (LONG_TEXT characters in a row on the page) keeps
// a reading width (class as-long), so a note is not squeezed to a word a line; and the row buttons wrap, never overflow.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { define, fmt, useArrived, useData } from '../../renderer/implementation';
import { useGeoFrame } from '../../frame/geo';
import { geoState, keysOf, MAX_PICKED, pickHue } from '../../viz/features';
import { filterRows, rowFilterOf } from '../../viz/filter';
import { usePicks } from '../../viz/pick';
import type { DataTableProps } from '../../generated/props';
import { useLook } from '../../look/provider';
import { guessSpec } from '../../viz/visualize';
import { VisualizeView } from './Visualize';

const ROW_H = 28, VIEW_H = 360, OVERSCAN = 6;
/** The most items of a list a cell shows before "+N", and the length of text that makes a column a long one. */
export const LIST_MAX = 5, LONG_TEXT = 40;

export const DataTable = define<DataTableProps>('DataTable', ({ props, ctx }) => {
  const bound = useData<unknown>(ctx, props.rows);
  const arrived = useArrived(ctx);
  // the rows: a list, or a map's values; nothing bound before the page's data arrived is loading, and a value that is no
  // list or map does not read (null is an empty table, as a feed may write it)
  const all = useMemo(() => (Array.isArray(bound) ? bound : bound && typeof bound === 'object' ? Object.values(bound) : []) as Record<string, unknown>[], [bound]);
  const tableState = bound === undefined && !arrived && props.rows ? 'loading' : bound !== undefined && bound !== null && typeof bound !== 'object' ? 'error' : undefined;
  // rowFilter (GEO-M-12): the rows whose columns equal the value at its path, every row while that value is empty
  const rowFilter = rowFilterOf(props.rowFilter);
  const filterValue = useData<unknown>(ctx, rowFilter?.path);
  const rows = useMemo(() => filterRows(all, rowFilter, filterValue), [all, rowFilter?.path, rowFilter?.match.join('\n'), filterValue]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns = props.columns ?? [];
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(() => (props.sort ? { key: props.sort.replace(/^-/, ''), dir: props.sort.startsWith('-') ? -1 : 1 } : null));
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const pageSize = props.pageSize && props.pageSize > 0 ? props.pageSize : 0;   // 0: no paging, the window alone bounds the DOM
  const shown = useMemo(() => {
    let out = rows;
    if (filter) { const f = filter.toLowerCase(); out = out.filter(r => columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(f))); }
    if (sort) {
      const { key, dir } = sort; const kind = columns.find(c => c.key === key)?.format; const timed = kind === 'date' || kind === 'datetime';
      out = [...out].sort((a, b) => {
        const x = a[key], y = b[key];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        const tx = timed ? instant(x) : NaN, ty = timed ? instant(y) : NaN;
        if (!Number.isNaN(tx) && !Number.isNaN(ty)) return (tx - ty) * dir;
        return String(x ?? '').localeCompare(String(y ?? '')) * dir;
      });
    }
    return out;
  }, [rows, filter, sort, columns]);
  const paged = pageSize ? shown.slice(page * pageSize, (page + 1) * pageSize) : shown;
  const virtual = paged.length * ROW_H > VIEW_H;
  const first = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const last = virtual ? Math.min(paged.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN) : paged.length;
  const window = paged.slice(first, last);
  const pages = pageSize ? Math.max(1, Math.ceil(shown.length / pageSize)) : 1;
  const isNum = (c: { key: string; format?: string }) => c.format === 'number' || (paged[0] && typeof paged[0][c.key] === 'number');
  // a column whose text runs long in a row on the page keeps a reading width (as-long)
  const long = new Set(columns.filter(c => !isNum(c) && paged.some(r => format(r[c.key], c.format).length >= LONG_TEXT)).map(c => c.key));
  // the row button's words, and its accessible name: the words and the row's first column
  const action = typeof props.rowActionLabel === 'string' && props.rowActionLabel.trim() ? props.rowActionLabel.trim() : String(props.rowAction ?? '');
  const rowName = (r: Record<string, unknown>) => { const lead = columns[0] ? format(r[columns[0].key], columns[0].format).trim() : ''; return lead ? `${action} ${lead}` : action; };
  // the scrolling wrapper is a named, focusable region (D-F11), so a keyboard scrolls it and a screen reader names it by its columns
  // and a table that is not full says its state in its name (loading, unavailable, empty), which a screen reader hears
  // and which tells apart two tables of the same columns in two states
  const tableName = `Table of ${columns.map(c => c.title ?? c.key).join(', ') || 'rows'}${tableState === 'loading' ? ', loading' : tableState === 'error' ? ', unavailable' : !all.length ? ', empty' : ''}`;
  // several row buttons (GEO-D-07), beside the one rowAction; one with pick sets the pick set instead (GEO-D-10)
  const rowActions = Array.isArray(props.rowActions) ? props.rowActions.filter(a => a && typeof a.action === 'string' && a.action && typeof a.label === 'string' && a.label.trim()) : [];
  const pickFromOf = (a: { pick?: unknown }) => { const p = a.pick as { from?: unknown; map?: unknown; dispatch?: unknown } | undefined; return p && typeof p === 'object' && typeof p.from === 'string' && p.from ? { from: p.from, map: typeof p.map === 'string' && p.map ? p.map : undefined, dispatch: p.dispatch === true } : undefined; };
  const pickActions = rowActions.some(a => pickFromOf(a));
  const lead = (r: Record<string, unknown>) => (columns[0] ? format(r[columns[0].key], columns[0].format).trim() : '');
  // select (GEO-D-06): the pick set of the map the table names, else the GeoLayout's
  const sel = props.select && typeof props.select === 'object' && typeof props.select.key === 'string' && props.select.key ? props.select : undefined;
  const frame = useGeoFrame();
  const pickMap = (sel && typeof sel.map === 'string' && sel.map ? sel.map : undefined) ?? rowActions.map(a => pickFromOf(a)?.map).find(Boolean);
  const picks = usePicks(ctx, sel || pickActions ? pickMap : undefined);
  const max = sel && typeof sel.max === 'number' && sel.max >= 1 ? Math.min(MAX_PICKED, Math.floor(sel.max)) : MAX_PICKED;
  const keyOf = (r: Record<string, unknown>) => { const v = sel ? r[sel.key] : undefined; return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''; };
  const picked = sel ? picks.picked : [];
  const [say, setSay] = useState({ text: '', seq: 0 });
  const tell = (text: string) => setSay(prev => ({ text, seq: prev.seq + 1 }));
  const anchor = useRef<string | undefined>(undefined);
  const source = ctx.surfaceId + '/' + ctx.componentId;
  // the keys of every row the table holds, the filtered-out ones too: a filter is a view, never data that left
  const rowKeys = useMemo(() => (sel ? all.map(keyOf).filter(Boolean) : []), [all, sel?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const keysKey = rowKeys.join('\n');
  // the keys this table lists, for a watchbox's pick (in a GeoLayout); gone with the table
  useEffect(() => { if (sel) picks.listKeys(source, rowKeys); }, [keysKey, Boolean(sel)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => picks.listKeys(source, undefined), [source]); // eslint-disable-line react-hooks/exhaustive-deps
  // a key that leaves the rows leaves the set, and a change of the clearOn column's value empties it (§3.6): the data's
  // change, never the person's, so the map keeps its view (it fits only what the person picks)
  const before = useRef<{ keys: Set<string>; scope: string | undefined } | undefined>(undefined);
  useEffect(() => {
    if (!sel) return;
    const scopeOf = () => { const c = typeof sel.clearOn === 'string' && sel.clearOn ? sel.clearOn : ''; const v = c ? all.find(r => r[c] !== undefined && r[c] !== null && r[c] !== '')?.[c] : undefined; return v === undefined ? undefined : String(v); };
    const now = { keys: new Set(rowKeys), scope: scopeOf() };
    const was = before.current;
    before.current = now;
    if (!was || !picked.length) return;
    if (was.scope !== undefined && now.scope !== undefined && was.scope !== now.scope) {
      const text = `The picks were cleared: the table now shows ${now.scope}.`;
      picks.set([], text, 'data');
      tell(text);
      return;
    }
    const gone = picked.filter(k => was.keys.has(k) && !now.keys.has(k));
    if (!gone.length) return;
    const text = `${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} no longer in the table, so no longer shown.`;
    picks.set(picked.filter(k => !gone.includes(k)), text, 'data');
    tell(text);
  }, [keysKey, all]); // eslint-disable-line react-hooks/exhaustive-deps
  const refuse = () => tell(`At most ${max} at a time; clear one first.`);
  // a row action's pick (GEO-D-10), as a watchbox's: the first eight keys the row's column lists, in its order; inside a
  // GeoLayout the keys no select table lists are left out, unless the action also dispatches (pick.dispatch), which asks
  // for the keys' rows: then every key is picked and shows as its rows arrive; what it showed and left out are said
  const pickRow = (r: Record<string, unknown>, from: string, dispatching = false) => {
    const keys = keysOf(r[from]);
    const tables = picks.listed();
    const listed = dispatching ? undefined : tables;
    const known = listed ? keys.filter(k => listed.has(k)) : keys;
    const shown = known.slice(0, MAX_PICKED);
    const unlisted = keys.filter(k => !known.includes(k)), past = known.slice(MAX_PICKED);
    const waiting = dispatching && tables ? shown.filter(k => !tables.has(k)) : [];
    const said = !keys.length ? `${lead(r) || 'The row'} names none to show; nothing is picked.`
      : (shown.length ? `Showing ${shown.length} on the map: ${shown.join(', ')}.` : 'Nothing to show on the map.')
        + (waiting.length ? ` Asked for ${waiting.join(', ')}; each shows when its rows arrive.` : '')
        + (unlisted.length ? ` Not in a table, so left out: ${unlisted.join(', ')}.` : '')
        + (past.length ? ` At most ${MAX_PICKED} at a time, so left out: ${past.join(', ')}.` : '');
    picks.set(shown, said);
    tell(said);
  };
  const toggle = (r: Record<string, unknown>, range: boolean) => {
    const k = keyOf(r);
    if (!k) return;
    if (picked.includes(k) && !range) { picks.set(picked.filter(x => x !== k)); anchor.current = k; return; }
    let add = [k];
    if (range && anchor.current !== undefined) {
      const order = shown.map(keyOf);
      const a = order.indexOf(anchor.current), b = order.indexOf(k);
      if (a >= 0 && b >= 0) add = order.slice(Math.min(a, b), Math.max(a, b) + 1).filter(Boolean);
    }
    const fresh = add.filter(x => !picked.includes(x));
    anchor.current = k;
    if (!fresh.length) return;
    const room = max - picked.length;
    if (room <= 0) { refuse(); return; }
    picks.set([...picked, ...fresh.slice(0, room)]);
    if (fresh.length > room) refuse();
  };
  // a click tells whether Shift was down; the change that follows it toggles (or picks the range)
  const shift = useRef(false);
  const onBoxClick = (e: ReactMouseEvent<HTMLInputElement>) => { shift.current = e.shiftKey; };
  // the arrow keys move from one row's checkbox to the next; Space toggles it, as a checkbox does
  const onBoxKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const boxes = [...(body.current?.querySelectorAll<HTMLInputElement>('input.as-pick-box') ?? [])];
    const at = boxes.indexOf(e.currentTarget);
    const next = boxes[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); }
  };
  // select.focus: the first column's text flies the map to the row's feature and opens its card (GEO-D-06)
  const focusOn = (r: Record<string, unknown>) => {
    const id = sel && typeof sel.focus === 'string' && sel.focus ? r[sel.focus] : undefined;
    if (typeof id !== 'string' || !id) return;
    if (frame) { frame.focus(id); return; }
    const map = sel && typeof sel.map === 'string' ? sel.map : '';
    if (!map) return;
    const st = geoState(map);
    ctx.set(st.selected, id);
    ctx.set(st.focus, { id, seq: Date.now() });
  };
  const focusable = Boolean(sel && typeof sel.focus === 'string' && sel.focus);
  const { tokens } = useLook();
  const hueOf = (k: string) => { const i = picked.indexOf(k); return i >= 0 ? pickHue(i, tokens.color.categorical) : undefined; };
  const span = columns.length + (sel ? 1 : 0) + (props.rowAction ? 1 : 0) + (rowActions.length ? 1 : 0);
  const sortBy = (key: string) => setSort(s => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const emptyText = typeof props.emptyText === 'string' && props.emptyText.trim() ? props.emptyText.trim() : 'No row yet.';
  const filteredOut = rows.length < all.length;
  // "Chart this" (srad/agentspaces-geo.md GEO-D-04): the rows shown, as a chart whose spec is guessed from the columns
  const [charted, setCharted] = useState(false);
  const guessed = useMemo(() => guessSpec(columns.map(c => c.key), rows), [columns, rows]);
  if (charted && guessed) {
    return (
      <div className="bma-datatable" data-component="DataTable" data-charted="yes">
        <VisualizeView spec={guessed} rows={shown} hues={tokens.color.categorical} onClose={() => setCharted(false)} />
      </div>
    );
  }
  return (
    <div className="bma-datatable" data-component="DataTable" data-virtual={virtual ? 'yes' : 'no'}>
      <div className="bma-table-tools">
        {props.filter !== false ? <input type="search" placeholder="Filter" aria-label="filter rows" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} /> : null}
        <span className="bma-muted bma-small">{shown.length === all.length ? `${all.length} ${noun(all.length)}` : `${shown.length} of ${all.length} ${noun(all.length)}`}</span>
        {guessed ? <button type="button" className="bma-btn" onClick={() => setCharted(true)} title={`a ${guessed.mark} chart of ${guessed.y.join(', ')} by ${guessed.x}`}>Chart this</button> : null}
        {sel && picked.length ? <button type="button" className="bma-btn as-pick-clear" onClick={() => { picks.set([], 'The picks were cleared; the map shows every layer.'); anchor.current = undefined; }}>Clear ({picked.length})</button> : null}
        {pageSize && pages > 1 ? <span className="bma-small"><button type="button" className="bma-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button> page {page + 1} of {pages} <button type="button" className="bma-btn" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>›</button></span> : null}
      </div>
      <div className="bma-table-wrap" ref={body} tabIndex={0} role="region" aria-label={tableName} style={virtual ? { maxHeight: VIEW_H } : undefined} onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        data-pick-map={sel ? (typeof sel.map === 'string' ? sel.map : '') : undefined}>
        <table className="bma-table">
          <thead><tr>
            {sel ? <th className="as-pick-col"><span className="as-visually-hidden">{typeof sel.label === 'string' && sel.label.trim() ? sel.label.trim() : 'Show on the map'}</span></th> : null}
            {columns.map(c => <th key={c.key} className={isNum(c) ? 'num' : ''} style={c.width ? { width: c.width } : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
              <button type="button" className="as-sort" onClick={() => sortBy(c.key)}>{c.title ?? c.key}{sort?.key === c.key ? <span aria-hidden="true">{sort.dir === 1 ? ' ▲' : ' ▼'}</span> : null}</button></th>)}
            {props.rowAction ? <th><span className="as-visually-hidden">Action</span></th> : null}
            {rowActions.length ? <th><span className="as-visually-hidden">Actions</span></th> : null}
          </tr></thead>
          <tbody>
            {virtual && first > 0 ? <tr aria-hidden="true"><td colSpan={span} style={{ height: first * ROW_H, padding: 0, border: 0 }} /></tr> : null}
            {window.map((r, i) => { const k = sel ? keyOf(r) : ''; const hue = k ? hueOf(k) : undefined; const name = lead(r) || k;
              return <tr key={first + i} style={virtual ? { height: ROW_H } : undefined} data-picked={hue ? '' : undefined}>
                {sel ? <td className="as-pick-cell">{k ? <input type="checkbox" className="as-pick-box" checked={Boolean(hue)} onClick={onBoxClick} onChange={() => { const range = shift.current; shift.current = false; toggle(r, range); }} onKeyDown={onBoxKey}
                  aria-label={sel.map || frame ? `Show ${name} on the map` : `Pick ${name}`} /> : null}{hue ? <span className="as-pick-swatch" aria-hidden="true" style={{ background: hue }} /> : null}</td> : null}
                {columns.map((c, j) => <td key={c.key} className={isNum(c) ? 'num' : long.has(c.key) ? 'as-long' : ''} title={Array.isArray(r[c.key]) && (r[c.key] as unknown[]).length > LIST_MAX ? (r[c.key] as unknown[]).map(fmt).join('; ') : undefined}>{j === 0 && focusable && sel && typeof r[sel.focus!] === 'string' && r[sel.focus!]
                  ? <button type="button" className="as-geo-link" aria-label={`Go to ${name} on the map`} onClick={() => focusOn(r)}>{format(r[c.key], c.format)}</button> : cell(r[c.key], c.format)}</td>)}
                {props.rowAction ? <td><button type="button" className="bma-btn" aria-label={rowName(r)} onClick={() => ctx.dispatch(props.rowAction, { row: r })}>{action}</button></td> : null}
                {rowActions.length ? <td className="as-row-actions">{rowActions.map(a => { const pk = pickFromOf(a);
                  return <button key={a.action} type="button" className="bma-btn" data-pick={pk ? '' : undefined} aria-label={name ? `${a.label.trim()} ${name}` : a.label.trim()}
                    onClick={() => { if (pk) pickRow(r, pk.from, pk.dispatch); if (!pk || pk.dispatch) ctx.dispatch(a.action, { row: r }); }}>{a.label.trim()}</button>; })}</td> : null}
              </tr>; })}
            {virtual && last < paged.length ? <tr aria-hidden="true"><td colSpan={span} style={{ height: (paged.length - last) * ROW_H, padding: 0, border: 0 }} /></tr> : null}
            {!paged.length ? <tr><td colSpan={span} className="bma-muted" aria-busy={tableState === 'loading' || undefined}>{tableState === 'loading' ? 'Loading the rows…'
              : tableState === 'error' ? `Unavailable: the rows at ${props.rows} do not read as a table.`
              : filter ? 'No row matches the filter.' : filteredOut ? 'No row matches what the page shows now.' : emptyText}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {sel || pickActions ? <p className="as-visually-hidden" aria-live="polite">{say.text ? say.text + (say.seq % 2 ? '' : '\u200b') : ''}</p> : null}
    </div>
  );
});

const noun = (n: number) => (n === 1 ? 'row' : 'rows');
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A plain date ('YYYY-MM-DD') names a day of the calendar and no instant, so it reads as written in every zone. */
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The instant a date or datetime cell holds, in milliseconds; NaN for a plain date or a value that does not read. */
const instant = (v: unknown): number => (typeof v === 'string' && !PLAIN_DATE.test(v) ? Date.parse(v) : NaN);

/** The A2A task states a state column reads, each with its icon and its tone (GEO-D-11): never colour alone. */
export const STATE_LOOKS: Readonly<Record<string, { icon: string; tone: string }>> = {
  submitted: { icon: '○', tone: 'muted' }, working: { icon: '◐', tone: 'info' }, 'input-required': { icon: '!', tone: 'warning' },
  completed: { icon: '✓', tone: 'good' }, failed: { icon: '✕', tone: 'critical' }, canceled: { icon: '⊘', tone: 'muted' },
};

/** A cell as it draws: a state column's A2A word beside its icon, any other as its text. */
function cell(v: unknown, f?: string): ReactNode {
  if (f === 'state' && typeof v === 'string' && STATE_LOOKS[v]) {
    const look = STATE_LOOKS[v];
    return <span className={`as-task-state as-tone-${look.tone}`} data-state={v}><span className="icon" aria-hidden="true">{look.icon}</span>{v}</span>;
  }
  return format(v, f);
}

function format(v: unknown, f?: string): string {
  if (v === null || v === undefined) return '';
  // a list: its first LIST_MAX items, each as a cell reads it, then how many more
  if (Array.isArray(v)) {
    const items = v.map(x => format(x, f)).filter(Boolean);
    return items.slice(0, LIST_MAX).join('; ') + (items.length > LIST_MAX ? ` +${items.length - LIST_MAX}` : '');
  }
  if (f === 'date' || f === 'datetime') {
    const ms = instant(v);
    if (Number.isNaN(ms)) return String(v);
    const d = new Date(ms);
    return f === 'date' ? localDay(d) : `${localDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (f === 'percent' && typeof v === 'number') return (v * 100).toFixed(1) + '%';
  return fmt(v);
}
