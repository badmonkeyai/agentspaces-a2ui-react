#!/usr/bin/env node
/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The frame-rate probe (srad/agentspaces-geo.md GEO-M-04, GEO-Q-20 and GEO-G-03): bundles a probe page from src/ with
// esbuild, serves it on a free port, and opens it in Chrome over the DevTools protocol in a 2560x1440 window. The page
// draws, one at a time:
//   map        a GeoMap of 10,000 point features and 500 polygons on the plain basemap (no tiles, so the network is
//              not measured), panned by a held mouse for several seconds
//   graph      a GraphView of 2,000 nodes and 5,000 edges, laid out by force (the layout timed), drawn with WebGL, panned
//              the same way, then zoomed in until the labels show and panned again
//   graph-svg  the same graph with WebGL hidden from the page, so it draws SVG: the drawing the WebGL one replaces,
//              panned, then zoomed in until the labels show and panned again
// After the WebGL graph's pans the probe takes its WebGL context away (WEBGL_lose_context), as a browser does when a page
// holds too many, and checks the view draws SVG instead of a blank canvas.
//
// The mouse is real input (Input.dispatchMouseEvent), sent about every 8 ms without waiting for each to be handled, so
// the page gets a move on every frame it draws (Chrome hands a page at most one move a frame) and the input is never
// what limits the rate. The number is content frames: frames in which the drawing drew something new, not frames the
// page merely ticked through. A requestAnimationFrame loop marks each frame; for a canvas a frame counts when a WebGL
// draw call was made since the last one (the probe page wraps WebGL2RenderingContext's draw calls), for SVG when the
// drawing's elements changed (a MutationObserver). A drawing too slow for the frame makes fewer frames, and fewer of
// them count. A frame the page drew can still be dropped later, by the compositor or the GPU process (a raster that
// fell behind), so the probe also traces the compositor's own record of each frame (PipelineReporter: presented,
// partly presented, dropped) and takes the dropped share off: frames shown = content frames x (1 - dropped share).
// The probe prints content frames a second, frames shown a second, the 95th-percentile and worst gap between content
// frames, the ticks and pointer moves the page saw, the compositor's counts, the layout time and the WebGL renderer,
// and writes dist/perf.json.
// The targets, while panning: 30 frames shown a second, at least 30 pointer moves a second reaching the page, and a
// picture that moved; and a layout under 2 s. A missed target exits 1.
//   node tools/perf-probe.mjs [--headful] [--dpr=2] [--seconds=6] [--only=map,graph,graph-svg]
// Headless Chrome is tried with the GPU (Metal through ANGLE on macOS). When the page reports a software renderer
// (SwiftShader), the numbers measure the CPU, not the laptop's GPU: run with --headful, which opens a real window,
// placed off the screen. Chrome is stopped by its own process id and its profile removed, whatever happens.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// the package root, whatever directory the probe is run from
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.log('perf-probe: skipped (no Chrome at ' + CHROME + ')'); process.exit(0); }
const WIDTH = 2560, HEIGHT = 1440;
const DPR = Number(args.dpr ?? 1);
const SECONDS = Number(args.seconds ?? 6);
const ONLY = new Set(String(args.only ?? 'map,graph,graph-svg').split(','));
const debug = 9400 + Math.floor(Math.random() * 300);
const dir = '/tmp/as_perf_' + debug;
const profile = dir + '-profile';

// ---- the page: src/ bundled whole (the lazy chunks inlined), React in production mode, MapLibre's worker beside it
const PAGE = `
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import * as ui from './src/index';

// a seeded generator, so every run draws the same features and the same graph
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mapData() {
  const r = rng(7);
  const points = Array.from({ length: 10000 }, (_, i) => ({ type: 'Feature', id: 'p' + i, kind: 'probe.point', label: 'Point ' + i,
    geometry: { type: 'Point', coordinates: [-20 + 40 * r(), 35 + 22 * r()] } }));
  const areas = Array.from({ length: 500 }, (_, i) => {
    const x = -20 + 40 * r(), y = 35 + 22 * r(), w = 0.2 + 0.6 * r(), v = 0.15 + 0.4 * r();
    return { type: 'Feature', id: 'a' + i, kind: 'probe.area', label: 'Area ' + i,
      geometry: { type: 'Polygon', coordinates: [[[x, y], [x + w, y + 0.2 * v], [x + w * 0.8, y + v], [x - 0.1 * w, y + v * 0.7], [x, y]]] } };
  });
  return { points, areas };
}
function graphData() {
  const nodes = Array.from({ length: 2000 }, (_, i) => ({ id: 'n' + i, label: 'node ' + i, kind: 'kind ' + (i % 6) }));
  const edges = Array.from({ length: 5000 }, (_, i) => ({ source: 'n' + (i % 2000), target: 'n' + ((i * 7 + 13) % 2000), rel: 'feeds' }));
  return { nodes, edges };
}
const surface = (catalogId, components, value) => [
  { version: '1.0', createSurface: { surfaceId: 'probe', catalogId } },
  { version: '1.0', updateComponents: { surfaceId: 'probe', components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
  { version: '1.0', updateDataModel: { surfaceId: 'probe', path: '/', value } },
];
const root = createRoot(document.getElementById('probe'));
// every WebGL draw call marks the frame as one that drew; the content-frame count reads and clears the mark each frame
let drew = false;
for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
  if (!C) continue;
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
    const fn = C.prototype[name];
    if (typeof fn === 'function') C.prototype[name] = function (...a) { drew = true; return fn.apply(this, a); };
  }
}
// not window.probe: deck.gl's logging library (probe.gl) takes that global name for itself
window.asPerf = {
  renderer() {
    const g = document.createElement('canvas').getContext('webgl2');
    if (!g) return 'no WebGL 2';
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  },
  map() {
    const { points, areas } = mapData();
    document.body.dataset.scene = 'map';
    root.render(h(ui.Surfaces, { envelopes: surface('agentspaces-geo', [{ id: 'map', component: 'GeoMap', basemap: 'plain', home: { center: [0, 46], zoom: 5 },
      layers: [{ path: '/areas', label: 'Areas' }, { path: '/points', label: 'Points' }] }], { points, areas }) }));
    return { points: points.length, polygons: areas.length };
  },
  graph(svg) {
    const g = graphData();
    if (svg) {
      // hide WebGL 2 from the page for this one, so the view draws SVG
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : get.call(this, kind, ...rest); };
    }
    document.body.dataset.scene = svg ? 'graph-svg' : 'graph';
    const t0 = performance.now();
    const laid = ui.graphLayout(ui.graphOf(g.nodes, g.edges), 'force', 800, 520);
    const layoutMs = performance.now() - t0;
    window.__laid = laid;
    window.__mounted = performance.now();
    root.render(h(ui.Surfaces, { envelopes: surface('agentspaces-viz', [{ id: 'graph', component: 'GraphView', nodes: '/nodes', edges: '/edges', layout: 'force', title: 'Probe' }], g) }));
    return { nodes: g.nodes.length, edges: g.edges.length, layoutMs };
  },
  // a place on the graph's background to press for a pan, with no node within reach (a press on a node drags it)
  graphBackground() {
    const el = document.querySelector('.as-graphview-canvas');
    const box = el.getBoundingClientRect();
    const s = box.width / 800;
    // asked with the view fitted (k = 1, no pan) or zoomed about the middle by k (window.__k), where a box point x is the
    // model point 400 + (x - 400) / k
    const k = window.__k || 1, c = { x: 400, y: 260 };
    for (let gx = 0.3; gx <= 0.7; gx += 0.01) for (let gy = 0.3; gy <= 0.7; gy += 0.01) {
      const x = box.left + gx * box.width, y = box.top + gy * box.height;
      const m = { x: c.x + ((x - box.left) / s - c.x) / k, y: c.y + ((y - box.top) / s - c.y) / k };
      if (!ui.nearestNode(window.__laid, m, 14 / k)) return { x, y };
    }
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  },
  // takes the WebGL graph's context away, as the browser does when a page holds too many
  loseContext() {
    const c = document.querySelector('.as-graphview-gl canvas');
    const x = c?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!x) return false;
    x.loseContext();
    return true;
  },
  // the view's own keys on its focused drawing: 0 fits (undoing a pan), each + zooms by 1.25 about the middle
  zoomIn(times) {
    const el = document.querySelector('.as-graphview-canvas');
    el.focus();
    for (const key of ['0', ...Array(times).fill('+')]) el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    window.__k = 1.25 ** times;
    return true;
  },
  state() {
    const map = document.querySelector('[data-component="GeoMap"]');
    const graph = document.querySelector('[data-component="GraphView"]');
    const gl = document.querySelector('.as-graphview-gl');
    return { map: map?.dataset.state, drawing: graph?.dataset.drawing, drawn: gl?.dataset.drawn === 'yes', nodes: document.querySelectorAll('[data-node]').length,
      sinceMount: window.__mounted ? performance.now() - window.__mounted : 0 };
  },
  // counts frames from here: every tick, and the ticks whose frame drew something new. 'gl' counts a frame with a WebGL
  // draw call in it; 'dom' a frame in which the drawing's elements changed (an SVG pan rewrites its group's transform)
  start(kind) {
    const f = window.__frames = { ticks: [], content: [], on: true, moves: 0 };
    // the pointer moves the page saw, so a pan that never reached the drawing does not pass as a smooth one
    f.count = () => { f.moves++; };
    window.addEventListener('pointermove', f.count, true);
    let changed = false;
    f.observer = new MutationObserver(() => { changed = true; });
    if (kind === 'dom') f.observer.observe(document.getElementById('probe'), { subtree: true, attributes: true, childList: true, characterData: true });
    drew = false;
    const loop = ts => {
      if (!f.on) return;
      f.ticks.push(ts);
      if (kind === 'dom' ? changed : drew) f.content.push(ts);
      changed = drew = false;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  stop() {
    const f = window.__frames; f.on = false;
    f.observer.disconnect();
    window.removeEventListener('pointermove', f.count, true);
    // the span is the ticks', so a pan whose drawing stalled at the end does not shorten its own window
    const span = (f.ticks.at(-1) - f.ticks[0]) / 1000;
    const gaps = f.content.slice(1).map((t, i) => t - f.content[i]).sort((a, b) => a - b);
    return { moves: f.moves, movesPerSecond: f.moves / span, ticks: f.ticks.length, frames: f.content.length, seconds: span,
      fps: span > 0 ? f.content.length / span : 0, p95ms: gaps[Math.floor(gaps.length * 0.95)] ?? 0, worstMs: gaps.at(-1) ?? 0,
      slowFrames: gaps.filter(g => g > 1000 / 30).length };
  },
};
document.body.dataset.ready = 'yes';
`;
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>perf probe</title><link rel="stylesheet" href="a2ui-react.css">
<style>html,body{margin:0;height:100%} #probe{height:100%} #probe .bma-look{height:100%} #probe .as-geomap{height:calc(100vh - 16px)}
[data-scene^="graph"] #probe [data-component="GraphView"]{width:2060px;margin:0 auto}</style></head>
<body><div id="probe"></div><script type="module" src="probe.js"></script></body></html>`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
// the GPU flags: Metal through ANGLE, the GPU on whatever the blocklist says, and no throttling of a page that is not
// in front (a headless or off-screen window would otherwise be held to a low frame rate)
const flags = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', '--disable-extensions'];
const mode = args.headful ? ['--window-position=-' + (WIDTH + 200) + ',0'] : ['--headless=new'];
const chromeArgs = [...mode, ...flags, `--window-size=${WIDTH},${HEIGHT}`, `--force-device-scale-factor=${DPR}`, '--remote-debugging-port=' + debug, '--user-data-dir=' + profile, 'about:blank'];
const result = { when: new Date().toISOString(), chrome: CHROME, flags: chromeArgs.filter(a => !a.startsWith('--remote-debugging-port') && !a.startsWith('--user-data-dir') && a !== 'about:blank'),
  window: `${WIDTH}x${HEIGHT}`, dpr: DPR, seconds: SECONDS, scenes: {} };
let failed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let server, chrome;
// everything that makes the page directory, the server or Chrome sits in this try, so a failed bundle or copy still
// removes what was made
try {
  mkdirSync(dir, { recursive: true });
  await build({ stdin: { contents: PAGE, resolveDir: ROOT, loader: 'js', sourcefile: 'probe-page.js' }, bundle: true, format: 'esm', target: 'es2022', platform: 'browser',
    jsx: 'automatic', minify: true, outfile: join(dir, 'probe.js'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
  copyFileSync(join(ROOT, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'), join(dir, 'maplibre-gl-worker.mjs'));
  copyFileSync(join(ROOT, 'src/a2ui-react.css'), join(dir, 'a2ui-react.css'));
  writeFileSync(join(dir, 'index.html'), HTML);
  server = createServer((req, res) => {
    const path = join(dir, decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(readFileSync(path));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });
  let targets;
  for (let attempt = 0; ; attempt++) { try { targets = await (await fetch(`http://127.0.0.1:${debug}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch (e) { if (attempt >= 75) throw e; } await sleep(200); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const pending = {}; const errors = []; const traced = []; let traceDone = () => {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Tracing.dataCollected') traced.push(...m.params.value);
    if (m.method === 'Tracing.tracingComplete') traceDone();
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
  const until = async (expression, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evaluate(expression)) return; await sleep(100); } throw new Error('timed out waiting for ' + what); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false });
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  // a picture of the middle of the window, small, to tell whether a pan moved what is drawn
  const shot = async () => (await send('Page.captureScreenshot', { format: 'png', clip: { x: WIDTH / 4, y: HEIGHT / 4, width: WIDTH / 2, height: HEIGHT / 2, scale: 0.25 } })).result?.data;
  // a held mouse that sweeps a figure of eight around where it was pressed. A move is sent about every 8 ms and not
  // waited for (waiting on each round trip held the rate near thirty a second, the target itself); Chrome coalesces
  // what arrives between two frames, so the page gets one move a frame and every frame has a new place to draw
  // the compositor's record of each frame of the page's layer tree (the tree with the most frames; the others are
  // Chrome's own): presented whole, presented in part, dropped, or nothing to update
  const compositor = () => {
    const trees = {};
    for (const ev of traced) {
      const fr = ev.name === 'PipelineReporter' && ev.ph === 'b' && ev.args?.frame_reporter;
      if (fr) { const t = (trees[fr.layer_tree_host_id] ??= { total: 0 }); t.total++; t[fr.state] = (t[fr.state] ?? 0) + 1; }
    }
    const page = Object.values(trees).sort((a, b) => b.total - a.total)[0] ?? { total: 0 };
    const presented = page.STATE_PRESENTED_ALL ?? 0, partial = page.STATE_PRESENTED_PARTIAL ?? 0, dropped = page.STATE_DROPPED ?? 0;
    return { presented, partial, dropped, noUpdate: page.STATE_NO_UPDATE_DESIRED ?? 0, droppedShare: dropped / Math.max(1, presented + partial + dropped) };
  };
  const pan = async (x, y, kind) => {
    const before = await shot();
    traced.length = 0;
    await send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-devtools.timeline.frame'] }, transferMode: 'ReportEvents' });
    await evaluate(`asPerf.start(${JSON.stringify(kind)})`);
    await mouse('mousePressed', x, y);
    const t0 = Date.now(), sent = [];
    while (Date.now() - t0 < SECONDS * 1000) {
      const t = (Date.now() - t0) / 1000;
      sent.push(mouse('mouseMoved', Math.round(x + 420 * Math.sin(t * 2.2)), Math.round(y + 240 * Math.sin(t * 4.4))));
      await sleep(8);
    }
    await Promise.all(sent);
    const frames = await evaluate('asPerf.stop()');
    const done = new Promise(r => { traceDone = r; });
    await send('Tracing.end');
    await done;
    frames.compositor = compositor();
    frames.shownFps = frames.fps * (1 - frames.compositor.droppedShare);
    frames.sent = sent.length;
    frames.sentPerSecond = sent.length / ((Date.now() - t0) / 1000);
    // the picture is taken with the mouse still held where the sweep ended, away from where it was pressed
    frames.moved = (await shot()) !== before;
    await mouse('mouseReleased', x, y);
    return frames;
  };
  const load = async () => { await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` }); await until(`document.body?.dataset.ready === 'yes'`, 20000, 'the probe page'); };
  await load();
  result.renderer = await evaluate('asPerf.renderer()');
  result.hardware = !/swiftshader|llvmpipe|software|no webgl/i.test(result.renderer);
  console.log(`perf-probe: ${args.headful ? 'headful, off the screen' : 'headless (--headless=new)'}, ${WIDTH}x${HEIGHT} at ${DPR}x, WebGL renderer: ${result.renderer}${result.hardware ? '' : ' (SOFTWARE: these numbers measure the CPU)'}`);

  if (ONLY.has('map')) {
    const drawn = await evaluate('asPerf.map()');
    await until(`asPerf.state().map === 'map'`, 30000, 'the map');
    await sleep(2500);   // the first frames: the layers' buffers, the label atlas
    const frames = await pan(WIDTH / 2, HEIGHT / 2, 'gl');
    result.scenes.map = { ...drawn, pan: frames };
    report('map', `${drawn.points.toLocaleString('en')} points, ${drawn.polygons} polygons`, frames);
  }
  if (ONLY.has('graph')) {
    await load();
    const drawn = await evaluate('asPerf.graph(false)');
    await until(`asPerf.state().drawn`, 30000, 'the WebGL graph');
    const first = await evaluate('asPerf.state()');
    await sleep(1500);
    const at = await evaluate('asPerf.graphBackground()');
    const frames = await pan(at.x, at.y, 'gl');
    // zoomed in past 1.5, where the labels draw (2,000 chips in deck.gl's TextLayer)
    await evaluate('asPerf.zoomIn(2)');
    await sleep(1500);
    const at2 = await evaluate('asPerf.graphBackground()');
    const labelled = await pan(at2.x, at2.y, 'gl');
    // a lost context (the browser takes it back when a page holds too many) must leave SVG, not a blank canvas
    const lost = await evaluate('asPerf.loseContext()');
    let afterLoss = 'no context to lose';
    if (lost) {
      try { await until(`asPerf.state().drawing === 'svg' && asPerf.state().nodes >= 2000`, 10000, 'SVG after the lost context'); afterLoss = 'svg'; }
      catch { afterLoss = (await evaluate('asPerf.state()')).drawing; }
    }
    result.scenes.graph = { ...drawn, drawing: first.drawing, firstDrawMs: first.sinceMount, pan: frames, panWithLabels: labelled, afterContextLoss: afterLoss };
    console.log(`perf-probe: graph layout of ${drawn.nodes.toLocaleString('en')} nodes and ${drawn.edges.toLocaleString('en')} edges: ${drawn.layoutMs.toFixed(0)} ms (target under 2,000 ms); drawn with ${first.drawing}, first drawn ${first.sinceMount.toFixed(0)} ms after mounting`);
    if (drawn.layoutMs >= 2000) failed++;
    if (first.drawing !== 'webgl') { console.log('perf-probe: the graph did not draw with WebGL'); failed++; }
    report('graph', 'WebGL, labels off', frames);
    report('graph', 'WebGL, zoomed in, labels on', labelled);
    console.log(`perf-probe: graph, WebGL context lost: the view drew ${afterLoss === 'svg' ? 'SVG instead' : afterLoss + ' (SHOULD BE SVG)'}`);
    if (afterLoss !== 'svg') failed++;
  }
  if (ONLY.has('graph-svg')) {
    await load();
    await evaluate('asPerf.graph(true)');
    await until(`asPerf.state().nodes >= 2000`, 30000, 'the SVG graph');
    await sleep(1500);
    const at = await evaluate('asPerf.graphBackground()');
    const frames = await pan(at.x, at.y, 'dom');
    await evaluate('asPerf.zoomIn(2)');
    await sleep(1500);
    const at2 = await evaluate('asPerf.graphBackground()');
    const labelled = await pan(at2.x, at2.y, 'dom');
    result.scenes.graphSvg = { drawing: (await evaluate('asPerf.state()')).drawing, pan: frames, panWithLabels: labelled };
    // the SVG drawing is what WebGL replaces past 500 nodes: shown for comparison, not held to the target
    report('graph-svg', 'SVG, labels off, for comparison (no target)', frames, false);
    report('graph-svg', 'SVG, zoomed in, labels on, for comparison (no target)', labelled, false);
  }
  if (errors.length) { console.log('perf-probe: the page threw:\n  ' + errors.join('\n  ')); failed++; }
  result.errors = errors;
  ws.close();
} catch (e) {
  console.log('perf-probe: ' + (e?.stack || e));
  result.error = String(e?.message || e);
  failed++;
} finally {
  server?.close();
  if (chrome) await new Promise(r => { if (chrome.exitCode !== null) r(); else { chrome.once('exit', r); chrome.kill(); } });
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  rmSync(dir, { recursive: true, force: true });
}
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/perf.json'), JSON.stringify(result, null, 2) + '\n');
if (failed) { console.log(`perf-probe: FAILED, ${failed} target(s) missed or step(s) broken (dist/perf.json)`); process.exit(1); }
console.log('perf-probe: every target met (dist/perf.json)');

function report(scene, what, f, held = true) {
  // the moves must reach the page at the target rate or better, or a slow input, not the drawing, would set the number
  const fast = f.movesPerSecond >= 30;
  const ok = f.shownFps >= 30 && f.moved && fast;
  if (held && !ok) failed++;
  const c = f.compositor;
  console.log(`perf-probe: ${scene}, ${what}: ${f.shownFps.toFixed(1)} frames shown a second over ${f.seconds.toFixed(1)} s of panning `
    + `(${f.fps.toFixed(1)} content frames a second, ${f.frames} that drew of ${f.ticks} ticks; compositor ${c.presented} presented, ${c.partial} partly, ${c.dropped} dropped; `
    + `${f.moves} pointer moves reached the page, ${f.movesPerSecond.toFixed(0)} a second, of ${f.sent} sent; gap between content frames: 95th percentile ${f.p95ms.toFixed(1)} ms, worst ${f.worstMs.toFixed(1)} ms, ${f.slowFrames} over 33 ms)`
    + `${f.moved ? '' : ' THE DRAWING DID NOT MOVE'}${fast ? '' : ' TOO FEW MOVES REACHED THE PAGE'}${held && f.shownFps < 30 ? ' BELOW 30' : ''}`);
}
