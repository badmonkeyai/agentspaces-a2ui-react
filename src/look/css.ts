/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The look and feel as CSS variables: the tokens of one mode become --bma-* variables for our components
// and the --a2ui-* variables the basic catalog's components read, on the element that wraps the surfaces. A customer's
// page may call cssVariables() and put the result on any element, or stylesheet() for a <style> block.
import type { LookAndFeel, ModeTokens } from '../generated/look';

/** The default look: the Bad Monkey colours, validated by the palette check. */
export const DEFAULT_LOOK: LookAndFeel = {
  schemaVersion: 1, id: 'bad-monkey', name: 'Bad Monkey',
  tokens: {
    color: {
      surface: '#F5F3EC', ink: '#22242B', inkMuted: '#60616B', accent: '#666699',
      // the eight hues and the four status colours were snapped to passing steps by the six checks (test/palette-cases.json)
      categorical: ['#9C4246', '#228A8F', '#A16D40', '#0D76AD', '#728426', '#635A93', '#3D8E53', '#804F7C'],
      sequential: '#635A93', diverging: { warm: '#A16D40', neutral: '#B7B2BD', cool: '#0D76AD' },
      status: { good: '#146720', warning: '#786107', serious: '#7F4413', critical: '#E24947' },
    },
    type: { family: 'DM Sans', scale: [12, 14, 16, 20, 28] }, space: { unit: 8, density: 'comfortable' }, radius: 4, shadow: 'soft',
  },
  dark: {
    color: {
      surface: '#1E1F26', ink: '#ECEAF2', inkMuted: '#B3B1BC', accent: '#A9A2D6',
      categorical: ['#5DDAE0', '#DA8282', '#53A3F2', '#CA924C', '#BF9BFC', '#B9D162', '#F4A8DB', '#59B387'],
      sequential: '#BF9BFC', diverging: { warm: '#CA924C', neutral: '#8B8894', cool: '#53A3F2' },
      status: { good: '#2AAF3D', warning: '#E7AD01', serious: '#EE5E23', critical: '#F05653' },
    },
    type: { family: 'DM Sans', scale: [12, 14, 16, 20, 28] }, space: { unit: 8, density: 'comfortable' }, radius: 4, shadow: 'none',
  },
  texture: { fill: 'diagonal' },
};

/** The tokens of the mode asked for (dark falls back to light when the look has no dark mode). */
export function modeTokens(look: LookAndFeel | undefined, mode: 'light' | 'dark'): ModeTokens {
  const l = look ?? DEFAULT_LOOK;
  return mode === 'dark' && l.dark ? l.dark : l.tokens;
}

/** A hex colour with an alpha, as rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** The CSS variables of one mode: ours and the basic catalog's. */
export function cssVariables(look: LookAndFeel | undefined, mode: 'light' | 'dark' = 'light'): Record<string, string> {
  const t = modeTokens(look, mode);
  const c = t.color;
  const unit = t.space?.unit ?? 8;
  const dense = t.space?.density === 'compact';
  const scale = t.type?.scale?.length ? t.type.scale : [12, 14, 16, 20, 28];
  const family = (t.type?.family ?? 'DM Sans').replace(/[^A-Za-z0-9 ,'-]/g, '');
  const v: Record<string, string> = {
    '--bma-color-surface': c.surface, '--bma-color-ink': c.ink, '--bma-color-ink-muted': c.inkMuted ?? c.ink, '--bma-color-accent': c.accent,
    '--bma-color-line': withAlpha(c.ink, 0.18), '--bma-color-grid': withAlpha(c.ink, 0.08), '--bma-color-card': withAlpha(c.ink, 0.03),
    '--bma-color-sequential': c.sequential ?? c.accent,
    '--bma-color-diverging-warm': c.diverging?.warm ?? c.categorical[1], '--bma-color-diverging-neutral': c.diverging?.neutral ?? (c.inkMuted ?? c.ink), '--bma-color-diverging-cool': c.diverging?.cool ?? c.categorical[0],
    '--bma-color-good': c.status.good, '--bma-color-warning': c.status.warning, '--bma-color-serious': c.status.serious, '--bma-color-critical': c.status.critical,
    '--bma-font-family': `'${family}', system-ui, sans-serif`, '--bma-font-mono': "'DM Mono', ui-monospace, monospace",
    '--bma-font-xs': `${scale[0]}px`, '--bma-font-s': `${scale[1]}px`, '--bma-font-m': `${scale[2]}px`, '--bma-font-l': `${scale[3]}px`, '--bma-font-xl': `${scale[4] ?? scale[3]}px`,
    '--bma-space-unit': `${unit}px`, '--bma-space-s': `${dense ? unit / 2 : unit}px`, '--bma-space-m': `${dense ? unit : unit * 2}px`, '--bma-space-l': `${dense ? unit * 2 : unit * 3}px`,
    '--bma-radius': `${t.radius ?? 4}px`,
    '--bma-shadow': t.shadow === 'strong' ? `4px 5px 0 ${withAlpha(c.ink, 0.9)}` : t.shadow === 'none' ? 'none' : `0 1px 3px ${withAlpha(c.ink, 0.18)}`,
    '--bma-texture': `repeating-linear-gradient(45deg, transparent 0 3px, ${withAlpha(c.ink, 0.25)} 3px 4px)`,
    // the basic catalog's variables
    '--a2ui-color-background': c.surface, '--a2ui-color-on-background': c.ink, '--a2ui-color-surface': c.surface, '--a2ui-color-on-surface': c.ink,
    '--a2ui-color-primary': c.accent, '--a2ui-color-on-primary': c.surface, '--a2ui-color-primary-hover': withAlpha(c.accent, 0.85), '--a2ui-color-primary-light': withAlpha(c.accent, 0.2), '--a2ui-color-primary-dark': c.accent,
    '--a2ui-color-secondary': c.inkMuted ?? c.ink, '--a2ui-color-on-secondary': c.surface, '--a2ui-color-secondary-hover': withAlpha(c.inkMuted ?? c.ink, 0.85), '--a2ui-color-secondary-light': withAlpha(c.inkMuted ?? c.ink, 0.2), '--a2ui-color-secondary-dark': c.inkMuted ?? c.ink,
    '--a2ui-color-border': withAlpha(c.ink, 0.18), '--a2ui-color-input': c.surface, '--a2ui-color-on-input': c.ink,
    '--a2ui-font-family-title': `'${family}', system-ui, sans-serif`, '--a2ui-font-family-monospace': "'DM Mono', ui-monospace, monospace",
    '--a2ui-font-size': `${scale[2]}px`, '--a2ui-font-size-xs': `${scale[0]}px`, '--a2ui-font-size-s': `${scale[1]}px`, '--a2ui-font-size-m': `${scale[2]}px`, '--a2ui-font-size-l': `${scale[3]}px`, '--a2ui-font-size-xl': `${scale[4] ?? scale[3]}px`, '--a2ui-font-size-2xl': `${(scale[4] ?? scale[3]) * 1.3}px`,
    '--a2ui-grid-base': `${unit}px`, '--a2ui-spacing-xs': `${unit / 2}px`, '--a2ui-spacing-s': `${unit}px`, '--a2ui-spacing-m': `${dense ? unit : unit * 2}px`, '--a2ui-spacing-l': `${unit * 3}px`, '--a2ui-spacing-xl': `${unit * 4}px`,
    '--a2ui-border-radius': `${t.radius ?? 4}px`, '--a2ui-border-width': '1px', '--a2ui-border': `1px solid ${withAlpha(c.ink, 0.18)}`,
  };
  for (let i = 0; i < 8; i++) v[`--bma-cat-${i + 1}`] = c.categorical[i] ?? c.categorical[c.categorical.length - 1];
  return v;
}

/** The variables as a stylesheet block for a selector (a customer's page: `<style>{stylesheet(look)}</style>`). */
export function stylesheet(look: LookAndFeel | undefined, selector = ':root'): string {
  const light = Object.entries(cssVariables(look, 'light')).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const dark = Object.entries(cssVariables(look, 'dark')).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `${selector} {\n${light}\n}\n${selector}[data-mode="dark"] {\n${dark}\n}\n`;
}
