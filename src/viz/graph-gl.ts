/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The WebGL drawing of agentspaces-viz/GraphView past 500 nodes (srad/agentspaces-geo.md GEO-G-03): deck.gl's layers in
// an OrthographicView, loaded on first use as a chunk of its own, so a page that never draws a large graph never loads
// it and the library's own bundle does not grow. SVG makes an element per node and per edge (7,000 at 2,000 nodes and
// 5,000 edges, three more per node once the labels show), every one kept in the page's memory and repainted on each pan,
// since a pan changes the transform of the group that holds them all; here a pan only moves the camera, and the GPU
// draws a few instanced buffers. The reason is that work and its headroom, not a measured frame rate: on an Apple M5
// (tools/perf-probe.mjs, 2026-11-13) both drawings panned at about 60 frames a second; with the labels showing, the
// SVG's own updates missed 67 of 413 frames (presented in part) and 1 was dropped, where WebGL missed none.
//
// The drawing is all this module does. GraphView keeps the graph, the layout, the view (pan and zoom), the selection and
// the pointer: it hit-tests a press against the node positions itself (nearestNode), the same way for both drawings, so
// deck.gl's controller and picking stay off. The look's colours are CSS values (often var(--…)); they are read once off
// the host element, through a 1x1 canvas, into the RGBA deck.gl takes.
import { Deck, OrthographicView } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { graphViewState, type GraphCamera } from './graph';

type Rgba = [number, number, number, number];

export interface GLNode { id: string; x: number; y: number; hue: string; label: string; on: boolean }
export interface GLEdge { a: { x: number; y: number }; b: { x: number; y: number }; on: boolean }

/** What one draw shows. GraphView memoizes the arrays, so a pan hands the same ones over and deck.gl moves only the camera. */
export interface GraphScene {
  nodes: readonly GLNode[];
  edges: readonly GLEdge[];
  /** The node radius in model units, as the SVG draws it. */
  r: number;
  labels: boolean;
  view: GraphCamera;
  /** The model box the layout fills (GraphView's viewBox). */
  width: number;
  height: number;
  /** Changes when the look or mode does, so the colours are read again. */
  colorKey: string;
}

export interface GraphGL {
  draw(scene: GraphScene): void;
  dispose(): void;
}

/** How long deck.gl has to start once the page has loaded, before the view draws SVG instead. */
const GRAPH_GL_START_MS = 8000;

/**
 * Makes the drawing in the host; rejects when the page has no WebGL 2 or deck.gl cannot start, and GraphView draws SVG.
 * An abort (the view unmounted, or switched to its table, while deck.gl was starting) stops the wait and frees the deck.
 * `onLost` is called when the drawing stops after it started (the browser took its WebGL context back: too many on the
 * page, the GPU process restarted, memory ran low), so the view can draw SVG rather than leave a blank canvas.
 */
export function createGraphGL(host: HTMLDivElement, signal?: AbortSignal, onLost?: (e: Error) => void): Promise<GraphGL> {
  return new Promise((resolve, reject) => {
    let ready = false;
    let deck: Deck<OrthographicView> | undefined;
    let last: GraphScene | undefined;
    const colors = new ColorReader(host);
    // a device that never starts (a blocked GPU, a lost context) would leave an empty stage, so the wait is bounded; but
    // luma.gl makes no device before the page has loaded, so the clock starts when it has (readyState turns complete
    // just before the load event), or a slow page (a large image, a PDF frame) would spend the budget before deck.gl
    // was even asked
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startClock = () => { timer = setTimeout(() => fail(new Error('deck.gl did not start')), GRAPH_GL_START_MS); };
    const loaded = () => { if (document.readyState !== 'complete') return; document.removeEventListener('readystatechange', loaded); startClock(); };
    const stopClock = () => { clearTimeout(timer); document.removeEventListener('readystatechange', loaded); };
    if (document.readyState === 'complete') startClock();
    else document.addEventListener('readystatechange', loaded);
    const fail = (e: unknown) => {
      if (ready) return;
      ready = true;
      stopClock();
      signal?.removeEventListener('abort', aborted);
      try { deck?.finalize(); } catch { /* a half-made deck */ }
      deck = undefined;
      colors.dispose();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const draw = (scene: GraphScene) => {
      last = scene;
      const viewState = graphViewState(scene.view, host.clientWidth, host.clientHeight, scene.width, scene.height);
      deck?.setProps({ viewState, layers: layersOf(scene, colors, Math.pow(2, viewState.zoom)) });
      host.dataset.drawn = 'yes';
    };
    // a resize changes the pixels per model unit, so the camera and the label offsets are worked out again
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { if (last && deck) draw(last); });
    const aborted = () => fail(new Error('aborted'));
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted);
    try {
      deck = new Deck<OrthographicView>({
        parent: host,
        views: new OrthographicView({ id: 'graph' }),
        viewState: { target: [400, 260], zoom: 0 },
        controller: false,
        width: '100%',
        height: '100%',
        style: { position: 'absolute', left: '0', top: '0' },
        layers: [],
        // before the start an error is a failed start; after it, deck.gl's own logging is what this prop replaced, so the
        // error is logged here (a lost context is handled below, not here)
        onError: (e: Error) => { if (!ready) fail(e); else console.error('GraphView: deck.gl:', e); },
        onLoad: () => {
          if (ready) return;
          ready = true;
          stopClock();
          signal?.removeEventListener('abort', aborted);
          resize?.observe(host);
          // the browser drops the oldest WebGL context when a page holds too many, and a GPU process restart drops all:
          // the canvas would stay blank, so the view is told and draws SVG
          const canvas = deck?.getCanvas();
          const lost = () => onLost?.(new Error('the WebGL context was lost'));
          canvas?.addEventListener('webglcontextlost', lost);
          resolve({
            draw,
            dispose() {
              canvas?.removeEventListener('webglcontextlost', lost);
              resize?.disconnect();
              colors.dispose();
              deck?.finalize();
              deck = undefined;
            },
          });
        },
      });
    } catch (e) {
      fail(e);
    }
  });
}

/** The layers of a scene; `px` is the CSS pixels one model unit spans at the current zoom. */
function layersOf(s: GraphScene, colors: ColorReader, px: number): Layer[] {
  const c = colors.read(s.colorKey);
  const sel = s.nodes.find(n => n.on);
  const out: Layer[] = [
    new PathLayer<GLEdge>({
      id: 'edges',
      data: s.edges,
      getPath: e => curve(e.a, e.b),
      getColor: e => (e.on ? c('var(--bma-color-accent)') : c('var(--bma-color-line-strong, var(--bma-color-line))')),
      getWidth: e => (e.on ? 2 : 1.2),
      widthUnits: 'pixels',
      updateTriggers: { getColor: s.colorKey },
    }),
  ];
  if (sel) {
    // the selected node's soft halo, under the discs, nine pixels wider than the disc as the SVG's is
    out.push(new ScatterplotLayer<GLNode>({
      id: 'halo',
      data: [sel],
      getPosition: n => [n.x, n.y],
      getRadius: s.r + 9 / s.view.k,
      radiusUnits: 'common',
      stroked: true,
      getFillColor: () => withAlpha(c('var(--bma-color-accent)'), 51),
      getLineColor: () => withAlpha(c('var(--bma-color-accent)'), 140),
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      updateTriggers: { getRadius: s.view.k, getFillColor: s.colorKey, getLineColor: s.colorKey },
    }));
  }
  out.push(new ScatterplotLayer<GLNode>({
    id: 'nodes',
    data: s.nodes,
    getPosition: n => [n.x, n.y],
    getRadius: s.r,
    radiusUnits: 'common',
    radiusMinPixels: 1.5,
    stroked: true,
    getFillColor: () => c('var(--bma-color-panel)'),
    getLineColor: n => c(n.hue),
    lineWidthUnits: 'pixels',
    getLineWidth: 1.5,
    updateTriggers: { getFillColor: s.colorKey, getLineColor: s.colorKey, getRadius: s.r },
  }));
  // labels draw when the SVG's would (zoomed in past a large graph's overview), and the selected node's always
  const labelled = s.labels ? s.nodes : sel ? [sel] : [];
  if (labelled.length) {
    out.push(new TextLayer<GLNode>({
      id: 'labels',
      data: labelled,
      getPosition: n => [n.x, n.y],
      getText: n => (n.label.length > 32 ? n.label.slice(0, 31) + '…' : n.label),
      characterSet: 'auto',
      getSize: 11,
      sizeUnits: 'pixels',
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      getPixelOffset: [s.r * px + 6, 0],
      getColor: () => c('var(--bma-color-ink)'),
      background: true,
      getBackgroundColor: () => withAlpha(c('var(--bma-color-panel)'), 219),
      getBorderColor: n => (n.on ? c('var(--bma-color-accent)') : c('var(--bma-color-line)')),
      getBorderWidth: 1,
      backgroundPadding: [5, 3],
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      updateTriggers: { getColor: s.colorKey, getBackgroundColor: s.colorKey, getBorderColor: s.colorKey, getPixelOffset: px },
    }));
  }
  return out;
}

/** The SVG's gentle quadratic curve, bowed by an eighth of its length, as eight straight steps. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }): [number, number][] {
  const cx = (a.x + b.x) / 2 - (b.y - a.y) * 0.125, cy = (a.y + b.y) / 2 + (b.x - a.x) * 0.125;
  const out: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, u = 1 - t;
    out.push([u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y]);
  }
  return out;
}

const withAlpha = ([r, g, b]: Rgba, a: number): Rgba => [r, g, b, a];

/**
 * Turns a CSS colour as the host resolves it (a hex, rgb(), a var(--…) of the look, a color-mix) into RGBA: a hidden
 * span inside the host takes the value as its colour, so the look's variables apply, and a 1x1 canvas paints the
 * computed colour and reads the pixel back, which handles every colour syntax the browser does. Cached per look.
 */
class ColorReader {
  private cache = new Map<string, Rgba>();
  private key = '';
  private probe: HTMLSpanElement;
  private ctx: CanvasRenderingContext2D | null;
  constructor(host: HTMLElement) {
    this.probe = document.createElement('span');
    this.probe.style.display = 'none';
    host.appendChild(this.probe);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  read(key: string): (css: string) => Rgba {
    if (key !== this.key) { this.cache.clear(); this.key = key; }
    return css => {
      let v = this.cache.get(css);
      if (!v) { v = this.resolve(css); this.cache.set(css, v); }
      return v;
    };
  }
  private resolve(css: string): Rgba {
    this.probe.style.color = '';
    this.probe.style.color = css;
    const computed = getComputedStyle(this.probe).color || css;
    if (!this.ctx) return [68, 119, 170, 255];
    this.ctx.clearRect(0, 0, 1, 1);
    this.ctx.fillStyle = '#4477aa';   // what an unreadable colour draws as: the look's first categorical hue
    this.ctx.fillStyle = computed;
    this.ctx.fillRect(0, 0, 1, 1);
    const d = this.ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }
  dispose() { this.probe.remove(); }
}
