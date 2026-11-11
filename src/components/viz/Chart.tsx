/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Chart (the dataviz method): one chart of one kind over series bound to the data model. Each series'
// path holds rows; `x` and `y` name the fields of a row (defaults x and y; a heatmap's rows carry x, y, value). Hues come
// from the look in fixed order by series position, never cycled; a legend for two series or more and direct labels
// for four or fewer; thin marks with a surface gap; a hover layer with a tooltip; a table view beside it.
import { useMemo, useState } from 'react';
import { define, fmt, useData, type Ctx } from '../../renderer/implementation';
import { useLook } from '../../look/provider';
import type { ChartProps } from '../../generated/props';
import { band, compact, linear, numberOf } from '../../viz/scale';

type Row = Record<string, unknown>;
interface Series { name: string; rows: Row[]; color: string; index: number }

const W = 640, H = 260, PAD = { l: 44, r: 12, t: 12, b: 28 };

function useSeries(ctx: Ctx, props: ChartProps): Series[] {
  const { tokens } = useLook();
  const series = (props.series ?? []).slice(0, 8);
  const data = series.map(s => useData<unknown>(ctx, s.path));
  return useMemo(() => series.map((s, i) => {
    const v = data[i];
    const rows = Array.isArray(v) ? (v as Row[]) : v && typeof v === 'object' ? Object.values(v as Record<string, Row>) : [];
    const color = s.color && tokens.color.status[s.color] ? tokens.color.status[s.color] : tokens.color.categorical[i] ?? tokens.color.categorical[0];
    return { name: s.name, rows, color, index: i };
  }), [JSON.stringify(series), ...data, tokens]);
}

export const Chart = define<ChartProps>('Chart', ({ props, ctx }) => {
  const series = useSeries(ctx, props);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const xf = props.x || 'x', yf = props.y || 'y';
  const kind = props.kind;
  const categories = useMemo(() => { const out: string[] = []; series.forEach(s => s.rows.forEach(r => { const k = String(r[xf] ?? ''); if (!out.includes(k)) out.push(k); })); return out; }, [series, xf]);
  const legend = props.legend === 'always' || (props.legend !== 'never' && series.length >= 2);
  const direct = series.length <= 4;
  const onLeave = () => setHover(null);
  const title = props.title ? <div className="bma-title">{String(props.title)}{props.unit ? <span className="bma-muted bma-small"> ({String(props.unit)})</span> : null}</div> : null;
  const tableView = (
    <table className="bma-table" data-chart-table>
      <thead><tr><th>{xf}</th>{series.map(s => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
      <tbody>{categories.map(c => <tr key={c}><td>{c}</td>{series.map(s => { const r = s.rows.find(r => String(r[xf] ?? '') === c); return <td key={s.name} className="num">{r ? fmt(kind === 'heatmap' ? r.value : r[yf]) : ''}</td>; })}</tr>)}</tbody>
    </table>
  );
  if (kind === 'stat') {
    const first = series[0];
    const last = first?.rows[first.rows.length - 1];
    return <div className="bma-chart" data-component="Chart" data-kind="stat">{title}<div className="bma-stat"><span className="value">{fmt(last?.[yf])}{props.unit ? <span className="unit">{String(props.unit)}</span> : null}</span><Sparkline series={first} yf={yf} /></div></div>;
  }
  if (kind === 'sparkline') {
    return <div className="bma-chart" data-component="Chart" data-kind="sparkline">{title}{series.map(s => <Sparkline key={s.name} series={s} yf={yf} />)}</div>;
  }
  let plot;
  if (kind === 'heatmap') {
    const rows = series[0]?.rows ?? [];
    const ys = [...new Set(rows.map(r => String(r[yf] ?? '')))];
    const xs = [...new Set(rows.map(r => String(r[xf] ?? '')))];
    const values = rows.map(r => numberOf(r.value));
    const max = Math.max(1, ...values);
    const bx = band(xs, [PAD.l, W - PAD.r]); const by = band(ys, [PAD.t, H - PAD.b]);
    plot = (
      <g>
        {rows.map((r, i) => { const v = numberOf(r.value); const x = String(r[xf] ?? ''); const y = String(r[yf] ?? '');
          return <rect key={i} x={bx.x(x)} y={by.x(y)} width={bx.width} height={by.width} rx={2} fill={series[0].color} fillOpacity={0.15 + 0.85 * (v / max)}
            onMouseEnter={() => setHover({ x: bx.x(x) + bx.width / 2, y: by.x(y), text: `${x} × ${y}: ${fmt(v)}` })} onMouseLeave={onLeave}><title>{`${x} × ${y}: ${fmt(v)}`}</title></rect>; })}
        <g className="axis">{xs.map(x => <text key={x} x={bx.x(x) + bx.width / 2} y={H - PAD.b + 14} textAnchor="middle">{x}</text>)}{ys.map(y => <text key={y} x={PAD.l - 6} y={by.x(y) + by.width / 2 + 4} textAnchor="end">{y}</text>)}</g>
      </g>
    );
  } else {
    const all = series.flatMap(s => s.rows.map(r => numberOf(r[yf])));
    const y = linear([Math.min(0, ...all), Math.max(0, ...all)], [H - PAD.b, PAD.t]);
    const bx = band(categories, [PAD.l, W - PAD.r]);
    const cx = (c: string) => bx.x(c) + bx.width / 2;
    plot = (
      <g>
        <g className="grid">{y.ticks.map(t => <line key={t} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">{y.ticks.map(t => <text key={t} x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text>)}
          {categories.map((c, i) => (categories.length <= 12 || i % Math.ceil(categories.length / 12) === 0) ? <text key={c} x={cx(c)} y={H - PAD.b + 14} textAnchor="middle">{c}</text> : null)}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} /></g>
        {kind === 'bar' && series.map(s => { const n = series.length; const bw = (bx.width - 2 * (n - 1)) / n;   // a 2px surface gap between adjacent bars
          return <g key={s.name} fill={s.color}>{s.rows.map((r, i) => { const c = String(r[xf] ?? ''); const v = numberOf(r[yf]); const x0 = bx.x(c) + s.index * (bw + 2); const top = Math.min(y(v), y(0)); const h = Math.abs(y(v) - y(0));
            return <g key={i}><path d={bar(x0, top, Math.max(1, bw), h, v >= 0)} onMouseEnter={() => setHover({ x: x0 + bw / 2, y: top, text: `${s.name} · ${c}: ${fmt(v)}${props.unit ? ' ' + props.unit : ''}` })} onMouseLeave={onLeave}><title>{`${s.name} · ${c}: ${fmt(v)}`}</title></path>
              {direct && s.rows.length <= 12 ? <text className="label" x={x0 + bw / 2} y={top - 3} textAnchor="middle" fill="currentColor">{compact(v)}</text> : null}</g>; })}</g>; })}
        {(kind === 'line' || kind === 'area') && series.map(s => { const pts = s.rows.map(r => [cx(String(r[xf] ?? '')), y(numberOf(r[yf]))] as [number, number]); if (!pts.length) return null;
          const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          return <g key={s.name}>{kind === 'area' ? <path d={`${d} L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`} fill={s.color} fillOpacity={0.18} /> : null}
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={pts.length > 60 ? 0 : 4} fill={s.color} stroke="var(--bma-color-surface)" strokeWidth={2} onMouseEnter={() => setHover({ x: p[0], y: p[1], text: `${s.name} · ${String(s.rows[i][xf] ?? '')}: ${fmt(s.rows[i][yf])}` })} onMouseLeave={onLeave}><title>{`${s.name} · ${String(s.rows[i][xf] ?? '')}: ${fmt(s.rows[i][yf])}`}</title></circle>)}
            {direct ? <text className="label" x={pts[pts.length - 1][0] + 6} y={pts[pts.length - 1][1] + 4} fill={s.color}>{s.name}</text> : null}</g>; })}
        {hover ? <line className="crosshair" x1={hover.x} x2={hover.x} y1={PAD.t} y2={H - PAD.b} /> : null}
      </g>
    );
  }
  return (
    <div className="bma-chart" data-component="Chart" data-kind={kind} style={{ position: 'relative' }}>
      <div className="bma-chart-tools">{title}{props.table !== false ? <button type="button" className="bma-btn" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? 'Chart' : 'Table'}</button> : null}</div>
      {table ? tableView : <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={String(props.title ?? kind + ' chart')}>{plot}</svg>}
      {legend ? <div className="bma-legend">{series.map(s => <span key={s.name}><span className="swatch" style={{ background: s.color }} />{s.name}</span>)}</div> : null}
      {hover ? <div className="bma-tooltip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%, -120%)' }}>{hover.text}</div> : null}
    </div>
  );
});

/** A bar with its data end rounded (4px) and its baseline end square, as the method's marks are. */
function bar(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return up
    ? `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z`
    : `M${x} ${y} V${y + h - r} Q${x} ${y + h} ${x + r} ${y + h} H${x + w - r} Q${x + w} ${y + h} ${x + w} ${y + h - r} V${y} Z`;
}

function Sparkline({ series, yf }: { series?: Series; yf: string }) {
  if (!series || !series.rows.length) return null;
  const w = 120, h = 28;
  const vals = series.rows.map(r => numberOf(r[yf]));
  const y = linear([Math.min(...vals), Math.max(...vals)], [h - 2, 2]);
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${y(v).toFixed(1)}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-label={series.name + ' sparkline'}><polyline points={pts} fill="none" stroke={series.color} strokeWidth={2} /></svg>;
}
