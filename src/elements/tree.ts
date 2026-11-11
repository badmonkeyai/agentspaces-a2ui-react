/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// <agentspaces-tree>, the tree of this package: a small custom element
// over the WAI-ARIA Tree View pattern, with no dependency, so a React page and a framework-free page share one
// implementation. A host gives it the visible rows (`rows`, each a folder or a file with its depth and badges); the
// element draws only the rows in view (a virtualised list of fixed-height rows), keeps the focus on the tree with
// aria-activedescendant, and tells the host what the person did by events, so the host owns the files and their state.
//
// Keyboard (APG Tree View): Down and Up move, Home and End to the ends, Right opens a closed folder or moves into an
// open one, Left closes an open folder or moves to the parent, Enter opens a file or toggles a folder, a letter moves to
// the next row that starts with it, Shift+F10 or the ContextMenu key opens the row's menu.
//
// Events (bubbling CustomEvents, detail { id, ... }): tree-activate (a file chosen), tree-toggle { expanded } (a
// folder), tree-menu { x, y } (the row's context menu), tree-drop { files } (files dropped on a row or the tree; id is
// the row, or empty), tree-dragstart (a file dragged out, with its id in dataTransfer as application/x-agentspaces-file).

export interface TreeRow { id: string; label: string; depth: number; folder: boolean; expanded?: boolean; badges?: string[]; selected?: boolean }

/** The height of one row in pixels; the list draws the rows the viewport shows and a few more. */
export const ROW_HEIGHT = 28;
const OVERSCAN = 8;
/** The MIME type a dragged file carries its id under. */
export const FILE_DRAG = 'application/x-agentspaces-file';

export class AgentSpacesTree extends HTMLElement {
  private list: TreeRow[] = [];
  private active = '';
  private viewport?: HTMLDivElement;
  private inner?: HTMLDivElement;
  private tree?: HTMLDivElement;
  private frame = 0;
  private uid = 'as-tree-' + Math.random().toString(36).slice(2, 10);

  connectedCallback() {
    if (this.tree) return;
    this.tree = document.createElement('div');
    this.tree.className = 'as-tree-list';
    this.tree.setAttribute('role', 'tree');
    this.tree.tabIndex = 0;
    this.viewport = document.createElement('div');
    this.viewport.className = 'as-tree-viewport';
    this.inner = document.createElement('div');
    this.inner.className = 'as-tree-inner';
    this.inner.setAttribute('role', 'presentation');
    this.viewport.appendChild(this.inner);
    this.tree.appendChild(this.viewport);
    this.appendChild(this.tree);
    this.tree.setAttribute('aria-label', this.getAttribute('label') || 'Files');
    this.tree.addEventListener('keydown', e => this.onKey(e));
    this.tree.addEventListener('focus', () => { if (!this.active && this.list.length) this.focusRow(this.list[0].id); });
    this.viewport.addEventListener('scroll', () => this.schedule());
    this.tree.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); this.classList.add('as-tree-over'); } });
    this.tree.addEventListener('dragleave', () => this.classList.remove('as-tree-over'));
    this.tree.addEventListener('drop', e => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      e.stopPropagation();   // the tree tells the folder; a host that takes drops around it takes the rest
      this.classList.remove('as-tree-over');
      const row = (e.target as HTMLElement | null)?.closest?.('[data-id]') as HTMLElement | null;
      this.emit('tree-drop', { id: row?.dataset.id ?? '', files: e.dataTransfer.files });
    });
    this.draw();
  }

  static get observedAttributes() { return ['label']; }
  attributeChangedCallback() { this.tree?.setAttribute('aria-label', this.getAttribute('label') || 'Files'); }

  /** The visible rows, in order. */
  set rows(rows: TreeRow[]) {
    this.list = Array.isArray(rows) ? rows : [];
    if (this.active && !this.list.some(r => r.id === this.active)) this.active = this.list[0]?.id ?? '';
    this.draw();
  }
  get rows(): TreeRow[] { return this.list; }

  /** The row that has the focus. */
  get activeId(): string { return this.active; }

  /** Moves the focus to a row, scrolls it into view, and tells the host. */
  focusRow(id: string) {
    const i = this.list.findIndex(r => r.id === id);
    if (i < 0) return;
    this.active = id;
    const vp = this.viewport;
    if (vp) {
      const height = vp.clientHeight || 420;
      const top = i * ROW_HEIGHT;
      if (top < vp.scrollTop) vp.scrollTop = top;
      else if (top + ROW_HEIGHT > vp.scrollTop + height) vp.scrollTop = top + ROW_HEIGHT - height;
    }
    this.draw();
  }

  private emit(name: string, detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  private schedule() {
    if (this.frame || typeof requestAnimationFrame === 'undefined') { if (!this.frame) this.draw(); return; }
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  /** Draws the rows in view: the inner box is as tall as every row, so the scroll bar tells the whole length. */
  private draw() {
    if (!this.inner || !this.tree || !this.viewport) return;
    const height = this.viewport.clientHeight || 420;
    const first = Math.max(0, Math.floor(this.viewport.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(this.list.length, Math.ceil((this.viewport.scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
    this.inner.style.height = this.list.length * ROW_HEIGHT + 'px';
    const rows: HTMLElement[] = [];
    for (let i = first; i < last; i++) rows.push(this.rowOf(this.list[i], i));
    // the focused row is always in the DOM, so aria-activedescendant names an element even before the scroll lands
    const at = this.list.findIndex(r => r.id === this.active);
    if (at >= 0 && (at < first || at >= last)) rows.push(this.rowOf(this.list[at], at));
    this.inner.replaceChildren(...rows);
    this.tree.setAttribute('aria-activedescendant', this.active && this.list.some(r => r.id === this.active) ? this.domId(this.active) : '');
  }

  private domId(id: string) { return this.uid + '-' + encodeURIComponent(id).replace(/%/g, '_'); }

  private rowOf(r: TreeRow, i: number): HTMLElement {
    const row = document.createElement('div');
    row.id = this.domId(r.id);
    row.className = 'as-tree-row' + (r.id === this.active ? ' as-tree-active' : '') + (r.folder ? ' as-tree-folder' : ' as-tree-file');
    row.dataset.id = r.id;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(r.depth + 1));
    row.setAttribute('aria-setsize', String(this.siblings(i).length));
    row.setAttribute('aria-posinset', String(this.siblings(i).indexOf(i) + 1));
    if (r.folder) row.setAttribute('aria-expanded', String(r.expanded !== false));
    else row.setAttribute('aria-selected', String(Boolean(r.selected)));
    row.style.top = i * ROW_HEIGHT + 'px';
    row.style.height = ROW_HEIGHT + 'px';
    row.style.paddingLeft = 8 + r.depth * 16 + 'px';
    const twist = document.createElement('span');
    twist.className = 'as-tree-twist';
    twist.setAttribute('aria-hidden', 'true');
    twist.textContent = r.folder ? (r.expanded !== false ? '▾' : '▸') : '';
    const name = document.createElement('span');
    name.className = 'as-tree-name';
    name.textContent = r.label;
    row.append(twist, name);
    for (const b of r.badges ?? []) {
      const badge = document.createElement('span');
      badge.className = 'bma-pill as-tree-badge as-badge-' + b.split(':')[0].split(' ')[0];
      badge.textContent = b;
      row.appendChild(badge);
    }
    row.addEventListener('click', () => { this.active = r.id; this.tree?.focus(); this.activate(r); });
    row.addEventListener('contextmenu', e => { e.preventDefault(); this.active = r.id; this.draw(); this.emit('tree-menu', { id: r.id, x: e.clientX, y: e.clientY }); });
    if (!r.folder) {
      row.draggable = true;
      row.addEventListener('dragstart', e => { e.dataTransfer?.setData(FILE_DRAG, r.id); e.dataTransfer?.setData('text/plain', r.label); this.emit('tree-dragstart', { id: r.id }); });
    }
    return row;
  }

  /** The indexes of a row's siblings: the rows of its depth under the same parent. */
  private siblings(i: number): number[] {
    const depth = this.list[i].depth;
    let start = i;
    while (start > 0 && this.list[start - 1].depth >= depth) start--;
    const out: number[] = [];
    for (let k = start; k < this.list.length && this.list[k].depth >= depth; k++) if (this.list[k].depth === depth) out.push(k);
    return out;
  }

  private activate(r: TreeRow) {
    if (r.folder) this.emit('tree-toggle', { id: r.id, expanded: r.expanded === false });
    else this.emit('tree-activate', { id: r.id });
  }

  private onKey(e: KeyboardEvent) {
    const i = this.list.findIndex(r => r.id === this.active);
    const r = this.list[i];
    const move = (k: number) => { if (this.list[k]) this.focusRow(this.list[k].id); };
    switch (e.key) {
      case 'ArrowDown': move(i < 0 ? 0 : Math.min(this.list.length - 1, i + 1)); break;
      case 'ArrowUp': move(i < 0 ? 0 : Math.max(0, i - 1)); break;
      case 'Home': move(0); break;
      case 'End': move(this.list.length - 1); break;
      case 'ArrowRight':
        if (r?.folder && r.expanded === false) this.emit('tree-toggle', { id: r.id, expanded: true });
        else if (r?.folder && this.list[i + 1]?.depth === r.depth + 1) move(i + 1);
        break;
      case 'ArrowLeft':
        if (r?.folder && r.expanded !== false) this.emit('tree-toggle', { id: r.id, expanded: false });
        else if (r && r.depth > 0) { let k = i - 1; while (k >= 0 && this.list[k].depth >= r.depth) k--; move(k); }
        break;
      case 'Enter': case ' ': if (r) this.activate(r); break;
      case 'ContextMenu': if (r) this.emit('tree-menu', { id: r.id, x: 0, y: 0 }); break;
      case 'F10': if (e.shiftKey && r) this.emit('tree-menu', { id: r.id, x: 0, y: 0 }); else return; break;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const ch = e.key.toLowerCase();
        for (let n = 1; n <= this.list.length; n++) {
          const k = (Math.max(0, i) + n) % this.list.length;
          if (this.list[k].label.toLowerCase().startsWith(ch)) { move(k); break; }
        }
      }
    }
    e.preventDefault();
  }
}

/** Defines <agentspaces-tree> once per window. */
export function defineTree(): void {
  if (typeof customElements !== 'undefined' && !customElements.get('agentspaces-tree')) customElements.define('agentspaces-tree', AgentSpacesTree);
}
