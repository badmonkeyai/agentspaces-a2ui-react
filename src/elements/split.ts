/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// <agentspaces-split>, the panel split of this package: a
// small custom element over the WAI-ARIA Window Splitter pattern, with no dependency, so a React page and a
// framework-free page share one implementation. Its light DOM children with slot="pane-0" to "pane-2" are the panes; the
// element draws the separators and the rails in its shadow root and sets only the panes' sizes, so a framework that
// owns the children never meets a node it did not make.
//
//   orientation   horizontal (side by side, the default) or vertical (one over another)
//   panes         JSON: [{ id, size, min, collapsible, label }], two or three
//   persist       the key the browser keeps the sizes and the collapsed panes under (localStorage), empty for none
//   stack-below   below this width in pixels the panes stack, 0 never
//
// Keyboard on a separator: the arrows move it by 5 percent (Shift for 1), Home and End to the limits, Enter collapses
// the pane before it when it collapses (or the one after) and opens it again. A collapsed pane is a rail with its name; a
// press on the rail opens it. Dragging a separator writes only the panes' flex basis, once per animation frame.

export interface PaneSpec { id: string; size: number; min?: number; collapsible?: boolean; label?: string }
interface Kept { sizes: number[]; collapsed: boolean[] }

const STYLE = `
:host { display: flex; width: 100%; min-height: 0; box-sizing: border-box; }
:host([orientation="vertical"]) { flex-direction: column; }
:host([stacked]) { flex-direction: column; }
.pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; flex: 1 1 0; }
.pane[data-collapsed] > slot { display: none; }
.rail { display: none; font: inherit; font-size: var(--bma-font-s, 13px); color: inherit; background: transparent; border: 1px solid var(--bma-color-line, #8a8a8a);
  border-radius: var(--bma-radius, 4px); min-width: 32px; min-height: 32px; padding: 4px; cursor: pointer; }
.pane[data-collapsed] { flex: 0 0 auto !important; }
.pane[data-collapsed] > .rail { display: block; writing-mode: vertical-rl; }
:host([orientation="vertical"]) .pane[data-collapsed] > .rail, :host([stacked]) .pane[data-collapsed] > .rail { writing-mode: horizontal-tb; }
.sep { flex: 0 0 8px; cursor: col-resize; position: relative; touch-action: none; outline: none; }
.sep::after { content: ''; position: absolute; inset: 0 3px; background: var(--bma-color-line, #8a8a8a); border-radius: 1px; }
:host([orientation="vertical"]) .sep { cursor: row-resize; }
:host([orientation="vertical"]) .sep::after { inset: 3px 0; }
.sep:focus-visible::after { background: var(--bma-color-accent, #2f5bd3); inset: 0 2px; }
:host([orientation="vertical"]) .sep:focus-visible::after { inset: 2px 0; }
:host([stacked]) .sep { display: none; }
`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class AgentSpacesSplit extends HTMLElement {
  static get observedAttributes() { return ['panes', 'orientation', 'persist', 'stack-below']; }
  private root: ShadowRoot;
  private specs: PaneSpec[] = [];
  private sizes: number[] = [];
  private collapsed: boolean[] = [];
  private observer?: ResizeObserver;
  private frame = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.build();
    if (typeof ResizeObserver !== 'undefined' && !this.observer) {
      this.observer = new ResizeObserver(() => this.stack());
      this.observer.observe(this);
    }
    this.stack();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.build();
  }

  /** The panes' current shares (0 to 1), in order. */
  get paneSizes(): number[] { return [...this.sizes]; }
  /** Which panes are collapsed to their rails. */
  get paneCollapsed(): boolean[] { return [...this.collapsed]; }

  private get vertical() { return this.getAttribute('orientation') === 'vertical'; }
  private get key() { const p = this.getAttribute('persist'); return p ? 'agentspaces-split:' + p : ''; }

  private build() {
    let specs: PaneSpec[] = [];
    try { specs = JSON.parse(this.getAttribute('panes') || '[]'); } catch { specs = []; }
    this.specs = specs.slice(0, 3);
    const total = this.specs.reduce((a, p) => a + (Number(p.size) > 0 ? Number(p.size) : 0), 0) || 1;
    this.sizes = this.specs.map(p => (Number(p.size) > 0 ? Number(p.size) : 1 / this.specs.length) / total);
    this.collapsed = this.specs.map(() => false);
    const kept = this.read();
    if (kept && kept.sizes.length === this.specs.length) { this.sizes = kept.sizes; this.collapsed = kept.collapsed.map((c, i) => c && Boolean(this.specs[i].collapsible)); }
    const parts: string[] = [`<style>${STYLE}</style>`];
    this.specs.forEach((p, i) => {
      if (i > 0) parts.push(`<div class="sep" role="separator" tabindex="0" data-index="${i - 1}"></div>`);
      parts.push(`<div class="pane" part="pane" data-index="${i}"><button type="button" class="rail" part="rail" aria-expanded="false"></button><slot name="pane-${i}"></slot></div>`);
    });
    this.root.innerHTML = parts.join('');
    this.root.querySelectorAll<HTMLElement>('.rail').forEach((rail, i) => {
      rail.textContent = this.specs[i].label || this.specs[i].id;
      rail.setAttribute('aria-label', 'Open ' + (this.specs[i].label || this.specs[i].id));
      rail.addEventListener('click', () => this.toggle(i));
    });
    this.root.querySelectorAll<HTMLElement>('.sep').forEach(sep => {
      const i = Number(sep.dataset.index);
      sep.setAttribute('aria-orientation', this.vertical ? 'horizontal' : 'vertical');
      sep.setAttribute('aria-label', `Resize ${this.specs[i].label || this.specs[i].id} and ${this.specs[i + 1].label || this.specs[i + 1].id}`);
      sep.setAttribute('aria-valuemin', '0');
      sep.setAttribute('aria-valuemax', '100');
      sep.addEventListener('keydown', e => this.onKey(e, i));
      sep.addEventListener('pointerdown', e => this.onDrag(e, i, sep));
    });
    this.apply();
  }

  private onKey(e: KeyboardEvent, i: number) {
    const step = e.shiftKey ? 0.01 : 0.05;
    const back = this.vertical ? 'ArrowUp' : 'ArrowLeft';
    const forward = this.vertical ? 'ArrowDown' : 'ArrowRight';
    if (e.key === back) this.move(i, -step);
    else if (e.key === forward) this.move(i, step);
    else if (e.key === 'Home') this.move(i, -1);
    else if (e.key === 'End') this.move(i, 1);
    else if (e.key === 'Enter') { const target = this.specs[i].collapsible ? i : this.specs[i + 1].collapsible ? i + 1 : -1; if (target >= 0) this.toggle(target); }
    else return;
    e.preventDefault();
  }

  private onDrag(e: PointerEvent, i: number, sep: HTMLElement) {
    if (e.button !== 0) return;
    e.preventDefault();
    sep.focus();
    try { sep.setPointerCapture(e.pointerId); } catch { /* a synthetic event has no capture */ }
    const box = this.getBoundingClientRect();
    const length = (this.vertical ? box.height : box.width) || 1;
    let last = this.vertical ? e.clientY : e.clientX;
    const move = (m: PointerEvent) => {
      const at = this.vertical ? m.clientY : m.clientX;
      const delta = (at - last) / length;
      last = at;
      if (!delta) return;
      this.move(i, delta, false);
      if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.apply(); });
    };
    const up = () => { sep.removeEventListener('pointermove', move); sep.removeEventListener('pointerup', up); sep.removeEventListener('pointercancel', up); this.apply(); this.keep(); };
    sep.addEventListener('pointermove', move);
    sep.addEventListener('pointerup', up);
    sep.addEventListener('pointercancel', up);
  }

  /** Moves separator i by a share of the whole, inside both panes' minimums; applies and keeps unless told not to. */
  private move(i: number, delta: number, commit = true) {
    const box = this.getBoundingClientRect();
    const length = (this.vertical ? box.height : box.width) || 0;
    const floor = (p: PaneSpec) => (length > 0 && p.min ? p.min / length : 0.05);
    const pair = this.sizes[i] + this.sizes[i + 1];
    const a = clamp(this.sizes[i] + delta, Math.min(floor(this.specs[i]), pair / 2), pair - Math.min(floor(this.specs[i + 1]), pair / 2));
    this.sizes[i] = a;
    this.sizes[i + 1] = pair - a;
    if (commit) { this.apply(); this.keep(); }
  }

  /** Collapses pane i to its rail, or opens it again. */
  toggle(i: number) {
    if (!this.specs[i]?.collapsible) return;
    this.collapsed[i] = !this.collapsed[i];
    this.apply();
    this.keep();
    this.dispatchEvent(new CustomEvent('agentspaces-split-change', { detail: { sizes: this.paneSizes, collapsed: this.paneCollapsed }, bubbles: true }));
  }

  private apply() {
    const panes = this.root.querySelectorAll<HTMLElement>('.pane');
    const open = this.sizes.reduce((a, s, i) => a + (this.collapsed[i] ? 0 : s), 0) || 1;
    panes.forEach((pane, i) => {
      if (this.collapsed[i]) pane.setAttribute('data-collapsed', '');
      else pane.removeAttribute('data-collapsed');
      pane.style.flex = this.collapsed[i] ? '' : `${(this.sizes[i] / open).toFixed(4)} 1 0`;
      const rail = pane.querySelector('.rail');
      rail?.setAttribute('aria-expanded', String(!this.collapsed[i]));
      const p = this.specs[i];
      if (p?.min && !this.hasAttribute('stacked')) pane.style[this.vertical ? 'minHeight' : 'minWidth'] = this.collapsed[i] ? '' : p.min + 'px';
    });
    this.root.querySelectorAll<HTMLElement>('.sep').forEach(sep => {
      const i = Number(sep.dataset.index);
      const share = this.sizes[i] / ((this.sizes[i] + this.sizes[i + 1]) || 1);
      sep.setAttribute('aria-valuenow', String(Math.round(share * 100)));
      sep.setAttribute('aria-valuetext', `${this.specs[i].label || this.specs[i].id} ${Math.round(this.sizes[i] * 100)} percent`);
    });
  }

  private stack() {
    const below = Number(this.getAttribute('stack-below') || 0);
    const width = this.getBoundingClientRect().width;
    if (below > 0 && width > 0 && width < below) this.setAttribute('stacked', '');
    else this.removeAttribute('stacked');
  }

  private read(): Kept | undefined {
    if (!this.key || typeof localStorage === 'undefined') return undefined;
    // a kept value is the browser's to lose: one that is not a list of positive shares and of flags is ignored
    try {
      const v = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (!v || !Array.isArray(v.sizes) || !Array.isArray(v.collapsed) || !v.sizes.every((x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0)) return undefined;
      const total = (v.sizes as number[]).reduce((a, x) => a + x, 0);
      return { sizes: (v.sizes as number[]).map(x => x / total), collapsed: (v.collapsed as unknown[]).map(c => c === true) };
    } catch { return undefined; }
  }

  private keep() {
    if (!this.key || typeof localStorage === 'undefined') return;
    try { localStorage.setItem(this.key, JSON.stringify({ sizes: this.sizes.map(s => Number(s.toFixed(4))), collapsed: this.collapsed })); } catch { /* storage full or off: the view is the browser's, never the fabric's */ }
  }
}

/** Defines <agentspaces-split> once per window. */
export function defineSplit(): void {
  if (typeof customElements !== 'undefined' && !customElements.get('agentspaces-split')) customElements.define('agentspaces-split', AgentSpacesSplit);
}
