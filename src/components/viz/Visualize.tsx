/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Visualize (srad/agentspaces-geo.md §3.4, GEO-D-01 to D-03, D-05): a chart of a bound table by a small
// spec, with Chart's scales and marks. One value axis; a legend for two series or more and direct labels for four or
// fewer; hues from the look in fixed order, a ninth series folded into Other; a tooltip on every mark and a crosshair with
// each series' value on a line or an area; a table view (a toggle, or below). A spec that names a column the table lacks
// says so instead of drawing an empty chart. The x axis shows as many of its labels as fit without overlapping (a time
// axis by day over several days, by hh:mm within one: ../../viz/scale's axisTicks); a lone series carries no direct label,
// since its name is a column's and the title already says what is drawn.
import { useMemo, useState, type MouseEvent } from 'react';
import { define, fmt, useData } from '../../renderer/implementation';
import { useLook } from '../../look/provider';
import type { VisualizeProps } from '../../generated/props';
import { axisTicks, band, compact, linear } from '../../viz/scale';
import { missingColumns, seriesOf, specOf, type VSeries, type VisualSpec } from '../../viz/visualize';
import { bar } from './Chart';

const W = 640, H = 280, PAD = { l: 48, r: 16, t: 14, b: 30 };

export const Visualize = define<VisualizeProps>('Visualize', ({ props, ctx }) => {
  const { tokens } = useLook();
  const path = typeof props.rows === 'string' ? props.rows : undefined;
  const bound = useData<unknown>(ctx, path);
  // the rows: a list, or a map's values; nothing bound yet is loading, and any other value does not read (GEO-Q-31)
  const rows = useMemo(() => (Array.isArray(bound) ? bound : bound && typeof bound === 'object' ? Object.values(bound) : []) as Record<string, unknown>[], [bound]);
  const state = path && bound === undefined ? 'loading' : path && (!bound || typeof bound !== 'object') ? 'error' : undefined;
  const spec = useMemo(() => specOf(props), [props.mark, props.x, JSON.stringify(props.y), props.color, props.aggregate, props.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  return <VisualizeView spec={spec} rows={rows} hues={tokens.color.categorical} title={props.title} unit={props.unit} tableMode={props.table === 'below' ? 'below' : 'toggle'}
    state={state} path={path} />;
});

/** The drawing of a spec over rows, shared by Visualize and a table's "Chart this". */
export function VisualizeView({ spec, rows, hues, title, unit, tableMode = 'toggle', onClose, state, path }: { spec: VisualSpec; rows: readonly Record<string, unknown>[]; hues: readonly string[];
  title?: string; unit?: string; tableMode?: 'toggle' | 'below'; onClose?: () => void;
  /** The bound table not arrived yet, or a value at its path that is no table; a table's "Chart this" passes neither. */
  state?: 'loading' | 'error'; path?: string }) {
  const [table, setTable] = useState(spec.mark === 'table');
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const missing = useMemo(() => missingColumns(rows, spec), [rows, spec]);
  const { categories, series } = useMemo(() => seriesOf(rows, spec, hues), [rows, spec, hues]);
  const legend = series.length >= 2;
  const direct = series.length <= 4;
  const u = unit ? ' ' + unit : '';
  const head = (
    <div className="bma-chart-tools">
      {title ? <div className="bma-title">{title}{unit ? <span className="bma-muted bma-small"> ({unit})</span> : null}</div> : null}
      {tableMode === 'toggle' && spec.mark !== 'table' ? <button type="button" className="bma-btn" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? 'Chart' : 'Table'}</button> : null}
      {onClose ? <button type="button" className="bma-btn" onClick={onClose}>Rows</button> : null}
    </div>
  );
  if (state === 'loading') return <div className="bma-chart as-visualize" data-component="Visualize" data-mark={spec.mark} data-state="loading">{head}<p className="bma-muted" aria-busy="true">Loading the rows…</p></div>;
  if (state === 'error') {
    return <div className="bma-chart as-visualize" data-component="Visualize" data-mark={spec.mark} data-state="error">{head}<p role="note">Unavailable: the rows at {path} do not read as a table.</p></div>;
  }
  if (missing.length) {
    return <div className="bma-chart as-visualize" data-component="Visualize" data-mark={spec.mark}>{head}<p className="bma-muted" role="status">{missing.map(c => `No column ${c} in the table.`).join(' ')}</p></div>;
  }
  if (!rows.length) return <div className="bma-chart as-visualize" data-component="Visualize" data-mark={spec.mark}>{head}<p className="bma-muted">No rows yet.</p></div>;
  const tableView = <TableOf categories={categories} series={series} x={spec.x} scatter={spec.mark === 'scatter'} />;
  const plot = spec.mark === 'table' ? null : plotOf(spec, categories, series, direct, u, setHover);
  return (
    <div className="bma-chart as-visualize" data-component="Visualize" data-mark={spec.mark} style={{ position: 'relative' }}>
      {head}
      {table && tableMode === 'toggle' ? tableView : plot ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title || `${spec.mark} chart of ${spec.y.join(', ') || 'count'} by ${spec.x}`}
          onMouseMove={e => (spec.mark === 'line' || spec.mark === 'area') && setHover(crosshair(e, categories, series, spec.x, u))} onMouseLeave={() => setHover(null)}>
          {plot}
          {hover && (spec.mark === 'line' || spec.mark === 'area') ? <line className="crosshair" x1={hover.x} x2={hover.x} y1={PAD.t} y2={H - PAD.b} /> : null}
        </svg>
      ) : tableView}
      {legend && spec.mark !== 'table' ? <div className="bma-legend">{series.map(s => <span key={s.name}><span className="swatch" style={{ background: s.color }} />{s.name}</span>)}</div> : null}
      {tableMode === 'below' && spec.mark !== 'table' ? tableView : null}
      {hover ? <div className="bma-tooltip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%, -120%)' }}>{hover.lines.map((l, i) => <div key={i}>{l}</div>)}</div> : null}
    </div>
  );
}

type Hover = { x: number; y: number; lines: string[] } | null;

/** The crosshair of a line or an area: the category under the pointer, its x and each series' y. */
function crosshair(e: MouseEvent<SVGSVGElement>, categories: string[], series: VSeries[], xName: string, u: string): Hover {
  const box = e.currentTarget.getBoundingClientRect();
  if (!box.width || !categories.length) return null;
  const px = ((e.clientX - box.left) / box.width) * W;
  const bx = band(categories, [PAD.l, W - PAD.r]);
  const i = Math.max(0, Math.min(categories.length - 1, Math.floor((px - PAD.l) / bx.step)));
  const c = categories[i];
  return { x: bx.x(c) + bx.width / 2, y: PAD.t + 8, lines: [`${xName} ${c}`, ...series.map(s => `${s.name}: ${fmt(s.points.find(p => p.x === c)?.y ?? '')}${u}`)] };
}

function plotOf(spec: VisualSpec, categories: string[], series: VSeries[], direct: boolean, u: string, setHover: (h: Hover) => void) {
  const leave = () => setHover(null);
  const all = series.flatMap(s => s.points.map(p => p.y));
  if (spec.mark === 'scatter') {
    const xsv = series.flatMap(s => s.points.map(p => p.xValue));
    const sx = linear([Math.min(...xsv), Math.max(...xsv)], [PAD.l, W - PAD.r]);
    const sy = linear([Math.min(0, ...all), Math.max(0, ...all)], [H - PAD.b, PAD.t]);
    return (
      <g>
        <g className="grid">{sy.ticks.map(t => <line key={t} x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />)}</g>
        <g className="axis">{sy.ticks.map(t => <text key={t} x={PAD.l - 6} y={sy(t) + 4} textAnchor="end">{compact(t)}</text>)}{sx.ticks.map(t => <text key={t} x={sx(t)} y={H - PAD.b + 14} textAnchor="middle">{compact(t)}</text>)}</g>
        {series.map(s => <g key={s.name}>{s.points.map((p, i) => {
          const text = `${s.name} · ${spec.x} ${p.x}: ${fmt(p.y)}${u}`;
          return <circle key={i} cx={sx(p.xValue)} cy={sy(p.y)} r={5} fill={s.color} stroke="var(--bma-color-surface)" strokeWidth={2}
            onMouseEnter={() => setHover({ x: sx(p.xValue), y: sy(p.y), lines: [text] })} onMouseLeave={leave}><title>{text}</title></circle>;
        })}</g>)}
      </g>
    );
  }
  const y = linear([Math.min(0, ...all), Math.max(0, ...all)], spec.mark === 'bar' ? [PAD.l + 60, W - PAD.r] : [H - PAD.b, PAD.t]);
  if (spec.mark === 'bar') {
    // horizontal: the categories down the side, the values along one axis
    const by = band(categories, [PAD.t, H - PAD.b]);
    const n = series.length, bh = Math.max(1, (by.width - 2 * (n - 1)) / n);
    return (
      <g>
        <g className="grid">{y.ticks.map(t => <line key={t} x1={y(t)} x2={y(t)} y1={PAD.t} y2={H - PAD.b} />)}</g>
        <g className="axis">{y.ticks.map(t => <text key={t} x={y(t)} y={H - PAD.b + 14} textAnchor="middle">{compact(t)}</text>)}
          {categories.map(c => <text key={c} x={PAD.l + 54} y={by.x(c) + by.width / 2 + 4} textAnchor="end">{c}</text>)}<line x1={y(0)} x2={y(0)} y1={PAD.t} y2={H - PAD.b} /></g>
        {series.map((s, si) => <g key={s.name} fill={s.color}>{s.points.map(p => {
          const top = by.x(p.x) + si * (bh + 2), x0 = Math.min(y(p.y), y(0)), w = Math.abs(y(p.y) - y(0)), text = `${s.name} · ${p.x}: ${fmt(p.y)}${u}`;
          return <g key={p.x}><rect x={x0} y={top} width={Math.max(1, w)} height={bh} rx={Math.min(4, bh / 2)} onMouseEnter={() => setHover({ x: x0 + w, y: top, lines: [text] })} onMouseLeave={leave}><title>{text}</title></rect>
            {direct && categories.length <= 12 ? <text className="label" x={x0 + w + 4} y={top + bh / 2 + 4} fill="currentColor">{compact(p.y)}</text> : null}</g>;
        })}</g>)}
      </g>
    );
  }
  const bx = band(categories, [PAD.l, W - PAD.r]);
  const cx = (c: string) => bx.x(c) + bx.width / 2;
  const xTicks = axisTicks(categories, i => cx(categories[i]), [2, W - 2]);
  // a direct label names a series: a lone series' name is only its column's, which the title already says
  const named = direct && series.length >= 2;
  return (
    <g>
      <g className="grid">{y.ticks.map(t => <line key={t} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />)}</g>
      <g className="axis">{y.ticks.map(t => <text key={t} x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text>)}
        <g className="x-ticks" data-time={xTicks.time}>{xTicks.ticks.map(t => <text key={t.index} x={t.x} y={H - PAD.b + 14} textAnchor={t.anchor}>{t.label}</text>)}</g>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} /></g>
      {spec.mark === 'column' && series.map((s, si) => { const n = series.length; const bw = Math.max(1, (bx.width - 2 * (n - 1)) / n);
        return <g key={s.name} fill={s.color}>{s.points.map(p => { const x0 = bx.x(p.x) + si * (bw + 2); const top = Math.min(y(p.y), y(0)); const h = Math.abs(y(p.y) - y(0)); const text = `${s.name} · ${p.x}: ${fmt(p.y)}${u}`;
          return <g key={p.x}><path d={bar(x0, top, bw, h, p.y >= 0)} onMouseEnter={() => setHover({ x: x0 + bw / 2, y: top, lines: [text] })} onMouseLeave={leave}><title>{text}</title></path>
            {direct && categories.length <= 12 ? <text className="label" x={x0 + bw / 2} y={top - 3} textAnchor="middle" fill="currentColor">{compact(p.y)}</text> : null}</g>; })}</g>; })}
      {(spec.mark === 'line' || spec.mark === 'area') && series.map(s => { const pts = s.points.map(p => [cx(p.x), y(p.y)] as [number, number]); if (!pts.length) return null;
        const d = pts.map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
        return <g key={s.name}>{spec.mark === 'area' ? <path d={`${d} L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`} fill={s.color} fillOpacity={0.18} /> : null}
          <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
          {pts.map((pt, i) => { const text = `${s.name} · ${s.points[i].x}: ${fmt(s.points[i].y)}${u}`; return <circle key={i} cx={pt[0]} cy={pt[1]} r={pts.length > 60 ? 2 : 4} fill={s.color} stroke="var(--bma-color-surface)" strokeWidth={2}><title>{text}</title></circle>; })}
          {named ? <text className="label" x={pts[pts.length - 1][0] + 6} y={pts[pts.length - 1][1] + 4} fill={s.color}>{s.name}</text> : null}</g>; })}
    </g>
  );
}

/** The table view: one row per category, one column per series (a scatter lists its points). */
function TableOf({ categories, series, x, scatter }: { categories: string[]; series: VSeries[]; x: string; scatter: boolean }) {
  if (scatter) {
    return (
      <table className="bma-table" data-chart-table>
        <thead><tr><th>series</th><th>{x}</th><th className="num">value</th></tr></thead>
        <tbody>{series.flatMap(s => s.points.map((p, i) => <tr key={s.name + i}><td>{s.name}</td><td>{p.x}</td><td className="num">{fmt(p.y)}</td></tr>))}</tbody>
      </table>
    );
  }
  return (
    <table className="bma-table" data-chart-table>
      <thead><tr><th>{x}</th>{series.map(s => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
      <tbody>{categories.map(c => <tr key={c}><td>{c}</td>{series.map(s => <td key={s.name} className="num">{fmt(s.points.find(p => p.x === c)?.y ?? '')}</td>)}</tr>)}</tbody>
    </table>
  );
}
