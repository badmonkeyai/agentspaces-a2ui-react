/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/DataTable: a virtualised table over rows bound to the data model: only the rows in the viewport are in the
// DOM (a window of rows around the scroll position), with sort by column, a filter, paging, and a row action.
// Greeter chatbot, 2026-11-08 (H6): a date or datetime column reads in the viewer's own zone, as the chat's bubbles do,
// and sorts by its instant; the count says "row" for one.
import { useMemo, useRef, useState } from 'react';
import { define, fmt, useRows } from '../../renderer/implementation';
import type { DataTableProps } from '../../generated/props';

const ROW_H = 28, VIEW_H = 360, OVERSCAN = 6;

export const DataTable = define<DataTableProps>('DataTable', ({ props, ctx }) => {
  const rows = useRows(ctx, props.rows);
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
  return (
    <div className="bma-datatable" data-component="DataTable" data-virtual={virtual ? 'yes' : 'no'}>
      <div className="bma-table-tools">
        {props.filter !== false ? <input type="search" placeholder="Filter" aria-label="filter rows" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} /> : null}
        <span className="bma-muted bma-small">{shown.length === rows.length ? `${rows.length} ${noun(rows.length)}` : `${shown.length} of ${rows.length} ${noun(rows.length)}`}</span>
        {pageSize && pages > 1 ? <span className="bma-small"><button type="button" className="bma-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button> page {page + 1} of {pages} <button type="button" className="bma-btn" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>›</button></span> : null}
      </div>
      <div className="bma-table-wrap" ref={body} style={virtual ? { maxHeight: VIEW_H } : undefined} onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
        <table className="bma-table">
          <thead><tr>{columns.map(c => <th key={c.key} className={isNum(c) ? 'num' : ''} style={c.width ? { width: c.width } : undefined} onClick={() => setSort(s => (s && s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>{c.title ?? c.key}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>)}{props.rowAction ? <th /> : null}</tr></thead>
          <tbody>
            {virtual && first > 0 ? <tr aria-hidden="true"><td colSpan={columns.length + (props.rowAction ? 1 : 0)} style={{ height: first * ROW_H, padding: 0, border: 0 }} /></tr> : null}
            {window.map((r, i) => <tr key={first + i} style={virtual ? { height: ROW_H } : undefined}>{columns.map(c => <td key={c.key} className={isNum(c) ? 'num' : ''}>{format(r[c.key], c.format)}</td>)}{props.rowAction ? <td><button type="button" className="bma-btn" onClick={() => ctx.dispatch(props.rowAction, { row: r })}>{props.rowAction}</button></td> : null}</tr>)}
            {virtual && last < paged.length ? <tr aria-hidden="true"><td colSpan={columns.length + (props.rowAction ? 1 : 0)} style={{ height: (paged.length - last) * ROW_H, padding: 0, border: 0 }} /></tr> : null}
            {!paged.length ? <tr><td colSpan={columns.length + (props.rowAction ? 1 : 0)} className="bma-muted">No row{filter ? ' matches the filter' : ' yet'}.</td></tr> : null}
          </tbody>
        </table>
      </div>
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

function format(v: unknown, f?: string): string {
  if (v === null || v === undefined) return '';
  if (f === 'date' || f === 'datetime') {
    const ms = instant(v);
    if (Number.isNaN(ms)) return String(v);
    const d = new Date(ms);
    return f === 'date' ? localDay(d) : `${localDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (f === 'percent' && typeof v === 'number') return (v * 100).toFixed(1) + '%';
  return fmt(v);
}
