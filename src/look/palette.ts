/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The palette validator of the dataviz method: the six checks on a categorical palette against its surface,
// computed, never eyeballed. Colours go to OKLab (Björn Ottosson, 2020); colour-vision deficiency is simulated with the
// Machado, Oliveira, and Fernandes (2009) matrices at full severity in linear RGB; distances are OKLab ΔE × 100; the
// contrast is WCAG 2's ratio against the surface.
//
//   1 lightness band: every hue's L* within [0.35, 0.85] (light surface) or [0.45, 0.92] (dark surface)
//   2 chroma floor: every hue's chroma ≥ 0.04 (a grey is not a series colour)
//   3 adjacent-pair CVD separation: for each pair of neighbours in the fixed order, ΔE ≥ 8 under protan, deutan, and
//     tritan simulation (6 to 8 is a floor that needs a secondary encoding; the renderer always adds one)
//   4 normal-vision floor: every pair of neighbours ΔE ≥ 15 as seen (a hard fail)
//   5 contrast: every hue's contrast against the surface ≥ 3:1 (a warn obliges labels or a table view; the renderer draws both)
//   6 status apart from series: each status colour ≥ 8 ΔE from every categorical hue under normal vision

export interface PaletteCheck { check: string; ok: boolean; level: 'pass' | 'warn' | 'fail'; detail: string }
export interface PaletteReport { ok: boolean; checks: PaletteCheck[]; failures: number; warnings: number }

type Rgb = [number, number, number];
type Lab = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error('not a hex colour: ' + hex);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toLinear = (rgb: Rgb): Rgb => [linear(rgb[0]), linear(rgb[1]), linear(rgb[2])];

/** Linear sRGB to OKLab. */
export function oklab(rgb: Rgb): Lab {
  const [r, g, b] = toLinear(rgb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export const deltaE = (a: Lab, b: Lab): number => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const chroma = (lab: Lab) => Math.hypot(lab[1], lab[2]);

const CVD: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const delinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** A colour as seen with a deficiency, back in sRGB. */
export function simulate(rgb: Rgb, kind: keyof typeof CVD): Rgb {
  const lin = toLinear(rgb);
  const m = CVD[kind];
  const out = m.map(row => clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  return [delinear(out[0]), delinear(out[1]), delinear(out[2])];
}
const luminance = (rgb: Rgb) => { const [r, g, b] = toLinear(rgb); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG 2 contrast ratio. */
export function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a)); const lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The six checks over a categorical palette (and the status colours, when given) against a surface. */
export function validatePalette(categorical: string[], surface: string, status: string[] = []): PaletteReport {
  const checks: PaletteCheck[] = [];
  const dark = luminance(hexToRgb(surface)) < 0.2;
  const labs = categorical.map(h => oklab(hexToRgb(h)));
  const band: [number, number] = dark ? [0.45, 0.92] : [0.35, 0.85];
  const outOfBand = categorical.filter((_, i) => labs[i][0] < band[0] || labs[i][0] > band[1]);
  checks.push({ check: 'lightness band', ok: !outOfBand.length, level: outOfBand.length ? 'fail' : 'pass', detail: outOfBand.length ? `outside [${band}]: ${outOfBand.join(', ')}` : `every hue within [${band}]` });
  const grey = categorical.filter((_, i) => chroma(labs[i]) < 0.04);
  checks.push({ check: 'chroma floor', ok: !grey.length, level: grey.length ? 'fail' : 'pass', detail: grey.length ? `too grey: ${grey.join(', ')}` : 'every hue has chroma' });
  const cvdLow: string[] = []; const cvdFloor: string[] = [];
  for (const kind of Object.keys(CVD)) {
    const seen = categorical.map(h => oklab(simulate(hexToRgb(h), kind as keyof typeof CVD)));
    for (let i = 1; i < seen.length; i++) {
      const d = deltaE(seen[i - 1], seen[i]);
      if (d < 6) cvdLow.push(`${kind} ${categorical[i - 1]}/${categorical[i]} ${d.toFixed(1)}`);
      else if (d < 8) cvdFloor.push(`${kind} ${categorical[i - 1]}/${categorical[i]} ${d.toFixed(1)}`);
    }
  }
  checks.push({ check: 'adjacent-pair CVD separation', ok: !cvdLow.length, level: cvdLow.length ? 'fail' : cvdFloor.length ? 'warn' : 'pass',
    detail: cvdLow.length ? `under 6: ${cvdLow.join('; ')}` : cvdFloor.length ? `6 to 8 (a secondary encoding is drawn): ${cvdFloor.join('; ')}` : 'every neighbouring pair ≥ 8 under protan, deutan, tritan' });
  const normalLow: string[] = [];
  for (let i = 1; i < labs.length; i++) { const d = deltaE(labs[i - 1], labs[i]); if (d < 15) normalLow.push(`${categorical[i - 1]}/${categorical[i]} ${d.toFixed(1)}`); }
  checks.push({ check: 'normal-vision floor', ok: !normalLow.length, level: normalLow.length ? 'fail' : 'pass', detail: normalLow.length ? `under 15: ${normalLow.join('; ')}` : 'every neighbouring pair ≥ 15' });
  const lowContrast = categorical.filter(h => contrast(h, surface) < 3);
  checks.push({ check: 'contrast', ok: true, level: lowContrast.length ? 'warn' : 'pass', detail: lowContrast.length ? `under 3:1 against ${surface} (labels and a table view are drawn): ${lowContrast.join(', ')}` : `every hue ≥ 3:1 against ${surface}` });
  if (status.length) {
    const close: string[] = [];
    status.forEach(s => { const l = oklab(hexToRgb(s)); labs.forEach((c, i) => { const d = deltaE(l, c); if (d < 8) close.push(`${s}~${categorical[i]} ${d.toFixed(1)}`); }); });
    checks.push({ check: 'status apart from series', ok: !close.length, level: close.length ? 'fail' : 'pass', detail: close.length ? `a status colour reads as a series: ${close.join('; ')}` : 'every status colour ≥ 8 from every hue' });
  }
  const failures = checks.filter(c => c.level === 'fail').length;
  const warnings = checks.filter(c => c.level === 'warn').length;
  return { ok: failures === 0, checks, failures, warnings };
}

/** Both modes of a look through the validator (the dark mode against the dark surface). */
export function validateLook(look: { tokens: { color: { surface: string; categorical: string[]; status: Record<string, string> } }; dark?: { color: { surface: string; categorical: string[]; status: Record<string, string> } } }): { light: PaletteReport; dark?: PaletteReport; ok: boolean } {
  const light = validatePalette(look.tokens.color.categorical, look.tokens.color.surface, Object.values(look.tokens.color.status));
  const dark = look.dark ? validatePalette(look.dark.color.categorical, look.dark.color.surface, Object.values(look.dark.color.status)) : undefined;
  return { light, dark, ok: light.ok && (dark?.ok ?? true) };
}
