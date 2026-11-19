/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/GraphView (srad/agentspaces-geo.md §3.4, GEO-G-01, G-02, G-04): a graph of a nodes table and an edges
// table, or of GeoFeatures and their links, laid out by force, as a tree, or in layers (../../viz/graph). A person pans
// (drag the background), zooms (the wheel, or + and −), drags a node, and clicks one to select it; a node whose id is a
// GeoFeature's selects that feature on the map: the GeoLayout's, from another window, or the map the view names on its
// own surface. Nodes take the look's hues by kind in fixed order, with a legend; a table view lists the edges. The drawing
// sits on a stage (.as-graphview-stage) with the legend and the count laid over it: edges are gentle curves, a node is a
// disc in the panel colour ringed in its kind's hue, the selected node has a soft halo, and each label is a chip.
// Past 500 nodes the view draws with WebGL (GEO-G-03): deck.gl's layers, a chunk loaded on first use (../../viz/graph-gl),
// where the page has WebGL 2, else SVG as below. Pan, zoom, drag, selection and the keys stay here and work the same over
// both drawings: a press finds its node by position (nearestNode), not by the element it hit. A canvas has no node a
// screen reader can reach, so its label says how many it holds and points to the Table, which lists every edge.
// Rows marked lit: true are a path the data marks (AF-11): lit nodes draw in the selected style and lit edges with the
// accent stroke, in both drawings, beside the person's own selection, and a lit node's name and a lit edge's text add
// ", on the path" for a screen reader.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { define, useData } from '../../renderer/implementation';
import { useLook } from '../../look/provider';
import { useGeoFrame } from '../../frame/geo';
import type { GraphViewProps } from '../../generated/props';
import { GRAPH_WEBGL_PAST, edgeOn, graphDrawing, graphOf, graphOfFeatures, kindHues, layout, nearestNode, nodeOn, type GraphLayout } from '../../viz/graph';
import type { GLEdge, GLNode, GraphGL } from '../../viz/graph-gl';
import { geoState } from '../../viz/features';

const W = 800, H = 520;
const LAYOUTS: readonly GraphLayout[] = ['force', 'tree', 'layered'];

export const GraphView = define<GraphViewProps>('GraphView', ({ props, ctx }) => {
  const { tokens, look, mode } = useLook();
  const nodes = useData<unknown>(ctx, typeof props.nodes === 'string' ? props.nodes : undefined);
  const edges = useData<unknown>(ctx, typeof props.edges === 'string' ? props.edges : undefined);
  const features = useData<unknown>(ctx, typeof props.features === 'string' ? props.features : undefined);
  const kind: GraphLayout = LAYOUTS.includes(props.layout as GraphLayout) ? (props.layout as GraphLayout) : 'force';
  const graph = useMemo(() => (typeof props.features === 'string' ? graphOfFeatures(features) : graphOf(nodes, edges)), [props.features, features, nodes, edges]);
  // the graph's shape as one key, worked out once per graph rather than on each pan's render (7,000 joins at 2,000 nodes)
  const shape = useMemo(() => graph.nodes.map(n => n.id).join('\u0000') + '|' + graph.edges.map(e => e.source + '>' + e.target).join('\u0000'), [graph]);
  const laid = useMemo(() => layout(graph, kind, W, H), [shape, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const [moved, setMoved] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  useEffect(() => setMoved(new Map()), [shape, kind]);
  const at = (id: string) => moved.get(id) ?? laid.get(id) ?? { x: W / 2, y: H / 2 };
  const hues = useMemo(() => kindHues(graph.nodes, tokens.color.categorical), [graph.nodes, tokens.color.categorical]);
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });
  const [selected, setSelected] = useState<string | undefined>();
  const [table, setTable] = useState(false);
  const drag = useRef<{ kind: 'pan' | 'node'; id?: string; x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null);
  // the drawing's element, the svg or the WebGL host: pointer positions are read against its box
  const stage = useRef<Element | null>(null);
  const frame = useGeoFrame();
  const toModel = (clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    const sx = box && box.width ? W / box.width : 1, sy = box && box.height ? H / box.height : 1;
    return { x: ((clientX - (box?.left ?? 0)) * sx - view.tx) / view.k, y: ((clientY - (box?.top ?? 0)) * sy - view.ty) / view.k };
  };
  const pick = (id: string) => {
    setSelected(id);
    const node = graph.nodes.find(n => n.id === id);
    if (props.selectAction) ctx.dispatch(props.selectAction, { id, kind: node?.kind ?? '' });
    // a node whose id is a feature's selects it on the map (GEO-G-02)
    if (frame) frame.focus(id);
    else if (typeof props.map === 'string' && props.map) { const s = geoState(props.map); ctx.set(s.selected, id); ctx.set(s.focus, { id, seq: Date.now() }); }
  };
  const down = (id?: string) => (e: ReactPointerEvent<Element>) => {
    e.stopPropagation();
    const p = id ? at(id) : { x: view.tx, y: view.ty };
    drag.current = { kind: id ? 'node' : 'pan', id, x: e.clientX, y: e.clientY, from: p, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<Element>) => {
    const d = drag.current;
    if (!d) return;
    const box = stage.current?.getBoundingClientRect();
    const scale = box && box.width ? W / box.width : 1;
    const dx = (e.clientX - d.x) * scale, dy = (e.clientY - d.y) * scale;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    if (d.kind === 'pan') setView(v => ({ ...v, tx: d.from.x + dx, ty: d.from.y + dy }));
    else if (d.id) { const id = d.id; setMoved(m => new Map(m).set(id, { x: d.from.x + dx / view.k, y: d.from.y + dy / view.k })); }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && d.kind === 'node' && d.id) pick(d.id);
  };
  const zoom = (factor: number, cx = W / 2, cy = H / 2) => setView(v => {
    const k = Math.max(0.2, Math.min(8, v.k * factor));
    return { k, tx: cx - ((cx - v.tx) * k) / v.k, ty: cy - ((cy - v.ty) * k) / v.k };
  });
  const wheel = (e: WheelEvent<Element>) => { const p = toModel(e.clientX, e.clientY); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x * view.k + view.tx, p.y * view.k + view.ty); };
  // the keys over the drawing: the arrows pan, + and - zoom, 0 fits; the buttons above do the same
  const keys = (e: KeyboardEvent<Element>) => {
    const step = 40, pan: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (pan[e.key]) { const [dx, dy] = pan[e.key]; setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy })); }
    else if (e.key === '+' || e.key === '=') zoom(1.25);
    else if (e.key === '-' || e.key === '_') zoom(1 / 1.25);
    else if (e.key === '0') setView({ tx: 0, ty: 0, k: 1 });
    else return;
    e.preventDefault();
  };
  const labels = graph.nodes.length <= 200 || view.k >= 1.5;
  const r = graph.nodes.length > 500 ? 3 : graph.nodes.length > 120 ? 6 : 8;
  // SVG up to 500 nodes; past it WebGL where the page has WebGL 2 and deck.gl starts, else SVG still
  const big = graph.nodes.length > GRAPH_WEBGL_PAST;
  const webgl = useMemo(() => big && hasWebGL2(), [big]);
  // the graph whose WebGL drawing failed (did not start, or lost its context): that graph draws SVG from then on, and a
  // graph of another shape tries WebGL again, so one miss (a busy GPU, a context the page ran short of) is not for good
  const [glFailedFor, setGlFailedFor] = useState<string | null>(null);
  const shapeNow = useRef(shape);
  shapeNow.current = shape;
  const drawing = glFailedFor === shape ? 'svg' : graphDrawing(graph.nodes.length, webgl);
  const gl = useRef<GraphGL | null>(null);
  const glHost = useRef<HTMLDivElement | null>(null);
  const [glReady, setGlReady] = useState(0);
  const onCanvas = drawing === 'webgl' && !table;
  useEffect(() => {
    if (!onCanvas) return undefined;
    const stop = new AbortController();
    // a frame later, so a mount that is undone at once (StrictMode's first pass) starts no WebGL context it then drops
    const timer = setTimeout(() => {
      const host = glHost.current;
      if (stop.signal.aborted || !host) return;
      const failed = () => { if (!stop.signal.aborted) setGlFailedFor(shapeNow.current); };
      // a context lost after the start draws SVG too: the switch unmounts the canvas, and this effect's cleanup frees it
      import('../../viz/graph-gl').then(m => m.createGraphGL(host, stop.signal, failed))
        .then(a => { if (stop.signal.aborted) { a.dispose(); return; } gl.current = a; setGlReady(n => n + 1); })
        .catch(failed);
    }, 0);
    return () => { stop.abort(); clearTimeout(timer); gl.current?.dispose(); gl.current = null; setGlReady(0); };
  }, [onCanvas]);
  const positions = useMemo(() => { const m = new Map(laid); moved.forEach((p, id) => m.set(id, p)); return m; }, [laid, moved]);
  const glNodes = useMemo<GLNode[]>(() => (drawing === 'webgl'
    ? graph.nodes.map(n => { const p = positions.get(n.id) ?? { x: W / 2, y: H / 2 }; return { id: n.id, x: p.x, y: p.y, hue: hues.get(n.kind) ?? '', label: n.label, on: nodeOn(n, selected) }; })
    : []), [drawing, graph.nodes, positions, hues, selected]);
  const glEdges = useMemo<GLEdge[]>(() => (drawing === 'webgl'
    ? graph.edges.map(e => ({ a: positions.get(e.source) ?? { x: W / 2, y: H / 2 }, b: positions.get(e.target) ?? { x: W / 2, y: H / 2 }, on: edgeOn(e, selected) }))
    : []), [drawing, graph.edges, positions, selected]);
  const colorKey = `${look.id}|${mode}|${tokens.color.categorical.join(',')}`;
  useEffect(() => {
    gl.current?.draw({ nodes: glNodes, edges: glEdges, r, labels, view, width: W, height: H, colorKey });
  }, [glReady, glNodes, glEdges, r, labels, view, colorKey]);
  // a press on the canvas: the node within a few pixels of it, else the background
  const downGL = (e: ReactPointerEvent<Element>) => down(nearestNode(positions, toModel(e.clientX, e.clientY), r + 6 / view.k))(e);
  const labelOf = useMemo(() => new Map(graph.nodes.map(n => [n.id, n.label])), [graph.nodes]);
  if (!graph.nodes.length) {
    // no node: the table not arrived yet, a value at its path that is no table, or none yet (GEO-Q-31), under the title
    const from = typeof props.features === 'string' ? props.features : typeof props.nodes === 'string' ? props.nodes : undefined;
    const bound = typeof props.features === 'string' ? features : nodes;
    const state = from && bound === undefined ? 'loading' : from && (!bound || typeof bound !== 'object') ? 'error' : 'empty';
    return (
      <div className="as-graphview" data-component="GraphView" data-state={state}>
        {props.title ? <div className="bma-chart-tools"><div className="bma-title">{String(props.title)}</div></div> : null}
        {state === 'loading' ? <p className="bma-muted" aria-busy="true">Loading the graph…</p>
          : state === 'error' ? <p role="note">Unavailable: the {typeof props.features === 'string' ? 'features' : 'nodes'} at {from} do not read as a table.</p>
          : <Empty text="No nodes yet." />}
      </div>
    );
  }
  const fs = 11 / Math.max(1, view.k);   // label size on screen stays 11px however far one zooms in
  const count = `${graph.nodes.length} ${graph.nodes.length === 1 ? 'node' : 'nodes'} · ${graph.edges.length} ${graph.edges.length === 1 ? 'edge' : 'edges'}`;
  return (
    <div className="as-graphview" data-component="GraphView" data-layout={kind} data-selected={selected ?? ''} data-drawing={drawing}>
      <div className="bma-chart-tools">
        {props.title ? <div className="bma-title">{String(props.title)}</div> : null}
        <span className="as-graphview-zoom">
          <button type="button" className="bma-btn" aria-label="zoom in" onClick={() => zoom(1.25)}>+</button>
          <button type="button" className="bma-btn" aria-label="zoom out" onClick={() => zoom(1 / 1.25)}>−</button>
          <button type="button" className="bma-btn" onClick={() => setView({ tx: 0, ty: 0, k: 1 })}>Fit</button>
          <button type="button" className="bma-btn" aria-pressed={table} onClick={() => setTable(t => !t)}>{table ? 'Graph' : 'Table'}</button>
        </span>
      </div>
      {table ? (
        <table className="bma-table" data-graph-table>
          <thead><tr><th>From</th><th>Relation</th><th>To</th></tr></thead>
          <tbody>{graph.edges.map((e, i) => <tr key={i} data-lit={e.lit ? 'yes' : undefined}><td>{labelOf.get(e.source)}</td><td>{e.rel}{e.lit ? <span className="as-visually-hidden">{ON_PATH}</span> : null}</td><td>{labelOf.get(e.target)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="as-graphview-stage">
          {drawing === 'webgl' ? (
            <div ref={el => { glHost.current = el; stage.current = el; }} className="as-graphview-canvas as-graphview-gl" data-gl={glReady ? 'ready' : 'loading'}
              role="img" aria-label={`${String(props.title ?? 'graph')}: ${count}, drawn as a picture; the Table button lists every edge`} tabIndex={0}
              onKeyDown={keys} onPointerDown={downGL} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} />
          ) : (
          <svg ref={el => { stage.current = el; }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={String(props.title ?? 'graph')} className="as-graphview-canvas" tabIndex={0}
            onKeyDown={keys} onPointerDown={down()} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
            <defs><marker id={`as-arrow-${ctx.componentId}`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--bma-color-ink-muted)" /></marker></defs>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              <g className="edges">{graph.edges.map((e, i) => { const on = edgeOn(e, selected);
                return <path key={i} className={'edge' + (on ? ' on' : '') + (e.lit ? ' lit' : '')} d={curve(at(e.source), at(e.target), r + 3)} fill="none" stroke={on ? 'var(--bma-color-accent)' : 'var(--bma-color-line-strong, var(--bma-color-line))'}
                  strokeWidth={(on ? 2 : 1.4) / view.k} markerEnd={`url(#as-arrow-${ctx.componentId})`}><title>{e.rel + (e.lit ? ON_PATH : '')}</title></path>; })}</g>
              <g className="nodes">{graph.nodes.map(n => { const p = at(n.id); const hue = hues.get(n.kind); const on = nodeOn(n, selected);
                return (
                  <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={'node' + (on ? ' selected' : '') + (n.lit ? ' lit' : '')} onPointerDown={down(n.id)} data-node={n.id} role="button"
                    aria-label={`${n.label}${n.kind ? ', ' + n.kind : ''}${n.lit ? ON_PATH : ''}`}>
                    {on ? <circle className="halo" r={r + 9 / view.k} fill="var(--bma-color-accent)" fillOpacity={0.2} stroke="var(--bma-color-accent)" strokeOpacity={0.55} strokeWidth={1 / view.k} /> : null}
                    <circle className="disc" r={r} fill="var(--bma-color-panel)" stroke={hue} strokeWidth={(r > 3 ? 2.5 : 1.5) / view.k}><title>{`${n.label}${n.kind ? ' · ' + n.kind : ''}`}</title></circle>
                    {r > 3 ? <circle className="core" r={r * 0.38} fill={hue} /> : null}
                    {labels ? <Chip x={r + 5 / view.k} text={n.label} fs={fs} k={view.k} on={on} /> : null}
                  </g>
                ); })}</g>
            </g>
          </svg>
          )}
          <span className="as-graphview-count">{count}</span>
          {hues.size >= 2 ? <div className="bma-legend as-graphview-legend">{[...hues].map(([k, c]) => <span key={k}><span className="swatch" style={{ background: c }} />{k || '(no kind)'}</span>)}</div> : null}
        </div>
      )}
    </div>
  );
});

/** What a lit node's name and a lit edge's text add for a screen reader. */
const ON_PATH = ', on the path';

/** A gentle quadratic curve from a to b, bowed to one side by an eighth of its length, stopping `gap` short of b. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }, gap: number): string {
  // the control point: the midpoint pushed out along the normal by an eighth of the length
  const cx = (a.x + b.x) / 2 - (b.y - a.y) * 0.125, cy = (a.y + b.y) / 2 + (b.x - a.x) * 0.125;
  const tx = b.x - cx, ty = b.y - cy, t = Math.hypot(tx, ty) || 1;
  const ex = b.x - (tx / t) * gap, ey = b.y - (ty / t) * gap;
  return `M${r1(a.x)} ${r1(a.y)} Q${r1(cx)} ${r1(cy)} ${r1(ex)} ${r1(ey)}`;
}
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A node's label as a chip: a rounded rect in the panel colour behind the text. SVG text cannot be measured before it
 *  is drawn (nor at all on a server), so the chip's width is estimated from the length; long labels are cut, and the full
 *  label stays in the node's title and aria-label. */
function Chip({ x, text, fs, k, on }: { x: number; text: string; fs: number; k: number; on: boolean }) {
  const t = text.length > 32 ? text.slice(0, 31) + '…' : text;
  const px = 5 / Math.max(1, k), h = fs + 8 / Math.max(1, k), w = t.length * fs * 0.6 + 2 * px;
  return (
    <g className={on ? 'label on' : 'label'}>
      <rect x={x} y={-h / 2} width={w} height={h} rx={3 / Math.max(1, k)} fill="var(--bma-color-panel)" fillOpacity={0.86}
        stroke={on ? 'var(--bma-color-accent)' : 'var(--bma-color-line)'} strokeWidth={1 / k} />
      <text x={x + px} y={0} dominantBaseline="central" fontSize={fs} fill="currentColor">{t}</text>
    </g>
  );
}

/** Whether the page can make a WebGL 2 context, which deck.gl needs; the probe's context is let go at once. Asked once
 *  per large graph, not per page, so a test or a page that gains WebGL later is asked again. */
function hasWebGL2(): boolean {
  try {
    const g = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!g) return false;
    g.getExtension?.('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** The empty state: a glyph, a heading and the sentence the view has always shown. */
function Empty({ text }: { text: string }) {
  return <div className="as-empty"><span className="glyph" aria-hidden="true">◇</span><b>No graph yet</b><p>{text}</p></div>;
}
