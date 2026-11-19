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

/** A label's width at a font size, estimated: a chart draws in its viewBox's units, so the estimate holds at any width. */
export const textWidth = (text: string, px: number) => text.length * px * 0.62;

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The longest a category's label runs before it is cut with an ellipsis (its full text stays in the marks' tooltips). */
export const AXIS_LABEL_MAX = 24;

/** One label on an x axis: the category's index, its words, and where it is drawn (x, and the text's anchor). */
export interface AxisTick { index: number; label: string; x: number; anchor: 'start' | 'middle' | 'end' }

/**
 * The x axis's labels over categories drawn at centre(i) along a range: as many as fit without two overlapping (an even
 * stride over the candidates, each label kept inside the range, at least gap apart). Categories that all read as times
 * (YYYY-MM-DD, with an hh:mm after it or not) are labelled by day when they cover more than one day, a candidate at each
 * day's first category ("Nov 7"; with the year when they cover more than one), and by hh:mm within one day; any other
 * category is labelled as it is, cut at AXIS_LABEL_MAX. The words are read from the text, so a time zone never shifts a day.
 */
export function axisTicks(categories: readonly string[], centre: (i: number) => number, range: [number, number], px = 11, gap = 8): { ticks: AxisTick[]; time?: 'day' | 'time' } {
  if (!categories.length) return { ticks: [] };
  const times = categories.map(c => TIME_RE.exec(c));
  let candidates: Array<{ index: number; label: string }>;
  let time: 'day' | 'time' | undefined;
  if (times.every(Boolean)) {
    const day = (m: RegExpExecArray) => `${m[1]}-${m[2]}-${m[3]}`;
    const days = new Set(times.map(m => day(m!)));
    const years = new Set(times.map(m => m![1]));
    const dayLabel = (m: RegExpExecArray) => `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}${years.size > 1 ? ' ' + m[1] : ''}`;
    if (days.size > 1 || times.every(m => !m![4])) {
      time = 'day';
      candidates = times.map((m, i) => ({ m: m!, i })).filter(({ m, i }) => i === 0 || day(m) !== day(times[i - 1]!)).map(({ m, i }) => ({ index: i, label: dayLabel(m) }));
    } else {
      time = 'time';
      candidates = times.map((m, i) => ({ index: i, label: `${m![4]}:${m![5]}` }));
    }
  } else {
    candidates = categories.map((c, i) => ({ index: i, label: c.length > AXIS_LABEL_MAX ? c.slice(0, AXIS_LABEL_MAX - 1) + '…' : c }));
  }
  const [lo, hi] = range;
  const place = (c: { index: number; label: string }): AxisTick & { left: number; right: number } => {
    const w = textWidth(c.label, px), x = centre(c.index);
    if (x - w / 2 < lo) return { ...c, x: lo, anchor: 'start', left: lo, right: lo + w };
    if (x + w / 2 > hi) return { ...c, x: hi, anchor: 'end', left: hi - w, right: hi };
    return { ...c, x, anchor: 'middle', left: x - w / 2, right: x + w / 2 };
  };
  const placed = candidates.map(place);
  for (let k = 1; k <= placed.length; k++) {
    const shown = placed.filter((_, j) => j % k === 0);
    if (shown.every((t, j) => j === 0 || t.left >= shown[j - 1].right + gap)) return { ticks: shown.map(({ index, label, x, anchor }) => ({ index, label, x, anchor })), time };
  }
  const { index, label, x, anchor } = placed[0];
  return { ticks: [{ index, label, x, anchor }], time };
}
