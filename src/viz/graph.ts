/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The graph of agentspaces-viz/GraphView (srad/agentspaces-geo.md §3.4, GEO-G-01, G-03), with no drawing: nodes and
// edges from two tables or from GeoFeatures and their links, and three layouts, each deterministic for the same graph:
//   force    spring-and-charge relaxation; the repulsion reads only the nodes in the neighbouring cells of a grid, so a
//            sweep costs about n, and 2,000 nodes and 5,000 edges settle well inside two seconds
//   tree     the roots (nodes nobody points at) on top, each level below, the leaves spread in order
//   layered  each node one layer right of its longest path from a source, ordered in its layer by the mean place of
//            its neighbours (two sweeps), so the edges cross less
import { featureOf } from './features';

/** A node; lit when its row says lit: true, a node on the path the data marks. */
export interface GNode { id: string; label: string; kind: string; lit?: boolean }
/** An edge; lit when its row says lit: true, an edge on the path the data marks. */
export interface GEdge { source: string; target: string; rel: string; lit?: boolean }
export interface Graph { nodes: GNode[]; edges: GEdge[] }
export type GraphLayout = 'force' | 'tree' | 'layered';
export type Positions = Map<string, { x: number; y: number }>;

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const rowsOf = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>) : [])
  .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object');

/**
 * A graph from a nodes table (id, label, kind) and an edges table (source, target, rel); an edge to an unknown node is
 * left out. A row with lit: true (the boolean, not a word) is on the path the data marks; lit is set only then, so a
 * graph without a path keeps the shape it always had.
 */
export function graphOf(nodes: unknown, edges: unknown): Graph {
  const seen = new Set<string>();
  const ns: GNode[] = [];
  for (const r of rowsOf(nodes)) {
    const id = str(r.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ns.push({ id, label: str(r.label ?? r.title) || id, kind: str(r.kind), ...(r.lit === true ? { lit: true } : {}) });
  }
  const es = rowsOf(edges).map(r => ({ source: str(r.source ?? r.from), target: str(r.target ?? r.to), rel: str(r.rel ?? r.label), ...(r.lit === true ? { lit: true } : {}) }))
    .filter(e => seen.has(e.source) && seen.has(e.target));
  return { nodes: ns, edges: es };
}

/**
 * Whether a node draws in the selected style, on the SVG and the WebGL drawing alike: the person's selection, or a node
 * the data lights (AF-11).
 */
export function nodeOn(n: Pick<GNode, 'id' | 'lit'>, selected: string | undefined): boolean {
  return n.id === selected || !!n.lit;
}

/** Whether an edge draws with the accent, on either drawing: lit by the data, or touching the person's selection. */
export function edgeOn(e: Pick<GEdge, 'source' | 'target' | 'lit'>, selected: string | undefined): boolean {
  return !!e.lit || (!!selected && (e.source === selected || e.target === selected));
}

/** A graph from GeoFeatures: each feature a node, each of its links an edge to the feature it names. */
export function graphOfFeatures(features: unknown): Graph {
  const fs = rowsOf(features).map(featureOf).filter((f): f is NonNullable<ReturnType<typeof featureOf>> => Boolean(f));
  const ids = new Set(fs.map(f => f.id));
  return {
    nodes: fs.map(f => ({ id: f.id, label: f.label || f.id, kind: f.kind })),
    edges: fs.flatMap(f => (f.links ?? []).filter(l => ids.has(l.id)).map(l => ({ source: f.id, target: l.id, rel: l.rel }))),
  };
}

/** The room a layout keeps to the right of the rightmost node, for its label. */
export const LABEL_ROOM = 140;

/** Lays a graph out in a box of width w and height h (a margin of 24 kept, and room on the right for the labels). */
export function layout(g: Graph, kind: GraphLayout, w = 800, h = 520): Positions {
  if (!g.nodes.length) return new Map();
  const raw = kind === 'tree' ? tree(g) : kind === 'layered' ? layered(g) : force(g);
  return fit(raw, w, h, 24, LABEL_ROOM);
}

function fit(p: Positions, w: number, h: number, m: number, right: number): Positions {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  p.forEach(({ x, y }) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const sx = x1 > x0 ? (w - m - right) / (x1 - x0) : 0, sy = y1 > y0 ? (h - 2 * m) / (y1 - y0) : 0;
  const out: Positions = new Map();
  p.forEach(({ x, y }, id) => out.set(id, { x: sx ? m + (x - x0) * sx : (w - right) / 2, y: sy ? m + (y - y0) * sy : h / 2 }));
  return out;
}

function force(g: Graph): Positions {
  const n = g.nodes.length;
  const index = new Map(g.nodes.map((v, i) => [v.id, i]));
  const k = 30;   // the ideal edge length
  // a deterministic start: a sunflower spiral, so the same graph lays out the same way every time
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = k * Math.sqrt(i + 0.5); const a = i * 2.399963; x[i] = r * Math.cos(a); y[i] = r * Math.sin(a); }
  const links = g.edges.map(e => [index.get(e.source)!, index.get(e.target)!] as const).filter(([a, b]) => a !== b);
  const sweeps = n > 1000 ? 60 : n > 200 ? 120 : 250;
  const dx = new Float64Array(n), dy = new Float64Array(n);
  let temp = k * Math.sqrt(n) / 4;
  for (let s = 0; s < sweeps; s++) {
    dx.fill(0); dy.fill(0);
    // repulsion from the nodes in this cell and the eight around it
    const cell = 2 * k;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) { const key = Math.floor(x[i] / cell) + ':' + Math.floor(y[i] / cell); const c = grid.get(key); if (c) c.push(i); else grid.set(key, [i]); }
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(x[i] / cell), gy = Math.floor(y[i] / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const c = grid.get((gx + ox) + ':' + (gy + oy));
        if (!c) continue;
        for (const j of c) {
          if (j === i) continue;
          let ddx = x[i] - x[j], ddy = y[i] - y[j];
          let d2 = ddx * ddx + ddy * ddy;
          if (d2 < 0.01) { ddx = 0.1 * ((i % 7) - 3); ddy = 0.1 * ((j % 5) - 2); d2 = ddx * ddx + ddy * ddy + 0.01; }
          const f = (k * k) / d2;
          dx[i] += ddx * f; dy[i] += ddy * f;
        }
      }
    }
    // springs along the edges
    for (const [a, b] of links) {
      const ddx = x[a] - x[b], ddy = y[a] - y[b];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const f = d / k;
      dx[a] -= ddx * f; dy[a] -= ddy * f; dx[b] += ddx * f; dy[b] += ddy * f;
    }
    // a gentle pull to the middle keeps parts of a disconnected graph near each other
    for (let i = 0; i < n; i++) { dx[i] -= x[i] * 0.01; dy[i] -= y[i] * 0.01; }
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1;
      const step = Math.min(d, temp);
      x[i] += (dx[i] / d) * step; y[i] += (dy[i] / d) * step;
    }
    temp = Math.max(0.5, temp * 0.95);
  }
  const out: Positions = new Map();
  g.nodes.forEach((v, i) => out.set(v.id, { x: x[i], y: y[i] }));
  return out;
}

function children(g: Graph): Map<string, string[]> {
  const out = new Map<string, string[]>(g.nodes.map(v => [v.id, []]));
  for (const e of g.edges) if (e.source !== e.target) out.get(e.source)!.push(e.target);
  return out;
}

function tree(g: Graph): Positions {
  const kids = children(g);
  const pointed = new Set(g.edges.map(e => e.target));
  const roots = g.nodes.filter(v => !pointed.has(v.id)).map(v => v.id);
  const depth = new Map<string, number>();
  const order: string[] = [];
  const visit = (id: string, d: number) => {
    if (depth.has(id)) return;
    depth.set(id, d);
    order.push(id);
    for (const c of kids.get(id) ?? []) visit(c, d + 1);
  };
  (roots.length ? roots : [g.nodes[0].id]).forEach(r => visit(r, 0));
  g.nodes.forEach(v => visit(v.id, 0));   // whatever a cycle left unreached starts a tree of its own
  // the leaves in visiting order take the x positions; a parent sits over the middle of its children
  const x = new Map<string, number>();
  let next = 0;
  const place = (id: string, seen: Set<string>): number => {
    if (x.has(id)) return x.get(id)!;
    seen.add(id);
    const cs = (kids.get(id) ?? []).filter(c => depth.get(c) === depth.get(id)! + 1 && !seen.has(c));
    const xs = cs.map(c => place(c, seen));
    const v = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : next++;
    x.set(id, v);
    return v;
  };
  order.forEach(id => place(id, new Set()));
  const out: Positions = new Map();
  g.nodes.forEach(v => out.set(v.id, { x: x.get(v.id)! * 60, y: depth.get(v.id)! * 80 }));
  return out;
}

function layered(g: Graph): Positions {
  const kids = children(g);
  const parents = new Map<string, string[]>(g.nodes.map(v => [v.id, []]));
  for (const e of g.edges) if (e.source !== e.target) parents.get(e.target)!.push(e.source);
  // longest path from a source, with a cycle broken where the walk meets a node it is still inside
  const layer = new Map<string, number>();
  const onPath = new Set<string>();
  const depthOf = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (onPath.has(id)) return 0;
    onPath.add(id);
    const ps = parents.get(id) ?? [];
    const d = ps.length ? Math.max(...ps.map(p => depthOf(p) + 1)) : 0;
    onPath.delete(id);
    layer.set(id, d);
    return d;
  };
  g.nodes.forEach(v => depthOf(v.id));
  const layers: string[][] = [];
  g.nodes.forEach(v => { const l = layer.get(v.id)!; (layers[l] ??= []).push(v.id); });
  // two sweeps of the barycentre: down by the parents' places, then up by the children's
  const place = new Map<string, number>();
  const setPlaces = () => layers.forEach(l => l?.forEach((id, i) => place.set(id, i)));
  setPlaces();
  const mean = (ids: string[]) => (ids.length ? ids.reduce((a, id) => a + (place.get(id) ?? 0), 0) / ids.length : Infinity);
  for (let i = 1; i < layers.length; i++) { layers[i]?.sort((a, b) => mean(parents.get(a)!) - mean(parents.get(b)!)); setPlaces(); }
  for (let i = layers.length - 2; i >= 0; i--) { layers[i]?.sort((a, b) => mean(kids.get(a)!) - mean(kids.get(b)!)); setPlaces(); }
  const out: Positions = new Map();
  layers.forEach((l, li) => l?.forEach((id, i) => out.set(id, { x: li * 160, y: (i - (l.length - 1) / 2) * 56 })));
  return out;
}

/** The kinds of a graph in the order they first appear, each with the look's hue for its turn (fixed order, never cycled past eight). */
export function kindHues(nodes: readonly GNode[], hues: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of nodes) if (!out.has(v.kind)) out.set(v.kind, out.size < 8 ? hues[out.size % Math.max(1, hues.length)] ?? '#4477aa' : 'var(--bma-color-ink-muted)');
  return out;
}

/** How many nodes GraphView draws as SVG; past this it draws with WebGL where the page has it (GEO-G-03). */
export const GRAPH_WEBGL_PAST = 500;

/**
 * Which drawing a graph of n nodes takes: SVG up to 500 nodes, where an element per node keeps each one in the
 * accessibility tree and a pan is cheap, and WebGL past it where the page has WebGL 2, else SVG still.
 */
export function graphDrawing(n: number, webgl: boolean): 'svg' | 'webgl' {
  return n > GRAPH_WEBGL_PAST && webgl ? 'webgl' : 'svg';
}

/** GraphView's pan and zoom over its model box: a model point (x, y) draws at (x·k + tx, y·k + ty) in the box. */
export interface GraphCamera { tx: number; ty: number; k: number }

/**
 * The camera of an orthographic view (deck.gl's OrthographicView: the model point at the middle of the screen, and the
 * zoom, a power of two of the pixels per model unit) that draws what the SVG draws: the model box of width w and height
 * h fitted in a host of width bw and height bh, as the SVG's viewBox is, then panned and zoomed by the camera.
 */
export function graphViewState(view: GraphCamera, bw: number, bh: number, w: number, h: number): { target: [number, number]; zoom: number } {
  const s = bw > 0 && bh > 0 ? Math.min(bw / w, bh / h) : 1;
  return { target: [(w / 2 - view.tx) / view.k, (h / 2 - view.ty) / view.k], zoom: Math.log2(Math.max(1e-6, view.k * s)) };
}

/**
 * The node nearest a model point within `within` model units, or nothing: how a press finds its node without asking the
 * drawing, the same for SVG and WebGL. A linear scan: 2,000 nodes take a fraction of a millisecond, once per press.
 */
export function nearestNode(positions: ReadonlyMap<string, { x: number; y: number }>, p: { x: number; y: number }, within: number): string | undefined {
  let best: string | undefined, bestD = within * within;
  positions.forEach((q, id) => {
    const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
    if (d <= bestD) { bestD = d; best = id; }
  });
  return best;
}
