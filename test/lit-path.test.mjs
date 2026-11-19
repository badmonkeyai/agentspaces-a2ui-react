// A path the data lights (AF-9 to AF-13): node and edge rows marked lit: true. Graph lights exactly the lit
// edges, the hovered one, and those touching the hovered or focused node once any edge is lit, and as before when none
// is; GraphView draws lit nodes in the selected style and lit edges with the accent, beside a person's selection; a lit
// node's name and a lit edge's text add ", on the path"; graphOf reads lit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, click, React, ui } from './setup.mjs';

const surf = (components, value, catalogId = 'agentspaces-viz', surfaceId = 'path') => [
  { version: '1.0', createSurface: { surfaceId, catalogId } },
  { version: '1.0', updateComponents: { surfaceId, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
  { version: '1.0', updateDataModel: { surfaceId, path: '/', value } },
];
const draw = async (components, value) => { const actions = []; const m = await mount(React.createElement(ui.Surfaces, { envelopes: surf(components, value), onAction: a => actions.push(a) })); return { ...m, actions }; };
const enter = async el => { await React.act(async () => { el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1 })); }); };
const leave = async el => { await React.act(async () => { el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerId: 1 })); }); };

// a claim held for a missing receipt that a policy requires; the travel budget is off the path
const gn = [{ id: 'claim', title: 'Claim C-1001', column: 'asked', lit: true }, { id: 'receipt', title: 'Missing receipt', column: 'found', lit: true },
  { id: 'travel', title: 'Travel budget', column: 'found' }, { id: 'policy', title: 'Receipts policy', column: 'source', lit: true }];
const ge = [{ from: 'claim', to: 'receipt', label: 'held for', lit: true }, { from: 'claim', to: 'travel', label: 'charged to' },
  { from: 'receipt', to: 'policy', label: 'required by', lit: true }, { from: 'travel', to: 'policy', label: 'governed by' }];

test('Graph lights exactly the lit edges, not the edges that leave the path, and a hover or a focus adds its own', async () => {
  const p = await draw([{ id: 'g', component: 'Graph', nodes: '/n', edges: '/e', columns: [{ key: 'asked' }, { key: 'found' }, { key: 'source' }] }], { n: gn, e: ge });
  const g = p.container.querySelector('[data-component="Graph"]');
  const on = () => [...g.querySelectorAll('.edge')].map(e => e.classList.contains('on'));
  assert.deepEqual(on(), [true, false, true, false], 'the two lit edges; "charged to" leaves a lit node and stays dark');
  assert.deepEqual([...g.querySelectorAll('.edge')].map(e => e.classList.contains('lit')), [true, false, true, false]);
  assert.deepEqual([...g.querySelectorAll('.edge')].map(e => e.querySelector('text').getAttribute('opacity')), ['1', '0', '1', '0'], 'a lit edge shows its label');
  assert.deepEqual([...g.querySelectorAll('.node.lit')].map(n => n.getAttribute('aria-label')),
    ['Claim C-1001, on the path', 'Missing receipt, on the path', 'Receipts policy, on the path'], 'a lit node\'s name says so');
  assert.equal(g.querySelector('.node:not(.lit)').getAttribute('aria-label'), 'Travel budget', 'an unlit one is as before');
  assert.deepEqual([...g.querySelectorAll('.edge')].map(e => e.textContent), ['held for, on the path', 'charged to', 'required by, on the path', 'governed by'],
    'the text kept for a screen reader says which edges are on the path');
  // focus a node off the path: its edges light beside the path
  const travel = g.querySelector('.node[aria-label="Travel budget"]');
  await React.act(async () => { travel.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  assert.deepEqual(on(), [true, true, true, true], 'the focused node\'s two edges join the path');
  await React.act(async () => { travel.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  assert.deepEqual(on(), [true, false, true, false]);
  // hover a node on the path: its edges light, and only those
  const claim = g.querySelector('.node[aria-label="Claim C-1001, on the path"]');
  await enter(claim);
  assert.deepEqual(on(), [true, true, true, false], 'the hovered node\'s edges');
  await leave(claim);
  assert.deepEqual(on(), [true, false, true, false]);
  // hover an edge
  const governed = g.querySelectorAll('.edge')[3];
  await enter(governed);
  assert.deepEqual(on(), [true, false, true, true], 'the hovered edge');
  await leave(governed);
  assert.deepEqual(on(), [true, false, true, false]);
  await p.unmount();
});

test('Graph with lit nodes and no lit edge lights as before: every edge of a lit node', async () => {
  const p = await draw([{ id: 'g', component: 'Graph', nodes: '/n', edges: '/e' }], { n: gn, e: ge.map(({ lit, ...e }) => e) });
  const g = p.container.querySelector('[data-component="Graph"]');
  assert.deepEqual([...g.querySelectorAll('.edge')].map(e => e.classList.contains('on')), [true, true, true, true], 'each edge touches a lit node');
  assert.equal(g.querySelectorAll('.edge.lit').length, 0);
  assert.equal(g.querySelectorAll('.as-path-note').length, 0, 'no path, no note');
  await p.unmount();
});

test('Graph keeps a focused node\'s edges lit while the pointer passes over it and leaves, with a path and without', async () => {
  const focusIn = async el => { await React.act(async () => { el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }); };
  const focusOut = async el => { await React.act(async () => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }); };
  // with a path: a click or a tab focuses "Travel budget"; the pointer passing over it and away must not turn its edges off
  let p = await draw([{ id: 'g', component: 'Graph', nodes: '/n', edges: '/e', columns: [{ key: 'asked' }, { key: 'found' }, { key: 'source' }] }], { n: gn, e: ge });
  let g = p.container.querySelector('[data-component="Graph"]');
  let on = () => [...g.querySelectorAll('.edge')].map(e => e.classList.contains('on'));
  let travel = g.querySelector('.node[aria-label="Travel budget"]');
  await focusIn(travel);
  await enter(travel);
  await leave(travel);
  assert.deepEqual(on(), [true, true, true, true], 'the focused node keeps its edges after the pointer leaves it');
  const claim = g.querySelector('.node[aria-label="Claim C-1001, on the path"]');
  await enter(claim);
  assert.deepEqual(on(), [true, true, true, true], 'a hover elsewhere adds its own beside the focus');
  await leave(claim);
  assert.deepEqual(on(), [true, true, true, true], 'and its leaving keeps the focus\'s');
  await focusOut(travel);
  assert.deepEqual(on(), [true, false, true, false], 'the blur ends it');
  await p.unmount();
  // without a path or a lit node: as before, the edges of the hovered or the focused node
  p = await draw([{ id: 'g', component: 'Graph', nodes: '/n', edges: '/e' }], { n: gn.map(({ lit, ...n }) => n), e: ge.map(({ lit, ...e }) => e) });
  g = p.container.querySelector('[data-component="Graph"]');
  on = () => [...g.querySelectorAll('.edge')].map(e => e.classList.contains('on'));
  travel = g.querySelector('.node[aria-label="Travel budget"]');
  assert.deepEqual(on(), [false, false, false, false]);
  await focusIn(travel);
  await enter(travel);
  await leave(travel);
  assert.deepEqual(on(), [false, true, false, true], 'the focused node keeps its edges after the pointer leaves it');
  await focusOut(travel);
  assert.deepEqual(on(), [false, false, false, false]);
  await p.unmount();
});

const vn = [{ id: 'claim', label: 'Claim C-1001', kind: 'claim', lit: true }, { id: 'receipt', label: 'Missing receipt', kind: 'finding', lit: true },
  { id: 'travel', label: 'Travel budget', kind: 'finding' }, { id: 'policy', label: 'Receipts policy', kind: 'source', lit: true }];
const ve = [{ source: 'claim', target: 'receipt', rel: 'held for', lit: true }, { source: 'claim', target: 'travel', rel: 'charged to' },
  { source: 'receipt', target: 'policy', rel: 'required by', lit: true }, { source: 'travel', target: 'policy', rel: 'governed by' }];

test('graphOf reads lit on nodes and edges, as the boolean only', () => {
  const g = ui.graphOf([...vn, { id: 'x', label: 'X', lit: 'true' }], [...ve, { source: 'x', target: 'claim', rel: 'r', lit: 1 }]);
  assert.deepEqual(g.nodes.filter(n => n.lit).map(n => n.id), ['claim', 'receipt', 'policy'], 'a word or a number is not lit');
  assert.deepEqual(g.edges.filter(e => e.lit).map(e => e.rel), ['held for', 'required by']);
  assert.equal('lit' in g.nodes.find(n => n.id === 'travel'), false, 'an unlit row keeps the shape it had');
  assert.deepEqual(ui.graphOf([{ id: 'a' }], []).nodes, [{ id: 'a', label: 'a', kind: '' }]);
});

test('GraphView draws lit nodes in the selected style and lit edges with the accent, and a selection adds its own', async () => {
  const p = await draw([{ id: 'v', component: 'GraphView', nodes: '/n', edges: '/e', layout: 'layered', selectAction: 'inspect', title: 'Why the claim is held' }], { n: vn, e: ve });
  const view = p.container.querySelector('[data-component="GraphView"]');
  assert.equal(view.dataset.drawing, 'svg');
  const node = id => view.querySelector(`[data-node="${id}"]`);
  for (const id of ['claim', 'receipt', 'policy']) {
    assert.ok(node(id).classList.contains('selected') && node(id).classList.contains('lit'), id + ' draws as selected');
    assert.ok(node(id).querySelector('circle.halo'), id + ' has the halo');
    assert.ok(node(id).querySelector('.label.on'), id + '\'s label chip is on');
    assert.ok(node(id).getAttribute('aria-label').endsWith(', on the path'), id + '\'s name says so');
  }
  assert.ok(!node('travel').classList.contains('selected') && !node('travel').querySelector('circle.halo'));
  assert.equal(node('travel').getAttribute('aria-label'), 'Travel budget, finding');
  const edges = () => [...view.querySelectorAll('.edges path')];
  assert.deepEqual(edges().map(e => e.classList.contains('on')), [true, false, true, false], 'the lit edges, and no other');
  assert.deepEqual(edges().map(e => e.getAttribute('stroke')).filter(s => s === 'var(--bma-color-accent)').length, 2, 'with the accent stroke');
  assert.deepEqual(edges().map(e => e.querySelector('title').textContent), ['held for, on the path', 'charged to', 'required by, on the path', 'governed by']);
  assert.equal(view.dataset.selected, '', 'the person has selected nothing');
  // the person selects a node off the path: its edges add the accent beside the path's
  const travel = node('travel');
  await React.act(async () => {
    travel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 }));
    view.querySelector('svg').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 }));
  });
  assert.equal(view.dataset.selected, 'travel');
  assert.deepEqual(p.actions.at(-1).context, { id: 'travel', kind: 'finding' });
  assert.deepEqual(edges().map(e => e.classList.contains('on')), [true, true, true, true], 'the selection\'s edges join the lit ones');
  assert.equal(view.querySelectorAll('circle.halo').length, 4, 'three lit and one selected');
  // the table view tells the lit edges apart, for a reader and a screen reader
  await click([...view.querySelectorAll('button')].find(b => b.textContent === 'Table'));
  const rows = [...view.querySelectorAll('[data-graph-table] tbody tr')];
  assert.deepEqual(rows.map(r => r.dataset.lit ?? ''), ['yes', '', 'yes', '']);
  assert.equal(rows[0].children[1].textContent, 'held for, on the path');
  assert.equal(rows[0].querySelector('.as-visually-hidden').textContent, ', on the path', 'the words are for a screen reader');
  await p.unmount();
});

test('GraphView lights the lit rows on the WebGL drawing by the rule the SVG drawing uses', () => {
  // past 500 nodes the view draws with WebGL, which happy-dom lacks; both drawings take on from nodeOn and edgeOn (AF-11)
  const g = ui.graphOf(vn, ve);
  assert.deepEqual(g.nodes.map(n => ui.nodeOn(n, undefined)), [true, true, false, true], 'the lit nodes, with no selection');
  assert.deepEqual(g.nodes.map(n => ui.nodeOn(n, 'travel')), [true, true, true, true], 'and the selection beside them');
  assert.deepEqual(g.edges.map(e => ui.edgeOn(e, undefined)), [true, false, true, false]);
  assert.deepEqual(g.edges.map(e => ui.edgeOn(e, 'travel')), [true, true, true, true]);
  const plain = ui.graphOf(vn.map(({ lit, ...n }) => n), ve.map(({ lit, ...e }) => e));
  assert.deepEqual(plain.edges.map(e => ui.edgeOn(e, 'claim')), [true, true, false, false], 'with no path, the selection alone, as before');
  assert.equal(ui.graphDrawing(520, true), 'webgl');
});
