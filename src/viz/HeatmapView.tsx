/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The drawing of Visualize mark: heatmap (srad/agentspaces-geo.md GEO-D-08), by the dataviz method: one
// hue for magnitude, light to dark (the look's sequential ramp, ./ramp), with a legend of its steps and their range; a
// cell no row has drawn as an outline, never as zero; small multiples side by side, a picked key's facet titled beside its
// pick hue; a hover tooltip on every cell. Each grid is a table with the grid role and a roving tabindex: one cell of
// each grid takes the Tab (so a second facet is reached by Tab too), the arrow keys move from cell to cell (Home and End
// to a row's ends), Enter or Space clicks. A click flies the
// map to the feature the cell's focus column names (GeoFrame.focus in a GeoLayout, else the named map's state), dispatches
// cellAction with {row, x, y, value, facet}, and writes the cell's first row to selected, a second click on the selected
// cell clearing it (and dispatching nothing); the selected cell wears a ring. The table view lists each facet's rows by
// its columns, an empty cell as a dash.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { fmt, useData, type Ctx } from '../renderer/implementation';
import { useLook } from '../look/provider';
import { useGeoFrame } from '../frame/geo';
import type { VisualizeProps } from '../generated/props';
import { geoState, pickHue } from './features';
import { usePicks } from './pick';
import { cellKey, heatOf, heatSpecOf, selects, type HeatCell } from './heatmap';
import { lookRamp, rampBounds, rampStep } from './ramp';
import { compact } from './scale';

type Rows = readonly Record<string, unknown>[];

export function HeatmapView({ props, ctx, rows, state, path }: { props: VisualizeProps; ctx: Ctx; rows: Rows; state?: 'loading' | 'error'; path?: string }) {
  const { tokens } = useLook();
  const specKey = JSON.stringify([props.x, props.row, props.y, props.aggregate, props.xOrder, props.rowOrder, props.facet, props.pick]);
  const spec = useMemo(() => heatSpecOf(props), [specKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const map = typeof props.map === 'string' && props.map ? props.map : undefined;
  const picks = usePicks(ctx, map);
  const frame = useGeoFrame();
  const pickedKey = picks.picked.join('\n');
  const heat = useMemo(() => heatOf(rows, spec, spec.pickBy ? picks.picked : []), [rows, spec, pickedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ramp = useMemo(() => lookRamp(tokens.color), [tokens.color.surface, tokens.color.sequential, tokens.color.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedPath = typeof props.selected === 'string' && props.selected.startsWith('/') ? props.selected : undefined;
  const selected = useData<unknown>(ctx, selectedPath);
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<{ f: number; xi: number; yi: number }>({ f: 0, xi: 0, yi: 0 });
  const [hover, setHover] = useState<{ text: string; left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const unit = typeof props.unit === 'string' && props.unit ? ' ' + props.unit : '';
  const title = typeof props.title === 'string' ? props.title : '';
  const missing = useMemo(() => {
    if (!rows.length) return [];
    const has = (c: string) => rows.some(r => r && Object.prototype.hasOwnProperty.call(r, c));
    return [...new Set([spec.x, spec.row, spec.value, spec.facet].filter((c): c is string => Boolean(c) && !has(c!)))];
  }, [rows, spec]);
  // the active cell stays inside the grid when the facets or the categories change
  const f = Math.min(active.f, Math.max(0, heat.facets.length - 1)), xi = Math.min(active.xi, Math.max(0, heat.xs.length - 1)), yi = Math.min(active.yi, Math.max(0, heat.ys.length - 1));
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    box.current?.querySelector<HTMLElement>(`[data-cell="${f}:${xi}:${yi}"]`)?.focus();
  }, [f, xi, yi]);
  const head = (
    <div className="bma-chart-tools">
      {title ? <div className="bma-title">{title}{unit ? <span className="bma-muted bma-small"> ({props.unit as string})</span> : null}</div> : null}
      {props.table !== 'below' ? <button type="button" className="bma-btn" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? 'Chart' : 'Table'}</button> : null}
    </div>
  );
  const shell = (body: ReactNode, extra: Record<string, string> = {}) => (
    <div className="bma-chart as-visualize as-heatmap" data-component="Visualize" data-mark="heatmap" style={{ position: 'relative' }} ref={box} {...extra}>{head}{body}</div>
  );
  if (state === 'loading') return shell(<p className="bma-muted" aria-busy="true">Loading the rows…</p>, { 'data-state': 'loading' });
  if (state === 'error') return shell(<p role="note">Unavailable: the rows at {path} do not read as a table.</p>, { 'data-state': 'error' });
  if (!spec.row) return shell(<p className="bma-muted" role="status">A heatmap names its row column.</p>);
  if (missing.length) return shell(<p className="bma-muted" role="status">{missing.map(c => `No column ${c} in the table.`).join(' ')}</p>);
  if (!rows.length) return shell(<p className="bma-muted">No rows yet.</p>);
  const textOf = (c: HeatCell | undefined, x: string, y: string, facet: string) => `${facet ? facet + ', ' : ''}${y} ${x}: ${c ? fmt(c.value) + unit : 'no data'}`;
  const click = (c: HeatCell) => {
    const row = c.rows[0];
    if (selectedPath && selects(selected, c, spec)) { ctx.set(selectedPath, null); return; }   // the second click clears, and does nothing else
    if (selectedPath) ctx.set(selectedPath, row);
    const id = typeof props.focus === 'string' && props.focus ? row?.[props.focus] : undefined;
    if (typeof id === 'string' && id) {
      if (frame) frame.focus(id);
      else if (map) { const st = geoState(map); ctx.set(st.selected, id); ctx.set(st.focus, { id, seq: Date.now() }); }
    }
    if (typeof props.cellAction === 'string' && props.cellAction) ctx.dispatch(props.cellAction, { row, x: c.x, y: c.y, value: c.value, ...(spec.facet ? { facet: c.facet } : {}) });
  };
  // the keys act in the grid the cell is in: each facet is its own grid, its own tab stop at the active position
  const onKey = (e: ReactKeyboardEvent<HTMLElement>, c: HeatCell | undefined, fi: number) => {
    const step: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (step[e.key]) {
      e.preventDefault();
      moved.current = true;
      setActive({ f: fi, xi: Math.max(0, Math.min(heat.xs.length - 1, xi + step[e.key][0])), yi: Math.max(0, Math.min(heat.ys.length - 1, yi + step[e.key][1])) });
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      moved.current = true;
      setActive({ f: fi, xi: e.key === 'Home' ? 0 : heat.xs.length - 1, yi });
    } else if ((e.key === 'Enter' || e.key === ' ') && c) {
      e.preventDefault();
      click(c);
    }
  };
  const hoverOn = (e: ReactMouseEvent<HTMLElement>, text: string) => {
    const outer = box.current?.getBoundingClientRect(), cell = e.currentTarget.getBoundingClientRect();
    if (outer) setHover({ text, left: cell.left - outer.left + cell.width / 2, top: cell.top - outer.top });
  };
  const hueOf = (name: string) => { const i = spec.pickBy === spec.facet ? picks.picked.indexOf(name) : -1; return i >= 0 ? pickHue(i, tokens.color.categorical) : undefined; };
  const notes: string[] = [];
  if (heat.left.length) notes.push(`At most 8 grids at once; left out: ${heat.left.join(', ')}.`);
  if (heat.outside) notes.push(`${heat.outside} ${heat.outside === 1 ? 'row lies' : 'rows lie'} outside the grid's categories.`);
  if (spec.pickBy && picks.picked.length && !heat.facets.length) notes.push('None of the picked keys has a row here.');
  const legend = heat.domain ? (
    <div className="bma-legend as-heat-legend" aria-label="colour scale">
      <span className="as-heat-ramp" aria-hidden="true">{ramp.map((c, i) => <span key={i} className="step" style={{ background: c }} title={`from ${compact(rampBounds(heat.domain!, ramp.length)[i])}`} />)}</span>
      <span>{compact(heat.domain.min)} to {compact(heat.domain.max)}{unit}</span>
      <span><span className="swatch as-heat-none" aria-hidden="true" />no data</span>
    </div>
  ) : null;
  const grids = heat.facets.map((facet, fi) => {
    const hue = hueOf(facet.name);
    const label = `${title || 'Heatmap'}${facet.name ? ': ' + facet.name : ''}`;
    return (
      <div key={facet.name} className="as-heat-facet" data-facet={facet.name}>
        {spec.facet ? <p className="as-heat-facet-title">{hue ? <span className="swatch" aria-hidden="true" style={{ background: hue }} /> : null}{facet.name || '(blank)'}</p> : null}
        {table ? (
          <table className="bma-table" data-chart-table aria-label={label}>
            <thead><tr><th scope="col">{spec.row}</th>{heat.xs.map(x => <th key={x} scope="col" className="num">{x}</th>)}</tr></thead>
            <tbody>{heat.ys.map(y => <tr key={y}><th scope="row">{y}</th>{heat.xs.map(x => { const c = facet.cells.get(cellKey(x, y)); return <td key={x} className="num">{c ? fmt(c.value) : '–'}</td>; })}</tr>)}</tbody>
          </table>
        ) : (
          <table className="as-heat-grid" role="grid" aria-label={label} style={{ ['--as-heat-cols' as string]: heat.xs.length }}>
            <thead><tr><td className="corner" /><>{heat.xs.map(x => <th key={x} scope="col">{x}</th>)}</></tr></thead>
            <tbody>{heat.ys.map((y, yj) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {heat.xs.map((x, xj) => {
                  const c = facet.cells.get(cellKey(x, y));
                  const on = xj === xi && yj === yi;
                  const sel = Boolean(c && selectedPath && selects(selected, c, spec));
                  const text = textOf(c, x, y, facet.name);
                  return (
                    <td key={x} role="gridcell" tabIndex={on ? 0 : -1} data-cell={`${fi}:${xj}:${yj}`} aria-label={text} aria-selected={selectedPath ? sel : undefined}
                      className={`cell${c ? '' : ' empty'}${sel ? ' selected' : ''}${c && heat.domain && rampStep(c.value, heat.domain, ramp.length) >= 3 ? ' dark' : ''}`}
                      style={c && heat.domain ? { background: ramp[rampStep(c.value, heat.domain, ramp.length)] } : undefined}
                      onClick={() => { setActive({ f: fi, xi: xj, yi: yj }); if (c) click(c); }} onKeyDown={e => onKey(e, c, fi)} onFocus={() => setActive({ f: fi, xi: xj, yi: yj })}
                      onMouseEnter={e => hoverOn(e, text)} onMouseLeave={() => setHover(null)} />
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    );
  });
  return shell(
    <>
      {notes.length ? <p className="bma-muted bma-small" role="status">{notes.join(' ')}</p> : null}
      <div className="as-heat-facets" data-facets={heat.facets.length}>{grids}</div>
      {legend}
      {props.table === 'below' && !table ? <div className="as-heat-below">{heat.facets.map(facet => (
        <table key={facet.name} className="bma-table" data-chart-table aria-label={`${title || 'Heatmap'}${facet.name ? ': ' + facet.name : ''} as a table`}>
          <thead><tr><th scope="col">{spec.row}</th>{heat.xs.map(x => <th key={x} scope="col" className="num">{x}</th>)}</tr></thead>
          <tbody>{heat.ys.map(y => <tr key={y}><th scope="row">{y}</th>{heat.xs.map(x => { const c = facet.cells.get(cellKey(x, y)); return <td key={x} className="num">{c ? fmt(c.value) : '–'}</td>; })}</tr>)}</tbody>
        </table>))}</div> : null}
      {hover ? <div className="bma-tooltip" role="presentation" style={{ left: hover.left, top: hover.top, transform: 'translate(-50%, -120%)' }}>{hover.text}</div> : null}
    </>,
    { 'data-facets': String(heat.facets.length), 'data-picked': String(picks.picked.length) },
  );
}
