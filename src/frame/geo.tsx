/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The GeoLayout (srad/agentspaces-geo.md §3.3, GEO-L-01 to L-08): a page that follows objects in the world.
//   layout { kind: geo, map, kicker, windows: [{ page, label, icon, open, dock }] }
// One top bar (the app's title, the map's search and the page's tools in its first row, each window as a chip that opens
// and closes it in a row of its own below, its label under its icon),
// the map's surface full screen under it, and each window's surface as a card over the map. A person drags a window by
// its header, resizes it from its corner (at least 240 x 160), folds it to its header, closes it, and opens it again
// from the bar; a click raises it. A window opens docked to a side (left, right, bottom; two on one side stack) or free,
// and a drag frees it. Each window's place, size, fold and open state are kept per app in the browser. F6 moves between
// the bar, the map and each open window. Below 900 px the windows are sheets over the map, one at a time. The map's
// search draws in the bar, and the map opens the selected feature's details as a window of its own (GeoFrame), so a
// design names neither. Every surface stays mounted, so a closed window keeps its stream and its drafts. The kicker,
// optional, is a short line above the title in the bar. The stage carries --as-dock-left, --as-dock-right and
// --as-dock-bottom (px; 0px when nothing docks there) so an overlay on the map can sit clear of the docked windows.
// The layout fills exactly the viewport and nothing in it scrolls but a window's body (and the lists in it): the page
// under it never scrolls, so neither the bar nor the map's foot can be pushed off screen. Every window fits the stage:
// a column that cannot hold its windows shares out what it has, a window wider or taller than the stage is cut to it,
// and a free window is kept inside it. A window holding a table opens at least TABLE_MIN_W wide (wider when the table
// needs it, up to TABLE_MAX_W), and tall enough for its rows (its content's height, up to TABLE_MAX_H_SHARE of the
// stage), unless the person resized it. The details window the map opens docks at the foot of the right column, no
// taller than its content, so it never covers a right window's content and leaves the others the rest of the column.
// The frame tells the map how far the docked windows reach in (insets), so a fly-to or a fit lands its subject in the
// part of the map the windows leave visible.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useBarClaim } from './frame';
import { Icon, ICONS } from './icons';

/** A layout's kicker above the bar's title: its words when it has some, else nothing. */
export function kickerOf(kicker: unknown): ReactNode {
  return typeof kicker === 'string' && kicker.trim() ? <small className="as-kicker">{kicker.trim()}</small> : null;
}

export type Dock = 'left' | 'right' | 'bottom' | 'free';
export interface GeoWindowSpec { page: string; label: string; icon?: string; open?: boolean; dock?: Dock }
export interface GeoLayout {
  kind: 'geo'; map: string; windows: GeoWindowSpec[];
  /** A short line above the app's title in the bar (a section, a place, a mode). */
  kicker?: string;
}

/** Where a window is and how it is: kept per app and window in the browser. */
export interface WindowState { open: boolean; folded: boolean; dock: Dock; x: number; y: number; w: number; h: number; z: number; sized?: boolean }

/** The least a window is resized to (GEO-L-03). */
export const MIN_W = 240;
export const MIN_H = 160;
/** Below this width the windows are sheets, one at a time (GEO-L-07). */
export const NARROW_PX = 900;
/** The least width a window holding a table opens at, and the most it widens to for a wide table. */
export const TABLE_MIN_W = 640;
export const TABLE_MAX_W = 960;
/** The most of the stage's height a window holding a table grows to, to show its rows. */
export const TABLE_MAX_H_SHARE = 0.55;
/** The least height a window keeps when its column must share out a stage too short for them all (a head and a line). */
export const FIT_MIN_H = 80;
/** A folded window's height: its head. */
const HEAD_H = 36;
const GAP = 8;
/** The most keys the pick set holds (the look's eight categorical hues). */
const MAX_PICKS = 8;
/** The details window's key among the windows (the map opens it, useDetailsWindow). */
export const DETAILS = 'details';

/** What the GeoLayout gives the surfaces it draws: the bar's search slot and the layer the map opens its details in. */
export interface GeoFrame {
  /** The element in the bar a FeatureSearch draws into. */
  searchSlot: HTMLElement | null;
  /** The layer over the map a GeoMap opens its selected feature's details window in. */
  detailsSlot: HTMLElement | null;
  /** The key the browser keeps the windows under (the app). */
  persist: string;
  /** The map stage's size, for a window's default place. */
  stage: { width: number; height: number };
  /** Whether the windows are sheets (below 900 px). */
  narrow: boolean;
  /** Asks the layout's map to select a feature and fly to it (a watchbox's row, from another window). */
  focus(id: string): void;
  /** The map listens for focus; returns the unsubscribe. */
  onFocus(listener: (id: string) => void): () => void;
  /** The areas the windows watch, which the map draws. */
  overlays: readonly GeoOverlay[];
  /** Adds, replaces or (with nothing) removes a window's area on the map. */
  setOverlay(key: string, overlay: Omit<GeoOverlay, 'key'> | undefined): void;
  /**
   * The z a window the map opens (the details) takes to sit above the layout's windows: its own when it is already above
   * them, else one more than the topmost. The layout's windows then raise above it in turn, so both share one order.
   */
  raiseOver?(z: number): number;
  /**
   * The details window tells the layout its state while it shows (nothing when it closes), so the layout docks it in the
   * right column with the others rather than over them.
   */
  setDetails?(state: WindowState | undefined): void;
  /** Where the layout docks the details window, while it shows docked. */
  detailsAt?: DockedPlace;
  /** The details window tells the layout its content's height, so the layout docks it no taller (0 when unknown). */
  fitDetails?(needH: number): void;
  /**
   * How far in from each side of the stage the open docked windows reach (dockInsets, px): the map pads a fly-to and a
   * fit by them, so its subject lands where no window covers it.
   */
  insets?: { left: number; right: number; bottom: number };
  /**
   * The pick set of the layout's map (srad/agentspaces-geo.md GEO-M-09): the ordered keys, at most eight, a person
   * picked; held here, in the browser's memory only, so every window's table and the map read the same set.
   */
  picked?: readonly string[];
  /** Sets the pick set, and the words the map's polite live region says of the change (its own words when none are given). */
  setPicked?(keys: readonly string[], said?: string): void;
  /** The words said of the last change of the pick set, and a count that tells two equal sayings apart. */
  pickSaid?: { text: string; seq: number };
  /** A select table tells the layout the keys its rows hold (nothing when it goes), so a watchbox's pick keeps to them. */
  listKeys?(source: string, keys: readonly string[] | undefined): void;
  /** The keys the select tables of the layout hold, or nothing when no select table is drawn. */
  listed?(): ReadonlySet<string> | undefined;
}

/** A docked window's place, its height, and its width where the stage made it narrower than its own. */
export interface DockedPlace { x: number; y: number; h?: number; w?: number }

/**
 * Bounds on the height a docked window in a column takes of what the column shares out: at least min (a window holding a
 * table, for its rows) and at most max (the details window, no taller than its content), each in px.
 */
export interface DockLimits { min?: Record<string, number>; max?: Record<string, number> }

/** An area a window draws on the layout's map: a GeoJSON geometry and its name. */
export interface GeoOverlay { key: string; geometry: { type: string; coordinates: unknown }; label: string }
export const GeoFrameContext = createContext<GeoFrame | null>(null);
/** The GeoLayout around a surface, or nothing when the surface is drawn in another layout. */
export const useGeoFrame = () => useContext(GeoFrameContext);

const docks: readonly Dock[] = ['left', 'right', 'bottom', 'free'];
const dockOf = (v: unknown): Dock => (docks.includes(v as Dock) ? (v as Dock) : 'right');
const storeKey = (persist: string) => `agentspaces-geo:windows:${persist}`;

function readStore(persist: string): Record<string, WindowState> {
  try { const v = JSON.parse(localStorage.getItem(storeKey(persist)) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function writeStore(persist: string, states: Record<string, WindowState>) {
  try { localStorage.setItem(storeKey(persist), JSON.stringify(states)); } catch { /* a private window keeps nothing */ }
}
/**
 * Writes some windows' states over the browser's copy, keeping the others: the layout's windows and the details window
 * the map opens are kept under one key by two owners, and neither may write back a stale copy of the other's.
 */
function mergeStore(persist: string, states: Record<string, WindowState>) {
  writeStore(persist, { ...readStore(persist), ...states });
}

/** A docked window's default size on a stage. */
export function dockedSize(dock: Dock, stage: { width: number; height: number }): { w: number; h: number } {
  const width = stage.width || 1200, height = stage.height || 800;
  if (dock === 'bottom') return { w: Math.max(MIN_W, Math.min(560, width - 2 * GAP)), h: Math.max(MIN_H, Math.round(height * 0.32)) };
  return { w: Math.max(MIN_W, Math.min(380, Math.round(width * 0.3))), h: Math.max(MIN_H, Math.round(height * 0.5) - GAP) };
}

/**
 * Where each open docked window sits: the left and right columns stack top to bottom in the windows' order, the bottom
 * row runs left to right after the left column; a free window keeps its own place. In a column, a window the person has
 * resized (sized) or folded keeps its height, and the others share what is left of the column's height, so a window
 * alone on its side runs the stage's height (above the bottom row where that row reaches under the right column). A
 * column that cannot hold its windows at those heights shares out what it has in proportion (each keeps at least
 * FIT_MIN_H), so no window runs past the stage or over the next one; a bottom window is no taller than the stage, and
 * narrower (w) where the row would run past its right edge.
 */
export function placeDocked(order: readonly string[], states: Record<string, WindowState>, stage: { width: number; height: number }, limits: DockLimits = {}): Record<string, DockedPlace & { h: number }> {
  const width = stage.width || 1200, height = stage.height || 800;
  const out: Record<string, DockedPlace & { h: number }> = {};
  const open = (dock: Dock) => order.filter(p => states[p]?.open && states[p].dock === dock);
  // the bottom row first: the left column is as wide as its widest open window, which a resize may have made wider
  const lefts = open('left').map(p => states[p].w);
  const leftColumn = lefts.length ? Math.max(...lefts) + 2 * GAP : GAP;
  let bottom = GAP;
  for (const page of open('bottom')) {
    const s = states[page];
    const x = leftColumn + bottom - GAP;
    const h = Math.max(1, Math.min(s.h, height - 2 * GAP));
    const room = width - GAP - x;
    const w = s.w > room ? Math.max(Math.min(MIN_W, s.w), room) : s.w;
    out[page] = { x, y: Math.max(GAP, height - (s.folded ? HEAD_H : h) - GAP), h, ...(w !== s.w ? { w } : {}) };
    bottom += w + GAP;
  }
  for (const side of ['left', 'right'] as const) {
    const pages = open(side);
    if (!pages.length) continue;
    const colW = Math.max(...pages.map(p => states[p].w));
    const colX = side === 'left' ? GAP : Math.max(GAP, width - colW - GAP);
    // the right column stops above a bottom window that reaches under it
    const under = side === 'right' ? open('bottom').filter(p => out[p].x + (out[p].w ?? states[p].w) > colX).map(p => out[p].y) : [];
    const floor = under.length ? Math.min(...under) - GAP : height - GAP;
    const kept = pages.filter(p => states[p].sized || states[p].folded);
    const flex = pages.filter(p => !kept.includes(p));
    const used = kept.reduce((n, p) => n + (states[p].folded ? HEAD_H : states[p].h), 0) + GAP * (pages.length - 1);
    const shared = shareOut(flex, floor - GAP - used, limits);
    const heights = pages.map(p => (flex.includes(p) ? shared[p] : states[p].h));
    // more than the column holds: the open windows shrink in proportion; a folded one keeps its head
    const folded = pages.filter(p => states[p].folded).length;
    const space = floor - GAP - GAP * (pages.length - 1) - folded * HEAD_H;
    const want = pages.reduce((n, p, i) => n + (states[p].folded ? 0 : heights[i]), 0);
    if (want > space && want > 0) {
      const f = Math.max(0, space) / want;
      pages.forEach((p, i) => { if (!states[p].folded) heights[i] = Math.max(FIT_MIN_H, Math.floor(heights[i] * f)); });
    }
    let y = GAP;
    pages.forEach((page, i) => {
      const s = states[page];
      out[page] = { x: side === 'left' ? GAP : Math.max(GAP, width - s.w - GAP), y, h: heights[i] };
      y += (s.folded ? HEAD_H : heights[i]) + GAP;
    });
  }
  return out;
}

/**
 * A column's height shared out among its windows that share (flex): evenly, but no window below its min nor above its
 * max (DockLimits); what one bounded window leaves or takes is shared among the rest. Each gets at least MIN_H.
 */
export function shareOut(flex: readonly string[], budget: number, limits: DockLimits = {}): Record<string, number> {
  const out: Record<string, number> = {};
  let open = [...flex], left = budget;
  while (open.length) {
    const share = Math.floor(left / open.length);
    const over = open.filter(p => (limits.max?.[p] ?? Infinity) < share);
    const fixed = over.length ? over : open.filter(p => (limits.min?.[p] ?? 0) > share);
    if (!fixed.length) { open.forEach(p => { out[p] = Math.max(MIN_H, share); }); break; }
    for (const p of fixed) {
      out[p] = Math.max(MIN_H, over.length ? limits.max![p] : limits.min![p]);
      left -= out[p];
    }
    open = open.filter(p => !fixed.includes(p));
  }
  return out;
}

/**
 * The windows' states as drawn on a stage: a window holding a table at least as wide as it needs (minW, up to
 * TABLE_MAX_W) and as tall as its rows need (minH, already capped by the caller) unless the person resized it, and no
 * window wider or taller than the stage. The kept states are not changed: a larger screen gets its windows back as they were.
 */
export function fitStates(order: readonly string[], states: Record<string, WindowState>, stage: { width: number; height: number }, minW: Record<string, number> = {}, minH: Record<string, number> = {}): Record<string, WindowState> {
  const out = { ...states };
  for (const page of order) {
    const s = states[page];
    if (!s) continue;
    let w = s.sized ? s.w : Math.max(s.w, Math.min(minW[page] ?? 0, TABLE_MAX_W));
    let h = s.sized ? s.h : Math.max(s.h, minH[page] ?? 0);
    if (stage.width > 2 * GAP) w = Math.min(w, stage.width - 2 * GAP);
    if (stage.height > 2 * GAP) h = Math.min(h, stage.height - 2 * GAP);
    if (w !== s.w || h !== s.h) out[page] = { ...s, w, h };
  }
  return out;
}

/**
 * A window's place and size kept inside a stage, a gap from each edge: no wider or taller than the stage, and moved in
 * where it would run past an edge. A stage not measured yet (0 by 0) leaves the window as it is.
 */
export function fitRect(r: { x: number; y: number; w: number; h: number }, stage: { width: number; height: number }, folded = false): { x: number; y: number; w: number; h: number } {
  const W = stage.width, H = stage.height;
  if (!(W > 2 * GAP && H > 2 * GAP)) return r;
  const w = Math.min(r.w, W - 2 * GAP), h = Math.min(r.h, H - 2 * GAP);
  const x = Math.min(Math.max(GAP, r.x), Math.max(GAP, W - w - GAP));
  const y = Math.min(Math.max(GAP, r.y), Math.max(GAP, H - (folded ? HEAD_H : h) - GAP));
  return { x, y, w, h };
}

/**
 * How wide a window holding a table needs to be: nothing without a table, else at least TABLE_MIN_W, and as much wider
 * than the window is now as the widest table runs past the box it sits in.
 */
export function tableNeed(body: HTMLElement, width: number): number {
  const tables = body.querySelectorAll('table');
  if (!tables.length) return 0;
  let over = 0;
  tables.forEach(t => { const box = t.parentElement; if (box && t.offsetWidth > 0) over = Math.max(over, t.offsetWidth - box.clientWidth); });
  return Math.max(TABLE_MIN_W, Math.ceil(width + over));
}

/**
 * How tall a window needs to be to show all its content without scrolling: its head, its body's content and padding, and
 * its borders, whatever height it has now (a scrolled or a stretched body measures the same). 0 where nothing is laid out.
 */
export function contentHeight(section: HTMLElement, body: HTMLElement): number {
  let bottom = 0;
  for (const c of Array.from(body.children) as HTMLElement[]) {
    if (!(c.offsetHeight > 0)) continue;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(c) : undefined;
    if (style && (style.position === 'absolute' || style.position === 'fixed')) continue;
    bottom = Math.max(bottom, c.offsetTop + c.offsetHeight + (parseFloat(style?.marginBottom ?? '') || 0));
  }
  if (bottom <= 0) return 0;
  const pad = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(body).paddingBottom) || 0 : 0;
  return Math.ceil(bottom + pad + Math.max(0, section.offsetHeight - section.clientHeight));
}

/**
 * How far in from each side of the stage the open docked windows reach, with a gap past them: an overlay on the map
 * keeps clear of them. Nothing docks as sheets below 900 px, and a free window is the person's to place, so neither counts.
 */
export function dockInsets(order: readonly string[], states: Record<string, WindowState>, stage: { width: number; height: number }, narrow = false, limits: DockLimits = {}): { left: number; right: number; bottom: number } {
  const out = { left: 0, right: 0, bottom: 0 };
  if (narrow) return out;
  const width = stage.width || 1200, height = stage.height || 800;
  const placed = placeDocked(order, states, stage, limits);
  for (const page of order) {
    const at = placed[page], s = states[page];
    if (!at || !s) continue;
    if (s.dock === 'left') out.left = Math.max(out.left, at.x + (at.w ?? s.w) + GAP);
    else if (s.dock === 'right') out.right = Math.max(out.right, width - at.x + GAP);
    else if (s.dock === 'bottom') out.bottom = Math.max(out.bottom, height - at.y + GAP);
  }
  return out;
}

/**
 * The layout's windows' states, from the browser's copy, else the layout's open and dock; every change is kept. The
 * details window the map opens keeps its own state (useDetailsWindow) under the same key, so it is left out here; its z
 * joins the order through raiseOver.
 */
export function useWindowStates(specs: readonly GeoWindowSpec[], persist: string, stage: { width: number; height: number }) {
  const [states, setStates] = useState<Record<string, WindowState>>(() => {
    const kept = readStore(persist);
    const out: Record<string, WindowState> = {};
    specs.forEach((s, i) => {
      const dock = dockOf(s.dock ?? (i % 2 === 0 ? 'left' : 'right'));
      const size = dockedSize(dock === 'free' ? 'right' : dock, stage);
      const k = kept[s.page];
      out[s.page] = k && typeof k.x === 'number' ? { ...k, w: Math.max(MIN_W, k.w), h: Math.max(MIN_H, k.h), dock: dockOf(k.dock) }
        : { open: Boolean(s.open), folded: false, dock, x: 120 + i * 32, y: 80 + i * 32, ...size, z: i + 1 };
    });
    return out;
  });
  // the latest states and the details window's z, for raiseOver, which the map calls outside a render
  const latest = useRef(states);
  latest.current = states;
  const detailsZ = useRef(0);
  const update = useCallback((page: string, change: Partial<WindowState>) => setStates(prev => {
    const next = { ...prev, [page]: { ...prev[page], ...change } };
    mergeStore(persist, next);
    return next;
  }), [persist]);
  const raise = useCallback((page: string) => setStates(prev => {
    const top = Math.max(detailsZ.current, ...Object.entries(prev).filter(([p]) => p !== page).map(([, s]) => s.z));
    if ((prev[page]?.z ?? 0) > top) return prev;
    const next = { ...prev, [page]: { ...prev[page], z: top + 1 } };
    mergeStore(persist, next);
    return next;
  }), [persist]);
  const raiseOver = useCallback((z: number) => {
    const top = Math.max(0, ...Object.values(latest.current).map(s => s.z));
    detailsZ.current = z > top ? z : top + 1;
    return detailsZ.current;
  }, []);
  return { states, update, raise, raiseOver };
}

export interface GeoWindowProps {
  id: string;
  title: string;
  icon?: string;
  state: WindowState;
  /** Its place and height (and width, where the stage cut it) when docked (placeDocked), or nothing when free. */
  docked?: DockedPlace;
  narrow: boolean;
  /** The stage it is kept inside (fitRect); a stage not measured yet keeps nothing in. */
  stage?: { width: number; height: number };
  /**
   * Hears how wide the window's tables need it (tableNeed: 0 when it holds none) and how tall its content needs it
   * (contentHeight: given for a window holding a table, or any window with fitContent; else 0).
   */
  onFit?(minW: number, needH: number): void;
  /** Measures the content's height for onFit though the window holds no table (the map's details window). */
  fitContent?: boolean;
  onChange(change: Partial<WindowState>): void;
  onRaise(): void;
  onClose(): void;
  children?: ReactNode;
}

/** One window over the map: a header to drag, fold and close it by, a body, and a corner to resize it from. */
export function GeoWindow({ id, title, icon, state, docked, narrow, stage, onChange, onRaise, onClose, onFit, fitContent, children }: GeoWindowProps) {
  const drag = useRef<{ kind: 'move' | 'size'; x: number; y: number; from: WindowState; moved: boolean } | null>(null);
  const [live, setLive] = useState<Partial<WindowState> | null>(null);
  const placed = docked && state.dock !== 'free' ? docked : undefined;
  const bounds = stage ?? { width: 0, height: 0 };
  // inside the stage whatever it was given: a place kept on a larger screen, a drag past an edge, a stage that shrank
  const { x, y, w, h } = fitRect({
    x: live?.x ?? (placed ? placed.x : state.x),
    y: live?.y ?? (placed ? placed.y : state.y),
    w: live?.w ?? placed?.w ?? state.w,
    h: live?.h ?? (placed?.h ? placed.h : state.h),
  }, narrow ? { width: 0, height: 0 } : bounds, state.folded);
  // how wide its tables need it, measured again as its content changes (once a frame at most)
  const section = useRef<HTMLElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const fit = useRef(onFit);
  fit.current = onFit;
  const fits = Boolean(onFit);
  useEffect(() => {
    const el = body.current;
    // a closed or folded window's tables have no width: what it last measured stands until it shows again
    if (!fits || !el || !state.open || state.folded) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = section.current;
      const need = tableNeed(el, box?.offsetWidth ?? 0);
      fit.current?.(need, box && (need > 0 || fitContent) ? contentHeight(box, el) : 0);
    };
    measure();
    if (typeof MutationObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') return undefined;
    const again = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const mo = new MutationObserver(again);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    // a width that changes reflows the content, and its height with it
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(again);
    if (ro && section.current) ro.observe(section.current);
    return () => { mo.disconnect(); ro?.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [fits, state.open, state.folded, fitContent]);
  const start = (kind: 'move' | 'size') => (e: ReactPointerEvent<HTMLElement>) => {
    if (narrow || (kind === 'move' && (e.target as HTMLElement).closest('button'))) return;
    drag.current = { kind, x: e.clientX, y: e.clientY, from: { ...state, x, y, h }, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    onRaise();
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    // a resize stops at the stage's edge (when the stage is measured)
    const roomW = bounds.width > 0 ? bounds.width - d.from.x - GAP : Infinity, roomH = bounds.height > 0 ? bounds.height - d.from.y - GAP : Infinity;
    setLive(d.kind === 'move' ? { x: Math.max(0, d.from.x + dx), y: Math.max(0, d.from.y + dy) }
      : { w: Math.max(MIN_W, Math.min(roomW, d.from.w + dx)), h: Math.max(MIN_H, Math.min(roomH, d.from.h + dy)) });
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    // a drag frees a docked window (GEO-L-04); a resize keeps its dock
    // a resize marks the window sized, so its column no longer shares its height out (placeDocked)
    // what is kept is what was drawn: inside the stage
    if (d?.moved && live) onChange(d.kind === 'move' ? { x, y, h, dock: 'free' } : { w, h, sized: true });
    setLive(null);
  };
  const style: CSSProperties = narrow ? { zIndex: 10 + state.z } : { left: x, top: y, width: w, height: state.folded ? undefined : h, zIndex: 10 + state.z };
  return (
    <section ref={section} className={`as-geo-window${state.folded ? ' folded' : ''}${narrow ? ' sheet' : ''}${live ? ' moving' : ''}`} style={style} hidden={!state.open}
      role="dialog" aria-modal="false" aria-label={title} data-window={id} data-dock={state.dock} tabIndex={-1} onPointerDown={onRaise}>
      <header className="as-geo-window-head" onPointerDown={start('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <Icon name={icon} /><b>{title}</b>
        <span className="as-geo-window-tools">
          <button type="button" className="bma-btn" aria-label={(state.folded ? 'unfold ' : 'fold ') + title} aria-expanded={!state.folded} onClick={() => onChange({ folded: !state.folded })}>{state.folded ? '▾' : '▴'}</button>
          <button type="button" className="bma-btn" aria-label={'close ' + title} onClick={onClose}>×</button>
        </span>
      </header>
      <div ref={body} className="as-geo-window-body" hidden={state.folded}>{children}</div>
      {!narrow && !state.folded ? <span className="as-geo-window-size" role="presentation" onPointerDown={start('size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Drag to resize" /> : null}
    </section>
  );
}

/** Whether the page is narrower than {@code px}, following the window's resizes. */
function useNarrow(px: number): boolean {
  const read = () => typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < px;
  const [narrow, setNarrow] = useState(read);
  useEffect(() => {
    const on = () => setNarrow(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [px]); // eslint-disable-line react-hooks/exhaustive-deps
  return narrow;
}

/** The size of an element, following its resizes. */
function useSize(el: HTMLElement | null): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return undefined;
    const read = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return size;
}

export function GeoPages({ surfaces, render, layout, title, lede, persist }: { surfaces: readonly string[]; render(id: string): ReactNode; layout: GeoLayout; title?: string; lede?: string; persist?: string }) {
  const specs = useMemo(() => layout.windows.filter(w => w && w.page && w.page !== layout.map), [layout.windows, layout.map]);
  const { held, tools } = useBarClaim();
  const key = persist || title || 'app';
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<HTMLElement | null>(null);
  const stage = useSize(stageEl);
  const narrow = useNarrow(NARROW_PX);
  const { states, update, raise, raiseOver } = useWindowStates(specs, key, stage);
  const bar = useRef<HTMLElement | null>(null);
  const map = useRef<HTMLElement | null>(null);
  const order = specs.map(s => s.page);
  // the details window the map opens docks at the foot of the right column, with the right windows above it
  const [details, setDetails] = useState<WindowState | undefined>(undefined);
  const [detailsNeed, setDetailsNeed] = useState(0);
  const [minW, setMinW] = useState<Record<string, number>>({});
  const [needH, setNeedH] = useState<Record<string, number>>({});
  const all = details?.open && !narrow ? [...order, DETAILS] : order;
  // a window holding a table grows to show its rows, up to a share of the stage; the details window docks no taller than
  // its content (the person's own resize of either stands)
  // a window at the foot grows no taller than leaves each window in the right column (which stops above it) MIN_H
  const rightOpen = all.filter(p => (p === DETAILS ? details : states[p])?.open && (p === DETAILS ? details : states[p])?.dock === 'right');
  const rightKeep = rightOpen.reduce((n, p) => n + ((p === DETAILS ? details : states[p])?.folded ? HEAD_H : MIN_H) + GAP, GAP);
  const tableH = useMemo(() => {
    const height = stage.height || 800;
    const cap = Math.round(height * TABLE_MAX_H_SHARE);
    return Object.fromEntries(order.filter(p => (minW[p] ?? 0) > 0 && (needH[p] ?? 0) > 0).map(p => [p,
      Math.min(needH[p], cap, states[p]?.dock === 'bottom' && rightKeep > GAP ? Math.max(MIN_H, height - rightKeep - 2 * GAP) : Infinity)]));
  }, [order.join('\n'), minW, needH, stage.height, rightKeep, states]); // eslint-disable-line react-hooks/exhaustive-deps
  const limits: DockLimits = { min: tableH, max: detailsNeed > 0 ? { [DETAILS]: detailsNeed } : {} };
  const fitted = fitStates(all, details?.open && !narrow ? { ...states, [DETAILS]: details } : states, stage, minW, tableH);
  const docked = placeDocked(all, fitted, stage, limits);
  const insets = dockInsets(all, fitted, stage, narrow, limits);
  const insetsKey = `${insets.left},${insets.right},${insets.bottom}`;
  const frameInsets = useMemo(() => insets, [insetsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const detailsPlace = details?.open && !narrow && details.dock !== 'free' ? docked[DETAILS] : undefined;
  const detailsKey = detailsPlace ? `${detailsPlace.x},${detailsPlace.y},${detailsPlace.h},${detailsPlace.w ?? ''}` : '';
  const detailsAt = useMemo(() => detailsPlace, [detailsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitOf = (page: string) => (need: number, h: number) => {
    setMinW(prev => ((prev[page] ?? 0) === need ? prev : { ...prev, [page]: need }));
    setNeedH(prev => ((prev[page] ?? 0) === h ? prev : { ...prev, [page]: h }));
  };
  const fitDetails = useCallback((h: number) => setDetailsNeed(prev => (prev === h ? prev : h)), []);
  const stageStyle = { '--as-dock-left': `${insets.left}px`, '--as-dock-right': `${insets.right}px`, '--as-dock-bottom': `${insets.bottom}px` } as CSSProperties;
  // a sheet at a time below 900 px: the topmost open window (GEO-L-07)
  const sheet = narrow ? order.filter(p => states[p]?.open).sort((a, b) => states[b].z - states[a].z)[0] : undefined;
  const toggle = (page: string) => {
    const open = !states[page]?.open;
    update(page, { open, folded: false });
    if (open) raise(page);
  };
  // F6 and Shift+F6 move between the bar, the map and each open window, topmost first (GEO-L-06)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return;
      const windows = [...document.querySelectorAll<HTMLElement>('.as-geo-layout .as-geo-window:not([hidden])')]
        .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
      const regions = [bar.current, map.current, ...windows].filter((r): r is HTMLElement => Boolean(r));
      if (!regions.length) return;
      e.preventDefault();
      const at = regions.findIndex(r => r.contains(document.activeElement));
      const next = regions[((at < 0 ? -1 : at) + (e.shiftKey ? -1 : 1) + regions.length) % regions.length];
      next.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // the channel between the windows and the map: a watchbox's row focuses a feature on the map, a watchbox's area is drawn on it
  const focusListeners = useRef(new Set<(id: string) => void>());
  const focus = useCallback((id: string) => focusListeners.current.forEach(l => l(id)), []);
  const onFocus = useCallback((l: (id: string) => void) => { focusListeners.current.add(l); return () => { focusListeners.current.delete(l); }; }, []);
  const [overlays, setOverlays] = useState<GeoOverlay[]>([]);
  const setOverlay = useCallback((k: string, o: Omit<GeoOverlay, 'key'> | undefined) => setOverlays(prev => {
    const rest = prev.filter(x => x.key !== k);
    return o ? [...rest, { key: k, ...o }] : rest.length === prev.length ? prev : rest;
  }), []);
  // the pick set (GEO-M-09): memory only, never a space, storage or the URL; a reload empties it
  const [picked, setPickedState] = useState<readonly string[]>([]);
  const [pickSaid, setPickSaid] = useState<{ text: string; seq: number }>({ text: '', seq: 0 });
  const setPicked = useCallback((keys: readonly string[], said?: string) => {
    const next = keys.filter((k, i) => typeof k === 'string' && k && keys.indexOf(k) === i).slice(0, MAX_PICKS);
    setPickedState(prev => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
    setPickSaid(prev => ({ text: said ?? (next.length ? `Showing ${next.length} on the map: ${next.join(', ')}.` : 'Nothing is picked; the map shows every layer.'), seq: prev.seq + 1 }));
  }, []);
  const lists = useRef(new Map<string, ReadonlySet<string>>());
  const listKeys = useCallback((source: string, keys: readonly string[] | undefined) => { if (keys) lists.current.set(source, new Set(keys)); else lists.current.delete(source); }, []);
  const listed = useCallback(() => {
    if (!lists.current.size) return undefined;
    const all = new Set<string>();
    lists.current.forEach(ks => ks.forEach(k => all.add(k)));
    return all;
  }, []);
  const frame = useMemo<GeoFrame>(() => ({ searchSlot, detailsSlot, persist: key, stage, narrow, focus, onFocus, overlays, setOverlay, raiseOver, setDetails, detailsAt, fitDetails, insets: frameInsets,
    picked, setPicked, pickSaid, listKeys, listed }),
    [searchSlot, detailsSlot, key, stage, narrow, focus, onFocus, overlays, setOverlay, raiseOver, detailsAt, fitDetails, frameInsets, picked, setPicked, pickSaid, listKeys, listed]);
  const rest = surfaces.filter(s => s !== layout.map && !order.includes(s));
  return (
    <GeoFrameContext.Provider value={frame}>
      <div className={`as-geo-layout${narrow ? ' narrow' : ''}`}>
        <header ref={bar} className="as-geo-bar" tabIndex={-1} aria-label="App bar">
          <div className="as-geo-title">{kickerOf(layout.kicker)}<b>{title ?? ''}</b>{lede ? <span className="as-geo-lede">{lede}</span> : null}</div>
          <div className="as-geo-search" ref={setSearchSlot} />
          {specs.length ? (
            <nav className="as-geo-menu" aria-label="Windows">
              {specs.map(s => (
                <button key={s.page} type="button" className={`as-geo-menu-item${states[s.page]?.open ? ' open' : ''}`} aria-pressed={Boolean(states[s.page]?.open)}
                  title={(states[s.page]?.open ? 'Close ' : 'Open ') + s.label} onClick={() => toggle(s.page)}>
                  {/* the label under its icon at every width; a name outside the icon set draws the window glyph */}
                  <Icon name={s.icon && ICONS.includes(s.icon) ? s.icon : 'window'} /><span className="as-geo-menu-label">{s.label}</span>
                </button>
              ))}
            </nav>
          ) : null}
          {held ? <span className="as-geo-tools">{tools}</span> : null}
        </header>
        <div className="as-geo-stage" ref={setStageEl} style={stageStyle} data-dock-bottom={insets.bottom > 0 ? '' : undefined}>
          <section ref={map} className="as-geo-map" aria-label="Map" data-page={layout.map} tabIndex={-1}>{render(layout.map)}</section>
          {specs.map(s => (
            <GeoWindow key={s.page} id={s.page} title={s.label} icon={s.icon} narrow={narrow} stage={stage}
              state={narrow && sheet !== s.page ? { ...fitted[s.page], open: false } : fitted[s.page]} docked={docked[s.page]}
              onChange={change => update(s.page, change)} onRaise={() => raise(s.page)} onClose={() => update(s.page, { open: false })} onFit={fitOf(s.page)}>
              {render(s.page)}
            </GeoWindow>
          ))}
          <div className="as-geo-details" ref={setDetailsSlot} data-details-for={layout.map} />
          {rest.length ? <div className="as-geo-rest" hidden>{rest.map(r => <div key={r}>{render(r)}</div>)}</div> : null}
        </div>
      </div>
    </GeoFrameContext.Provider>
  );
}

/** The details window's place and state, kept like the other windows' (the map opens it, GEO-S-03). */
export function useDetailsWindow(frame: GeoFrame | null) {
  const key = frame?.persist ?? 'app';
  const stage = frame?.stage ?? { width: 0, height: 0 };
  const [state, setState] = useState<WindowState>(() => {
    const kept = readStore(key).details;
    return kept && typeof kept.x === 'number' ? { ...kept, open: true } : { open: true, folded: false, dock: 'right', x: 0, y: 0, ...dockedSize('right', stage), z: 50 };
  });
  const change = useCallback((c: Partial<WindowState>) => setState(prev => {
    const next = { ...prev, ...c };
    mergeStore(key, { details: next });
    return next;
  }), [key]);
  // a click on it, or its opening, brings it above the layout's windows (GEO-L-03), in the layout's one order
  const raiseOver = frame?.raiseOver;
  const raise = useCallback(() => setState(prev => {
    const z = raiseOver ? raiseOver(prev.z) : prev.z;
    if (z === prev.z) return prev;
    const next = { ...prev, z };
    mergeStore(key, { details: next });
    return next;
  }), [key, raiseOver]);
  // docked: where the layout puts it in the right column, else the stage's lower right corner
  const docked = state.dock === 'free' ? undefined
    : frame?.detailsAt ?? { x: Math.max(GAP, (stage.width || 1200) - state.w - GAP), y: Math.max(GAP, (stage.height || 800) - (state.folded ? HEAD_H : state.h) - GAP) };
  return { state, change, raise, docked };
}
