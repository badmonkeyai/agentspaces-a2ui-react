/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The row filter a DataTable's rowFilter and a GeoMap layer's filter share (srad/agentspaces-geo.md GEO-M-12): keep
// the rows whose columns equal the value at a data model path. An object there is compared column by column on the match
// columns it holds (a heatmap's selected writes the clicked cell's row, so a layer filtered on [d, h] or on slot follows
// the clicked hour); a key or a list of keys is compared with the first match column. A missing, null, blank or empty
// value (and an object that holds none of the match columns) keeps every row. Values compare as text, so 9 matches "9".

/** A filter as a design gives it: the path whose value the rows must match, and the columns compared. */
export interface RowFilter { path: string; match: string[] }

/** A filter from a component's property, or nothing when it does not read. */
export function rowFilterOf(v: unknown): RowFilter | undefined {
  const f = v as { path?: unknown; match?: unknown } | null | undefined;
  if (!f || typeof f !== 'object' || typeof f.path !== 'string' || !f.path.startsWith('/')) return undefined;
  const match = typeof f.match === 'string' ? [f.match] : Array.isArray(f.match) ? f.match.filter((c): c is string => typeof c === 'string' && c !== '') : [];
  return match.length && match.every(Boolean) ? { path: f.path, match } : undefined;
}

const scalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean';

/**
 * The test a row passes, given the value at the filter's path, or nothing when the value keeps every row. A row is read
 * through get(column), so a GeoFeature's columns can be its properties, then its id, kind and label.
 */
export function rowTest(value: unknown, match: readonly string[]): ((get: (column: string) => unknown) => boolean) | undefined {
  if (value === undefined || value === null || !match.length) return undefined;
  if (Array.isArray(value)) {
    const keys = new Set(value.filter(scalar).map(String));
    if (!keys.size) return undefined;
    return get => { const v = get(match[0]); return scalar(v) && keys.has(String(v)); };
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const pairs = match.filter(c => scalar(o[c])).map(c => [c, String(o[c])] as const);
    if (!pairs.length) return undefined;
    return get => pairs.every(([c, want]) => { const v = get(c); return scalar(v) && String(v) === want; });
  }
  if (!scalar(value) || (typeof value === 'string' && !value.trim())) return undefined;
  const want = String(value);
  return get => { const v = get(match[0]); return scalar(v) && String(v) === want; };
}

/** The rows a filter keeps, with the value at its path: every row when the value keeps all. */
export function filterRows<T extends Record<string, unknown>>(rows: readonly T[], filter: RowFilter | undefined, value: unknown): T[] {
  const test = filter ? rowTest(value, filter.match) : undefined;
  return test ? rows.filter(r => r && typeof r === 'object' && test(c => r[c])) : [...rows];
}
