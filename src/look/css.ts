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

/** A font stack from a look's family list ("Geist, DM Sans"): each name quoted, then the generic fallbacks. */
function fontStack(family: string | undefined, fallback: string, generic: string): string {
  const names = (family ?? fallback).replace(/[^A-Za-z0-9 ,'-]/g, '').split(',').map(n => n.replace(/'/g, '').trim()).filter(Boolean);
  return [...(names.length ? names : [fallback]).map(n => `'${n}'`), generic].join(', ');
}

/** True when a hex colour is dark (relative luminance under a half): a dark surface takes deeper overlay shadows. */
function isDark(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const lin = (x: string) => { const v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]) < 0.5;
}

/** A colour mixed toward transparent: a soft tint for a selected row, a status pill or a pressed button. */
function soft(hex: string, percent: number): string {
  return `color-mix(in srgb, ${hex} ${percent}%, transparent)`;
}

/** The CSS variables of one mode: ours and the basic catalog's. */
export function cssVariables(look: LookAndFeel | undefined, mode: 'light' | 'dark' = 'light'): Record<string, string> {
  const t = modeTokens(look, mode);
  const c = t.color;
  const unit = t.space?.unit ?? 8;
  const dense = t.space?.density === 'compact';
  const scale = t.type?.scale?.length ? t.type.scale : [12, 14, 16, 20, 28];
  const sans = fontStack(t.type?.family, 'DM Sans', 'system-ui, sans-serif');
  const mono = fontStack(t.type?.mono, 'DM Mono', 'ui-monospace, monospace');
  const radius = t.radius ?? 4;
  const line = c.line ?? withAlpha(c.ink, 0.18);
  const panel = c.panel ?? withAlpha(c.ink, 0.03);
  const accentInk = c.accentInk ?? c.surface;
  const v: Record<string, string> = {
    '--bma-color-surface': c.surface, '--bma-color-ink': c.ink, '--bma-color-ink-muted': c.inkMuted ?? c.ink, '--bma-color-accent': c.accent,
    '--bma-color-line': line, '--bma-color-grid': withAlpha(c.ink, 0.08), '--bma-color-card': panel,
    // the line, ink and accent roles of 0.7.0: a stronger line, the faintest ink, the ink on the accent; then soft tints
    // mixed from the accent and the status colours. A look without the roles draws exactly as before.
    '--bma-color-line-strong': c.lineStrong ?? withAlpha(c.ink, 0.3), '--bma-color-ink-faint': c.inkFaint ?? (c.inkMuted ?? c.ink), '--bma-color-accent-ink': accentInk,
    '--bma-color-accent-soft': soft(c.accent, 12),
    '--bma-color-good-soft': soft(c.status.good, 11), '--bma-color-warning-soft': soft(c.status.warning, 11), '--bma-color-serious-soft': soft(c.status.serious, 11), '--bma-color-critical-soft': soft(c.status.critical, 11),
    // the optional roles of a look (2026-11-11): the top bar, panels, fields, buttons, highlights, information; each
    // falls back to what a look without it draws
    '--bma-color-bar': c.bar ?? c.surface, '--bma-color-panel': panel, '--bma-color-field': c.field ?? c.surface,
    // the text on a button's fill: a look that names its button draws its ink there; without one the fill is the accent,
    // and the ink on the accent reads there (the page's ink on the accent failed contrast, GEO-Q-31's axe run)
    '--bma-color-button': c.button ?? c.accent, '--bma-color-button-ink': c.button ? c.ink : accentInk, '--bma-color-highlight': c.highlight ?? withAlpha(c.accent, 0.15), '--bma-color-highlight-ink': c.highlightInk ?? c.accent,
    '--bma-color-info': c.info ?? (c.inkMuted ?? c.ink),
    '--bma-color-sequential': c.sequential ?? c.accent,
    '--bma-color-diverging-warm': c.diverging?.warm ?? c.categorical[1], '--bma-color-diverging-neutral': c.diverging?.neutral ?? (c.inkMuted ?? c.ink), '--bma-color-diverging-cool': c.diverging?.cool ?? c.categorical[0],
    '--bma-color-good': c.status.good, '--bma-color-warning': c.status.warning, '--bma-color-serious': c.status.serious, '--bma-color-critical': c.status.critical,
    '--bma-font-family': sans, '--bma-font-mono': mono,
    '--bma-font-xs': `${scale[0]}px`, '--bma-font-s': `${scale[1]}px`, '--bma-font-m': `${scale[2]}px`, '--bma-font-l': `${scale[3]}px`, '--bma-font-xl': `${scale[4] ?? scale[3]}px`,
    '--bma-space-unit': `${unit}px`, '--bma-space-s': `${dense ? unit / 2 : unit}px`, '--bma-space-m': `${dense ? unit : unit * 2}px`, '--bma-space-l': `${dense ? unit * 2 : unit * 3}px`,
    '--bma-space-xs': `${unit / 2}px`, '--bma-space-xl': `${unit * 4}px`,
    '--bma-radius': `${radius}px`, '--bma-radius-l': `${Math.round(radius * 1.6)}px`,
    '--bma-shadow': t.shadow === 'strong' ? `4px 5px 0 ${withAlpha(c.ink, 0.9)}` : t.shadow === 'none' ? 'none' : `0 1px 3px ${withAlpha(c.ink, 0.18)}`,
    // a floating window or menu, and a card lifted on hover; a look that asks for no shadow gets none
    '--bma-shadow-overlay': t.shadow === 'none' ? 'none' : isDark(c.surface) ? '0 12px 40px rgba(0, 0, 0, 0.35)' : '0 12px 32px rgba(0, 0, 0, 0.12)',
    '--bma-shadow-raise': t.shadow === 'none' ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.18)',
    '--bma-ease': 'cubic-bezier(.2, .8, .2, 1)',
    '--bma-texture': `repeating-linear-gradient(45deg, transparent 0 3px, ${withAlpha(c.ink, 0.25)} 3px 4px)`,
    // the basic catalog's variables
    '--a2ui-color-background': c.surface, '--a2ui-color-on-background': c.ink, '--a2ui-color-surface': c.surface, '--a2ui-color-on-surface': c.ink,
    '--a2ui-color-primary': c.accent, '--a2ui-color-on-primary': accentInk, '--a2ui-color-primary-hover': withAlpha(c.accent, 0.85), '--a2ui-color-primary-light': withAlpha(c.accent, 0.2), '--a2ui-color-primary-dark': c.accent,
    '--a2ui-color-secondary': c.inkMuted ?? c.ink, '--a2ui-color-on-secondary': c.surface, '--a2ui-color-secondary-hover': withAlpha(c.inkMuted ?? c.ink, 0.85), '--a2ui-color-secondary-light': withAlpha(c.inkMuted ?? c.ink, 0.2), '--a2ui-color-secondary-dark': c.inkMuted ?? c.ink,
    '--a2ui-color-border': line, '--a2ui-color-input': c.field ?? c.surface, '--a2ui-color-on-input': c.ink,
    '--a2ui-font-family-title': sans, '--a2ui-font-family-monospace': mono,
    '--a2ui-font-size': `${scale[2]}px`, '--a2ui-font-size-xs': `${scale[0]}px`, '--a2ui-font-size-s': `${scale[1]}px`, '--a2ui-font-size-m': `${scale[2]}px`, '--a2ui-font-size-l': `${scale[3]}px`, '--a2ui-font-size-xl': `${scale[4] ?? scale[3]}px`, '--a2ui-font-size-2xl': `${(scale[4] ?? scale[3]) * 1.3}px`,
    '--a2ui-grid-base': `${unit}px`, '--a2ui-spacing-xs': `${unit / 2}px`, '--a2ui-spacing-s': `${unit}px`, '--a2ui-spacing-m': `${dense ? unit : unit * 2}px`, '--a2ui-spacing-l': `${unit * 3}px`, '--a2ui-spacing-xl': `${unit * 4}px`,
    '--a2ui-border-radius': `${radius}px`, '--a2ui-border-width': '1px', '--a2ui-border': `1px solid ${line}`,
    // the basic catalog's card, button and tabs (web_core reads these before its own defaults): a card is a panel with a
    // hairline and no shadow in flow; a button is the secondary recipe; a tab is muted ink, the current one ink
    '--a2ui-card-background': panel, '--a2ui-card-border': `1px solid ${line}`, '--a2ui-card-border-radius': `${Math.round(radius * 1.6)}px`,
    '--a2ui-card-padding': `${dense ? unit : unit * 2}px`, '--a2ui-card-margin': `${dense ? unit / 2 : unit}px`, '--a2ui-card-box-shadow': 'none',
    '--a2ui-button-background': c.field ?? c.surface, '--a2ui-button-border': `1px solid ${line}`, '--a2ui-button-border-radius': `${radius}px`,
    '--a2ui-button-padding': `${unit / 2}px ${unit * 1.5}px`, '--a2ui-button-margin': `${unit / 2}px`, '--a2ui-button-box-shadow': 'none', '--a2ui-button-font-weight': '500',
    '--a2ui-tabs-border': `1px solid ${line}`, '--a2ui-tabs-header-background': 'transparent', '--a2ui-tabs-header-background-active': 'transparent',
    '--a2ui-tabs-header-color': c.inkMuted ?? c.ink, '--a2ui-tabs-header-color-active': c.ink, '--a2ui-tabs-content-padding': `${dense ? unit : unit * 2}px 0`,
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
