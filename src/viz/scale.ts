/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// Scales and ticks for the SVG charts: a linear scale with "nice" ticks, a band scale for categories, and a time or
// category x from the rows' x field.
export interface Linear { (v: number): number; domain: [number, number]; ticks: number[] }

export function linear(domain: [number, number], range: [number, number], tickCount = 5): Linear {
  let [d0, d1] = domain;
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) { d0 = 0; d1 = 1; }
  if (d0 === d1) { d1 = d0 + 1; }
  const step = niceStep((d1 - d0) / Math.max(1, tickCount));
  const lo = Math.floor(d0 / step) * step;
  const hi = Math.ceil(d1 / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  const f = ((v: number) => range[0] + ((v - lo) / (hi - lo || 1)) * (range[1] - range[0])) as Linear;
  f.domain = [lo, hi];
  f.ticks = ticks;
  return f;
}

export function niceStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
}

/** A band per category over a range: the start of each band and its width (with a gap of 2px between bars, the method's spacer). */
export function band(categories: string[], range: [number, number]): { x: (c: string) => number; width: number; step: number } {
  const n = Math.max(1, categories.length);
  const step = (range[1] - range[0]) / n;
  const index = new Map(categories.map((c, i) => [c, i]));
  return { x: c => range[0] + (index.get(c) ?? 0) * step + step * 0.1, width: step * 0.8, step };
}

/** The x value of a row as a label and a number for ordering (ISO dates as time, numbers as they are, strings as their index). */
export function xOf(row: Record<string, unknown>, field: string): { label: string; value: unknown } {
  const v = row[field];
  return { label: v === undefined || v === null ? '' : String(v), value: v };
}

export function numberOf(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Compact number for a tick or a label: 1200 as 1.2k. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
