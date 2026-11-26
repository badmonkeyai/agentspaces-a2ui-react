/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The table-to-grid logic of Visualize mark: heatmap (srad/agentspaces-geo.md GEO-D-08), with no drawing: the x
// categories across and the row categories down (the fixed orders xOrder and rowOrder when given, every one drawn even
// when no row has it; else the rows' own order), one cell per x and row of each facet, its value y (its first column)
// aggregated as aggregate says (a count when there is no y; a row whose y is empty or not a number adds no value, so a
// cell with no value is drawn as no data, never as zero, though a count still counts the row), the facets (at most
// eight; with a pick, the picked keys' rows only), and the domain of the ramp over every row, so a cell keeps its colour
// when the pick changes.
import { rampDomain, type RampDomain } from './ramp';
import type { Aggregate, Row } from './visualize';

/** The most small multiples a heatmap draws side by side. */
export const MAX_FACETS = 8;

export interface HeatSpec { x: string; row: string; value?: string; aggregate: Aggregate; xOrder?: string[]; rowOrder?: string[]; facet?: string; pickBy?: string }
export interface HeatCell { x: string; y: string; facet: string; value: number; rows: Row[] }
export interface HeatFacet { name: string; cells: Map<string, HeatCell> }
export interface Heat {
  xs: string[]; ys: string[]; facets: HeatFacet[];
  /** The facets past the eighth, left out and named. */
  left: string[];
  /** Rows whose x or row is not in a fixed order, left out and counted. */
  outside: number;
  /** The ramp's domain over every cell of every row (before the pick). */
  domain?: RampDomain;
}

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
/** A value as a number, or undefined when it is empty or does not read as one (null, '', 'n/a'): no data, not zero. */
const valueOf = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const strings = (v: unknown) => (Array.isArray(v) && v.length ? v.map(String) : undefined);
/** A cell's key in its facet. */
export const cellKey = (x: string, y: string) => x + '\u0000' + y;

/** A heatmap's spec from a Visualize's properties. */
export function heatSpecOf(p: { x?: unknown; row?: unknown; y?: unknown; aggregate?: unknown; xOrder?: unknown; rowOrder?: unknown; facet?: unknown; pick?: unknown }): HeatSpec {
  const y = Array.isArray(p.y) ? (p.y[0] === undefined ? undefined : String(p.y[0])) : typeof p.y === 'string' && p.y ? p.y : undefined;
  const aggregate = (['sum', 'mean', 'count', 'none'] as const).find(a => a === p.aggregate) ?? 'none';
  const pick = p.pick as { by?: unknown } | undefined;
  return {
    x: typeof p.x === 'string' ? p.x : '', row: typeof p.row === 'string' ? p.row : '', value: y, aggregate,
    xOrder: strings(p.xOrder), rowOrder: strings(p.rowOrder), facet: typeof p.facet === 'string' && p.facet ? p.facet : undefined,
    pickBy: pick && typeof pick === 'object' && typeof pick.by === 'string' && pick.by ? pick.by : undefined,
  };
}

/** A cell's value from its rows' values (a count counts its rows); undefined when it has no value to fold. */
function fold(values: number[], rows: number, how: Aggregate, counted: boolean): number | undefined {
  if (counted || how === 'count') return rows;
  if (!values.length) return undefined;
  if (how === 'mean') return values.reduce((a, b) => a + b, 0) / values.length;
  if (how === 'sum') return values.reduce((a, b) => a + b, 0);
  return values[values.length - 1];   // none: the last row's value
}

function cellsOf(rows: readonly Row[], spec: HeatSpec, xs: ReadonlySet<string> | undefined, ys: ReadonlySet<string> | undefined): { facets: Map<string, Map<string, { x: string; y: string; values: number[]; rows: Row[] }>>; outside: number } {
  const facets = new Map<string, Map<string, { x: string; y: string; values: number[]; rows: Row[] }>>();
  let outside = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const x = text(r[spec.x]), y = text(r[spec.row]);
    if ((xs && !xs.has(x)) || (ys && !ys.has(y))) { outside++; continue; }
    const f = spec.facet ? text(r[spec.facet]) : '';
    if (!facets.has(f)) facets.set(f, new Map());
    const cells = facets.get(f)!;
    const k = cellKey(x, y);
    if (!cells.has(k)) cells.set(k, { x, y, values: [], rows: [] });
    const c = cells.get(k)!;
    const v = spec.value ? valueOf(r[spec.value]) : 1;
    if (v !== undefined) c.values.push(v);
    c.rows.push(r);
  }
  return { facets, outside };
}

/**
 * The grid of a spec over rows: the categories, the facets of the rows the pick keeps (every row when nothing is picked
 * or the spec reads no pick), at most eight, in the rows' order (the pick set's when the facet is the pick column), and
 * the domain over every row.
 */
export function heatOf(rows: readonly Row[], spec: HeatSpec, picked: readonly string[] = []): Heat {
  const xs = spec.xOrder ? [...spec.xOrder] : [...new Set(rows.filter(r => r && typeof r === 'object').map(r => text(r[spec.x])))];
  const ys = spec.rowOrder ? [...spec.rowOrder] : [...new Set(rows.filter(r => r && typeof r === 'object').map(r => text(r[spec.row])))];
  const xSet = spec.xOrder ? new Set(xs) : undefined, ySet = spec.rowOrder ? new Set(ys) : undefined;
  const counted = !spec.value;
  const all = cellsOf(rows, spec, xSet, ySet);
  const domain = rampDomain([...all.facets.values()].flatMap(cells => [...cells.values()].map(c => fold(c.values, c.rows.length, spec.aggregate, counted) ?? NaN)));
  const pickSet = spec.pickBy && picked.length ? new Set(picked) : undefined;
  const kept = pickSet ? rows.filter(r => r && typeof r === 'object' && pickSet.has(text(r[spec.pickBy!]))) : rows;
  const shown = pickSet ? cellsOf(kept, spec, xSet, ySet) : all;
  let names = [...shown.facets.keys()];
  if (pickSet && spec.facet === spec.pickBy) names = picked.filter(k => shown.facets.has(k));
  const facets: HeatFacet[] = names.slice(0, MAX_FACETS).map(name => {
    const cells = new Map<string, HeatCell>();
    for (const [k, c] of shown.facets.get(name)!) {
      const value = fold(c.values, c.rows.length, spec.aggregate, counted);
      if (value !== undefined) cells.set(k, { x: c.x, y: c.y, facet: name, value, rows: c.rows });
    }
    return { name, cells };
  });
  return { xs, ys, facets, left: names.slice(MAX_FACETS), outside: all.outside, domain };
}

/** Whether a selected value (the clicked cell's row, as selected holds it) names this cell. */
export function selects(selected: unknown, cell: { x: string; y: string; facet: string }, spec: HeatSpec): boolean {
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return false;
  const s = selected as Row;
  return text(s[spec.x]) === cell.x && text(s[spec.row]) === cell.y && (!spec.facet || text(s[spec.facet]) === cell.facet);
}
