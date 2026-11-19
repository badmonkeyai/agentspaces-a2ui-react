/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The table-to-chart logic of agentspaces-viz/Visualize (srad/agentspaces-geo.md §3.4, GEO-D-01, D-02, D-04), with no
// drawing: a spec read from a component's properties, the columns it names that the table lacks, the series (one per y
// column, or one per value of the color column), aggregated per x and sorted, with hues from the look in fixed order and a
// ninth series folded into Other, and the spec a table's "Chart this" guesses from its columns.
import { numberOf } from './scale';

export type Mark = 'bar' | 'column' | 'line' | 'area' | 'scatter' | 'table';
export type Aggregate = 'sum' | 'mean' | 'count' | 'none';
export interface VisualSpec { mark: Mark; x: string; y: string[]; color?: string; aggregate: Aggregate; sort?: string }
export type Row = Record<string, unknown>;
export interface VPoint { x: string; xValue: number; y: number; n: number }
export interface VSeries { name: string; color: string; points: VPoint[]; total: number }

const MARKS: readonly Mark[] = ['bar', 'column', 'line', 'area', 'scatter', 'table'];
const AGGREGATES: readonly Aggregate[] = ['sum', 'mean', 'count', 'none'];
/** The most series a chart draws in their own hue; past it the rest fold into Other (the dataviz method). */
export const MAX_SERIES = 8;
export const OTHER = 'Other';

/** The spec of a Visualize from its properties: the mark (column by default), x, the y columns, color, aggregate, sort. */
export function specOf(p: { mark?: unknown; x?: unknown; y?: unknown; color?: unknown; aggregate?: unknown; sort?: unknown }): VisualSpec {
  const mark = MARKS.includes(p.mark as Mark) ? (p.mark as Mark) : 'column';
  const y = Array.isArray(p.y) ? p.y.map(String).filter(Boolean) : typeof p.y === 'string' && p.y ? [p.y] : [];
  return {
    mark, x: typeof p.x === 'string' ? p.x : '', y, color: typeof p.color === 'string' && p.color ? p.color : undefined,
    aggregate: AGGREGATES.includes(p.aggregate as Aggregate) ? (p.aggregate as Aggregate) : 'none', sort: typeof p.sort === 'string' && p.sort ? p.sort : undefined,
  };
}

/** The columns a spec names that no row of the table has (count needs no y). */
export function missingColumns(rows: readonly Row[], spec: VisualSpec): string[] {
  if (!rows.length) return [];
  const has = (c: string) => rows.some(r => r && Object.prototype.hasOwnProperty.call(r, c));
  const named = [spec.x, ...(spec.aggregate === 'count' ? [] : spec.y), ...(spec.color ? [spec.color] : [])];
  return [...new Set(named.filter(c => c && !has(c)))];
}

const isNumberLike = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

function fold(values: number[], how: Aggregate): number {
  if (how === 'count') return values.length;
  if (how === 'mean') return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  if (how === 'sum') return values.reduce((a, b) => a + b, 0);
  return values[values.length - 1] ?? 0;   // none: the last row's value for an x
}

/**
 * The categories and the series of a spec over a table. Without a color column each y column is a series; with one, each
 * value of it is a series of the first y column. Each series holds one point per x (aggregated), except a scatter, which
 * keeps every row. Hues come in fixed order from the look; past eight series the rest fold into Other (summed).
 */
export function seriesOf(rows: readonly Row[], spec: VisualSpec, hues: readonly string[]): { categories: string[]; series: VSeries[] } {
  const groups = new Map<string, Map<string, number[]>>();
  const xs: string[] = [];
  const add = (series: string, x: string, v: number) => {
    if (!groups.has(series)) groups.set(series, new Map());
    const g = groups.get(series)!;
    if (!g.has(x)) g.set(x, []);
    g.get(x)!.push(v);
  };
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const x = r[spec.x] === undefined || r[spec.x] === null ? '' : String(r[spec.x]);
    if (spec.mark !== 'scatter' && !xs.includes(x)) xs.push(x);
    if (spec.color) {
      const name = r[spec.color] === undefined || r[spec.color] === null ? '' : String(r[spec.color]);
      add(name, x, spec.aggregate === 'count' ? 1 : numberOf(r[spec.y[0]]));
    } else if (spec.y.length) {
      spec.y.forEach(y => add(y, x, spec.aggregate === 'count' ? 1 : numberOf(r[y])));
    } else {
      add('count', x, 1);
    }
  }
  const how: Aggregate = spec.y.length === 0 && !spec.color ? 'count' : spec.aggregate;
  let named = [...groups.keys()];
  // a ninth series folds into Other: the first seven in their own hues (in the order they came), the rest summed. The
  // fold is the last entry, found by its place rather than its name, since a column may hold a real value 'Other'; then
  // the fold takes a name of its own, so the two stay apart (and so do their React keys).
  let foldInto: Set<string> | undefined;
  if (named.length > MAX_SERIES) {
    foldInto = new Set(named.slice(MAX_SERIES - 1));
    const kept = named.slice(0, MAX_SERIES - 1);
    let other = OTHER;
    while (kept.includes(other)) other += ' (rest)';
    named = [...kept, other];
  }
  const series: VSeries[] = named.map((name, i) => {
    const folded = Boolean(foldInto) && i === named.length - 1;
    const sources = folded ? [...foldInto!] : [name];
    const points: VPoint[] = [];
    if (spec.mark === 'scatter') {
      for (const s of sources) for (const [x, vs] of groups.get(s) ?? []) for (const v of vs) points.push({ x, xValue: numberOf(x), y: v, n: 1 });
    } else {
      for (const x of xs) {
        const vs = sources.flatMap(s => groups.get(s)?.get(x) ?? []);
        if (!vs.length) continue;
        points.push({ x, xValue: numberOf(x), y: folded ? vs.reduce((a, b) => a + b, 0) : fold(vs, how), n: vs.length });
      }
    }
    return { name: name === '' ? '(blank)' : name, color: hues[i % Math.max(1, hues.length)] ?? '#4477aa', points, total: points.reduce((a, p) => a + p.y, 0) };
  });
  const categories = sortCategories(xs, series, spec.sort, spec.x);
  // each series' points in the categories' order, so a line or an area runs left to right across a sorted axis (the
  // points came in the rows' order); a scatter keeps its rows
  if (spec.mark !== 'scatter') {
    const at = new Map(categories.map((c, i) => [c, i]));
    for (const s of series) s.points.sort((a, b) => at.get(a.x)! - at.get(b.x)!);
  }
  return { categories, series };
}

/** The categories in the sort's order: x or the x column by name, y by the categories' totals; a leading - descends. */
export function sortCategories(xs: readonly string[], series: readonly VSeries[], sort: string | undefined, xColumn: string): string[] {
  if (!sort) return [...xs];
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const out = [...xs];
  if (key === 'x' || key === xColumn) {
    const numeric = out.every(isNumberLike);
    out.sort((a, b) => (numeric ? numberOf(a) - numberOf(b) : a.localeCompare(b)));
  } else {
    const total = (x: string) => series.reduce((sum, s) => sum + (s.points.find(p => p.x === x)?.y ?? 0), 0);
    out.sort((a, b) => total(a) - total(b));
  }
  return desc ? out.reverse() : out;
}

/**
 * The spec a table's "Chart this" guesses (GEO-D-04): x is the first column whose values are mostly text, y the number
 * columns (at most four, so each keeps a direct label); a column chart, or a line when x reads as time.
 */
export function guessSpec(columns: readonly string[], rows: readonly Row[]): VisualSpec | undefined {
  const sample = rows.slice(0, 50);
  const numeric = (c: string) => { const vs = sample.map(r => r?.[c]).filter(v => v !== undefined && v !== null && v !== ''); return vs.length > 0 && vs.filter(isNumberLike).length / vs.length >= 0.8; };
  const x = columns.find(c => !numeric(c));
  const y = columns.filter(c => c !== x && numeric(c)).slice(0, 4);
  if (!x || !y.length) return undefined;
  const time = sample.length > 0 && sample.every(r => typeof r?.[x] === 'string' && /^\d{4}-\d{2}(-\d{2})?/.test(String(r[x])));
  return { mark: time ? 'line' : 'column', x, y, aggregate: 'none' };
}
