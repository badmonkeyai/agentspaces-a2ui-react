/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The sequential ramp a heatmap's cells and a hex layer's hexes share (srad/agentspaces-geo.md GEO-D-08, GEO-M-11), by
// the dataviz method: magnitude takes one hue, light to dark, and in dark mode the anchor flips (dark to light), so the
// ramp runs from the look's surface to its sequential hue (the accent when the look names none). The steps are mixed in
// OKLab, so their lightness moves evenly and only one way; a value takes the step of its fifth of the domain, so a value
// keeps its colour when a filter or a pick changes what else is drawn (the domain is every row's, not the shown ones').
export const RAMP_STEPS = 5;

type Rgb = [number, number, number];
const HEX6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function rgbOf(hex: string): Rgb | undefined {
  const m = HEX6.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : undefined;
}
const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const toSrgb = (v: number) => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };

function oklab([r8, g8, b8]: Rgb): [number, number, number] {
  const r = toLinear(r8), g = toLinear(g8), b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const hexOf = ([r, g, b]: Rgb) => '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

/**
 * The ramp's steps, from the faintest (a small value, still apart from the surface) to the hue itself, mixed in OKLab
 * between the surface and the hue. A colour that does not read falls back to a mid grey and the look's default blue.
 */
export function sequentialRamp(surface: string, hue: string, steps = RAMP_STEPS): string[] {
  const from = oklab(rgbOf(surface) ?? [255, 255, 255]);
  const to = oklab(rgbOf(hue) ?? [68, 119, 170]);
  const n = Math.max(2, Math.floor(steps));
  return Array.from({ length: n }, (_, i) => {
    const t = 0.16 + (0.84 * i) / (n - 1);
    return hexOf(fromOklab([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]));
  });
}

/** A ramp's domain: from zero (or the least value, when one is below zero) to the greatest value. */
export interface RampDomain { min: number; max: number }
export function rampDomain(values: Iterable<number>): RampDomain | undefined {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return Number.isFinite(lo) ? { min: Math.min(0, lo), max: hi } : undefined;
}

/**
 * The step a value takes in a domain: its fifth (for five steps), the greatest in the last; a domain of one value is the
 * last step, except a domain of only zero, whose values have no magnitude and take the first.
 */
export function rampStep(value: number, domain: RampDomain, steps = RAMP_STEPS): number {
  if (!Number.isFinite(value)) return 0;
  const span = domain.max - domain.min;
  if (span <= 0) return domain.max === 0 ? 0 : steps - 1;
  return Math.max(0, Math.min(steps - 1, Math.floor(((value - domain.min) / span) * steps)));
}

/** The colour a value takes on a ramp over a domain. */
export function rampColor(value: number, domain: RampDomain, ramp: readonly string[]): string {
  return ramp[rampStep(value, domain, ramp.length)] ?? ramp[ramp.length - 1] ?? '#4477aa';
}

/** The lower bound of each step, for a legend: the domain cut into equal parts. */
export function rampBounds(domain: RampDomain, steps = RAMP_STEPS): number[] {
  return Array.from({ length: steps }, (_, i) => domain.min + ((domain.max - domain.min) * i) / steps);
}

/** The look's ramp: its surface to its sequential hue, else its accent. */
export function lookRamp(color: { surface: string; sequential?: string; accent: string }): string[] {
  return sequentialRamp(color.surface, color.sequential ?? color.accent);
}
