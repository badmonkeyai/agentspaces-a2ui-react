// agentspaces-viz/GraphView past 500 nodes (srad/agentspaces-geo.md GEO-G-03): SVG up to 500 nodes, WebGL (deck.gl, a
// chunk loaded on first use) past it where the page has WebGL 2, and SVG again when it has none or deck.gl does not
// start. happy-dom has no WebGL, so these tests check the switch, the canvas's accessible label and keys, a press that
// finds its node by position, and the fallback; tools/perf-probe.mjs draws the real thing in Chrome, and there checks
// that a lost WebGL context falls back to SVG too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, click, key, React, ui } from './setup.mjs';

const surf = (components, value) => [
  { version: '1.0', createSurface: { surfaceId: 'v', catalogId: 'agentspaces-viz' } },
  { version: '1.0', updateComponents: { surfaceId: 'v', components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
  { version: '1.0', updateDataModel: { surfaceId: 'v', path: '/', value } },
];
const draw = async (components, value) => { const actions = []; const m = await mount(React.createElement(ui.Surfaces, { envelopes: surf(components, value), onAction: a => actions.push(a) })); return { ...m, actions }; };
const big = n => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: 'n' + i, label: 'node ' + i, kind: 'k' + (i % 3) })),
  edges: Array.from({ length: n }, (_, i) => ({ source: 'n' + i, target: 'n' + ((i * 7 + 13) % n), rel: 'feeds' })),
});
const view = { id: 'g', component: 'GraphView', nodes: '/nodes', edges: '/edges', layout: 'force', selectAction: 'inspect', title: 'Supply' };

/** Gives the page a WebGL 2 context to find (the probe GraphView makes), and none to deck.gl's own canvas after it. */
function fakeWebGL() {
  const orig = HTMLCanvasElement.prototype.getContext;
  let asked = 0;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    if (kind === 'webgl2') return ++asked === 1 ? { getExtension: () => ({ loseContext() {} }) } : null;
    return orig.call(this, kind, ...rest);
  };
  return () => { HTMLCanvasElement.prototype.getContext = orig; };
}

test('the switch: SVG up to 500 nodes, WebGL past it only where the page has it', () => {
  assert.equal(ui.GRAPH_WEBGL_PAST, 500);
  assert.equal(ui.graphDrawing(500, true), 'svg');
  assert.equal(ui.graphDrawing(501, true), 'webgl');
  assert.equal(ui.graphDrawing(2000, false), 'svg', 'no WebGL, SVG still');
  assert.equal(ui.graphDrawing(0, true), 'svg');
});

test('the WebGL camera draws what the SVG draws: the box fitted to the host, then panned and zoomed', () => {
  assert.deepEqual(ui.graphViewState({ tx: 0, ty: 0, k: 1 }, 800, 520, 800, 520), { target: [400, 260], zoom: 0 });
  assert.deepEqual(ui.graphViewState({ tx: 0, ty: 0, k: 1 }, 1600, 1040, 800, 520), { target: [400, 260], zoom: 1 });
  // a model point's screen place, by deck.gl's orthographic rule (the target at the middle, 2^zoom pixels per unit),
  // matches the SVG's (x·k + tx, scaled by the host over the box)
  const cam = { tx: 120, ty: -40, k: 2.5 }, bw = 1200, bh = 780, s = bw / 800;
  const { target, zoom } = ui.graphViewState(cam, bw, bh, 800, 520);
  for (const [x, y] of [[0, 0], [400, 260], [731, 12]]) {
    const deckX = (x - target[0]) * 2 ** zoom + bw / 2, deckY = (y - target[1]) * 2 ** zoom + bh / 2;
    assert.ok(Math.abs(deckX - (x * cam.k + cam.tx) * s) < 1e-6 && Math.abs(deckY - (y * cam.k + cam.ty) * s) < 1e-6, `(${x}, ${y})`);
  }
});

test('a press finds the nearest node within reach, or none', () => {
  const at = new Map([['a', { x: 10, y: 10 }], ['b', { x: 30, y: 10 }]]);
  assert.equal(ui.nearestNode(at, { x: 12, y: 11 }, 5), 'a');
  assert.equal(ui.nearestNode(at, { x: 27, y: 10 }, 5), 'b');
  assert.equal(ui.nearestNode(at, { x: 20, y: 30 }, 5), undefined, 'out of reach');
});

test('past 500 nodes with no WebGL the view draws SVG as before, every node an element', async () => {
  const p = await draw([view], big(600));
  const v = p.container.querySelector('[data-component="GraphView"]');
  assert.equal(v.dataset.drawing, 'svg');
  assert.equal(v.querySelectorAll('[data-node]').length, 600);
  assert.equal(v.querySelector('.as-graphview-gl'), null);
  await p.unmount();
});

test('up to 500 nodes the view draws SVG even where the page has WebGL', async () => {
  const restore = fakeWebGL();
  try {
    const p = await draw([view], big(500));
    const v = p.container.querySelector('[data-component="GraphView"]');
    assert.equal(v.dataset.drawing, 'svg');
    assert.equal(v.querySelectorAll('[data-node]').length, 500);
    await p.unmount();
  } finally { restore(); }
});

test('past 500 nodes with WebGL: a labelled canvas, the keys, a press that selects by position, and the table', async () => {
  const restore = fakeWebGL();
  try {
    const data = big(600);
    const p = await draw([view], data);
    const v = p.container.querySelector('[data-component="GraphView"]');
    assert.equal(v.dataset.drawing, 'webgl');
    const host = v.querySelector('.as-graphview-stage > .as-graphview-gl');
    assert.ok(host, 'the WebGL host sits in the stage');
    assert.equal(v.querySelectorAll('[data-node]').length, 0, 'no element per node');
    assert.equal(host.getAttribute('role'), 'img');
    assert.equal(host.getAttribute('tabindex'), '0', 'the canvas takes the keys');
    assert.match(host.getAttribute('aria-label'), /^Supply: 600 nodes · 600 edges, .*Table/);
    assert.equal(v.querySelector('.as-graphview-count').textContent, '600 nodes · 600 edges');
    assert.ok(v.querySelector('.as-graphview-legend').textContent.includes('k2'), 'the legend lies over the canvas as over the svg');
    // a press on a node's place selects it: happy-dom's box is empty, so a client pixel is a model unit at the start
    const at = ui.graphLayout(ui.graphOf(data.nodes, data.edges), 'force', 800, 520).get('n42');
    await React.act(async () => {
      host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: at.x + 1, clientY: at.y, pointerId: 1 }));
      host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: at.x + 1, clientY: at.y, pointerId: 1 }));
    });
    assert.equal(v.dataset.selected, 'n42');
    assert.deepEqual(p.actions.at(-1).context, { id: 'n42', kind: 'k0' });
    // the arrows pan: two presses of ArrowLeft move every node 80 model units right on the screen. Before the pan, a
    // press 80 to the right of n42 is not on n42 (it finds another node or none); after it, the same press is on n42
    // and selects it again, a new action, so a press that ignored the pan could not pass
    const press = async x => React.act(async () => {
      host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: at.y, pointerId: 1 }));
      host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: at.y, pointerId: 1 }));
    });
    let n = p.actions.length;
    await press(at.x + 81);
    assert.ok(p.actions.slice(n).every(a => a.context.id !== 'n42'), 'before the pan the press is off n42');
    await key(host, 'ArrowLeft');
    await key(host, 'ArrowLeft');
    n = p.actions.length;
    await press(at.x + 81);
    assert.equal(p.actions.length, n + 1, 'the press after the pan selects a node');
    assert.deepEqual(p.actions.at(-1).context, { id: 'n42', kind: 'k0' }, 'the press follows the pan');
    assert.equal(v.dataset.selected, 'n42');
    await key(host, '0');
    // the table is the list a screen reader reads
    await click([...v.querySelectorAll('button')].find(b => b.textContent === 'Table'));
    assert.equal(v.querySelectorAll('[data-graph-table] tbody tr').length, 600);
    assert.equal(v.querySelector('[data-graph-table] tbody tr td').textContent, 'node 0');
    await click([...v.querySelectorAll('button')].find(b => b.textContent === 'Graph'));
    assert.ok(v.querySelector('.as-graphview-gl'), 'back to the canvas');
    await p.unmount();
  } finally { restore(); }
});

/** Draws Surfaces whose envelopes the test can replace, to hand the view a new graph. */
async function drawLive(value) {
  const actions = [];
  let set;
  function Live() {
    const [envelopes, setEnvelopes] = React.useState(() => surf([view], value));
    set = setEnvelopes;
    return React.createElement(ui.Surfaces, { envelopes, onAction: a => actions.push(a) });
  }
  const m = await mount(React.createElement(Live));
  const update = async next => React.act(async () => set(e => [...e, { version: '1.0', updateDataModel: { surfaceId: 'v', path: '/', value: next } }]));
  return { ...m, actions, update };
}
const waitFor = async (ok, ms) => { for (let t = 0; t < ms && !ok(); t += 100) await React.act(async () => { await new Promise(r => setTimeout(r, 100)); }); };

// luma.gl waits for the window's load event before it makes deck.gl's device, and happy-dom never fires it, so deck.gl
// never starts here: the case the view's bounded wait (8 s) is for. The test holds the page at interactive, then turns
// it complete with a readystatechange, as a browser does just before load, and leaves load itself unfired.
test('the start budget runs once the page has loaded: a slow page keeps WebGL, a stuck start falls back to SVG, a new graph tries again', async () => {
  const restore = fakeWebGL();
  Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true });
  try {
    const p = await drawLive(big(600));
    const v = p.container.querySelector('[data-component="GraphView"]');
    assert.equal(v.dataset.drawing, 'webgl');
    // longer than the budget with the page still loading: no device has been asked for yet, so this is no failed start
    await waitFor(() => false, 9000);
    assert.equal(v.dataset.drawing, 'webgl', 'no fallback while the page is still loading');
    assert.equal(v.querySelector('.as-graphview-gl').dataset.gl, 'loading');
    // the page loads; deck.gl still does not start, and after the budget the view draws SVG
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    await React.act(async () => { document.dispatchEvent(new Event('readystatechange')); });
    await waitFor(() => v.dataset.drawing === 'svg', 9500);
    assert.equal(v.dataset.drawing, 'svg', 'SVG once the budget has run out after the load');
    assert.equal(v.querySelectorAll('[data-node]').length, 600, 'every node drawn as SVG');
    // a graph of another shape is a new attempt, so one miss does not keep every later graph on SVG
    const next = big(600);
    next.edges = next.edges.map(e => ({ ...e, target: 'n' + ((Number(e.source.slice(1)) * 11 + 5) % 600) }));
    await p.update(next);
    assert.equal(v.dataset.drawing, 'webgl', 'a new graph tries WebGL again');
    assert.ok(v.querySelector('.as-graphview-gl'), 'on a canvas');
    await p.unmount();
  } finally { delete document.readyState; restore(); }
});

test('the svg takes the keys too: the arrows pan and + zooms', async () => {
  const p = await draw([view], big(8));
  const svg = p.container.querySelector('svg.as-graphview-canvas');
  assert.equal(svg.getAttribute('tabindex'), '0');
  const g = () => svg.querySelector('g[transform^="translate("]').getAttribute('transform');
  await key(svg, 'ArrowRight');
  assert.equal(g(), 'translate(-40 0) scale(1)');
  await key(svg, '+');
  assert.match(g(), /scale\(1\.25\)/);
  await key(svg, '0');
  assert.equal(g(), 'translate(0 0) scale(1)');
  await p.unmount();
});
