// agentspaces-viz/Visualize and GraphView (srad/agentspaces-geo.md §3.4, GEO-D-01 to D-05, GEO-G-01 to G-04): a table
// drawn by a spec under the dataviz rules, a table's "Chart this", and a graph laid out three ways that selects on the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, click, React, ui } from './setup.mjs';

const hues = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'];
const spend = [
  { region: 'north', quarter: 'Q1', amount: 120 }, { region: 'north', quarter: 'Q2', amount: 90 },
  { region: 'south', quarter: 'Q1', amount: 60 }, { region: 'south', quarter: 'Q1', amount: 15 }, { region: 'south', quarter: 'Q2', amount: 40 },
];

test('a spec splits by a column, aggregates per x, sorts, and says which columns the table lacks', () => {
  const spec = ui.specOf({ mark: 'column', x: 'region', y: 'amount', color: 'quarter', aggregate: 'sum', sort: '-y' });
  const { categories, series } = ui.seriesOf(spend, spec, hues);
  assert.deepEqual(series.map(s => s.name), ['Q1', 'Q2']);
  assert.deepEqual(series[0].points.map(p => [p.x, p.y]), [['north', 120], ['south', 75]], 'summed per x');
  assert.deepEqual(categories, ['north', 'south'], 'by the totals, descending');
  assert.deepEqual(ui.seriesOf(spend, { ...spec, sort: 'y' }, hues).categories, ['south', 'north']);
  assert.equal(ui.seriesOf(spend, { ...spec, aggregate: 'mean' }, hues).series[0].points[1].y, 37.5);
  assert.equal(ui.seriesOf(spend, { ...spec, aggregate: 'count' }, hues).series[0].points.find(p => p.x === 'south').y, 2);
  assert.deepEqual(series.map(s => s.color), ['#111111', '#222222'], 'the look\'s hues in fixed order');
  const two = ui.seriesOf([{ m: 'jan', a: 1, b: 2 }, { m: 'feb', a: 3, b: 4 }], ui.specOf({ mark: 'line', x: 'm', y: ['a', 'b'] }), hues);
  assert.deepEqual(two.series.map(s => s.name), ['a', 'b'], 'a y list is a series each');
  assert.deepEqual(ui.missingColumns(spend, ui.specOf({ x: 'region', y: ['amount', 'cost'], color: 'team' })), ['cost', 'team']);
  assert.deepEqual(ui.missingColumns(spend, ui.specOf({ x: 'region', aggregate: 'count' })), []);
  assert.equal(ui.specOf({ mark: 'pie', x: 'a' }).mark, 'column', 'an unknown mark draws as a column');
});

test('a ninth series folds into Other, summed, in the eighth hue', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ x: 'a', team: 't' + i, v: i + 1 }));
  const { series } = ui.seriesOf(rows, ui.specOf({ x: 'x', y: 'v', color: 'team' }), hues);
  assert.equal(series.length, ui.MAX_SERIES);
  assert.deepEqual(series.slice(0, 7).map(s => s.name), ['t0', 't1', 't2', 't3', 't4', 't5', 't6']);
  assert.equal(series[7].name, 'Other');
  assert.equal(series[7].points[0].y, 8 + 9 + 10);
  assert.equal(series[7].color, '#888888');
});

test('a real series named Other stays itself when the rest fold, and the fold takes a name of its own', () => {
  const rows = ['Other', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((team, i) => ({ x: 'a', team, v: i + 1 }));
  const { series } = ui.seriesOf(rows, ui.specOf({ x: 'x', y: 'v', color: 'team' }), hues);
  assert.equal(series.length, ui.MAX_SERIES);
  assert.equal(series[0].name, 'Other');
  assert.equal(series[0].points[0].y, 1, 'its own rows, not the fold\'s');
  assert.equal(series[7].name, 'Other (rest)');
  assert.equal(series[7].points[0].y, 8 + 9 + 10 + 11);
  assert.equal(new Set(series.map(s => s.name)).size, series.length, 'no two series share a name (or a React key)');
});

test('a sorted line runs left to right: each series\' points in the categories\' order', async () => {
  const rows = [{ d: '2026-03', v: 1 }, { d: '2026-01', v: 2 }, { d: '2026-02', v: 3 }];
  const { categories, series } = ui.seriesOf(rows, ui.specOf({ mark: 'line', x: 'd', y: 'v', sort: 'x' }), hues);
  assert.deepEqual(categories, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(series[0].points.map(p => p.x), categories);
  assert.deepEqual(ui.seriesOf(rows, ui.specOf({ mark: 'line', x: 'd', y: 'v', sort: '-y' }), hues).series[0].points.map(p => p.y), [3, 2, 1]);
  const p = await draw([{ id: 'c', component: 'Visualize', rows: '/rows', mark: 'line', x: 'd', y: 'v', sort: 'x' }], { rows });
  const d = p.container.querySelector('[data-mark="line"] svg path[fill="none"]').getAttribute('d');
  const xs = [...d.matchAll(/[ML](-?[\d.]+) /g)].map(m => Number(m[1]));
  assert.equal(xs.length, 3);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2], 'the path never doubles back: ' + d);
  await p.unmount();
});

test('"Chart this" guesses a text column for x and number columns for y', () => {
  assert.deepEqual(ui.guessSpec(['region', 'quarter', 'amount'], spend), { mark: 'column', x: 'region', y: ['amount'], aggregate: 'none' });
  assert.equal(ui.guessSpec(['day', 'n'], [{ day: '2026-11-01', n: 3 }, { day: '2026-11-02', n: 4 }]).mark, 'line', 'a date x draws a line');
  assert.equal(ui.guessSpec(['a', 'b'], [{ a: 'x', b: 'y' }]), undefined, 'no number, no chart');
});

const surf = (components, value, catalogId = 'agentspaces-viz', id = 'v') => [
  { version: '1.0', createSurface: { surfaceId: id, catalogId } },
  { version: '1.0', updateComponents: { surfaceId: id, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
  { version: '1.0', updateDataModel: { surfaceId: id, path: '/', value } },
];
const draw = async (components, value) => { const actions = []; const m = await mount(React.createElement(ui.Surfaces, { envelopes: surf(components, value), onAction: a => actions.push(a) })); return { ...m, actions }; };

test('Visualize draws its marks with a tooltip each, a legend for two series, direct labels, and a table view', async () => {
  const p = await draw([{ id: 'c', component: 'Visualize', rows: '/spend', mark: 'column', x: 'region', y: 'amount', color: 'quarter', aggregate: 'sum', title: 'Spend', unit: 'USD' }], { spend });
  const svg = p.container.querySelector('[data-component="Visualize"] svg');
  assert.equal(svg.querySelectorAll('path[d]').length, 4, 'a column per series and region');
  assert.deepEqual([...svg.querySelectorAll('path title')].map(t => t.textContent).sort(), ['Q1 · north: 120 USD', 'Q1 · south: 75 USD', 'Q2 · north: 90 USD', 'Q2 · south: 40 USD']);
  assert.ok(p.container.querySelector('.bma-legend').textContent.includes('Q1'), 'a legend for two series');
  assert.ok([...svg.querySelectorAll('text.label')].some(t => t.textContent === '120'), 'direct labels for four or fewer');
  await click([...p.container.querySelectorAll('button')].find(b => b.textContent === 'Table'));
  assert.ok(p.container.querySelector('[data-chart-table]').textContent.includes('75'));
  await p.unmount();
  for (const mark of ['bar', 'line', 'area', 'scatter']) {
    const q = await draw([{ id: 'c', component: 'Visualize', rows: '/spend', mark, x: mark === 'scatter' ? 'amount' : 'region', y: 'amount' }], { spend });
    assert.ok(q.container.querySelector(`[data-mark="${mark}"] svg title`), `${mark}: a tooltip on its marks`);
    await q.unmount();
  }
});

test('Visualize says when the table lacks a column, and draws a table below when asked', async () => {
  const p = await draw([{ id: 'c', component: 'Visualize', rows: '/spend', x: 'region', y: 'cost' }], { spend });
  assert.ok(p.text().includes('No column cost in the table.'), p.text());
  assert.equal(p.container.querySelector('svg'), null, 'no empty chart');
  await p.unmount();
  const q = await draw([{ id: 'c', component: 'Visualize', rows: '/spend', x: 'region', y: 'amount', aggregate: 'sum', table: 'below' }], { spend });
  assert.ok(q.container.querySelector('svg') && q.container.querySelector('[data-chart-table]'), 'the chart and its table');
  await q.unmount();
});

test('a DataTable charts its rows in place and goes back to them', async () => {
  const p = await draw([{ id: 't', component: 'DataTable', rows: '/spend', columns: [{ key: 'region' }, { key: 'quarter' }, { key: 'amount' }] }], { spend });
  await click([...p.container.querySelectorAll('button')].find(b => b.textContent === 'Chart this'));
  assert.ok(p.container.querySelector('[data-component="DataTable"][data-charted="yes"] [data-component="Visualize"] svg'));
  await click([...p.container.querySelectorAll('button')].find(b => b.textContent === 'Rows'));
  assert.ok(p.container.querySelector('[data-component="DataTable"] table'));
  await p.unmount();
});

const nodes = [{ id: 'db', label: 'claims-db', kind: 'source' }, { id: 'reg', label: 'registrar', kind: 'agent' }, { id: 'adj', label: 'adjuster', kind: 'agent' }, { id: 'pay', label: 'payments', kind: 'agent' }];
const edges = [{ source: 'db', target: 'reg', rel: 'reads' }, { source: 'reg', target: 'adj', rel: 'hands over' }, { source: 'reg', target: 'pay', rel: 'hands over' }, { source: 'reg', target: 'ghost', rel: 'x' }];

test('the three layouts: a tree puts its root on top, layers run along the edges, and force is deterministic', () => {
  const g = ui.graphOf(nodes, edges);
  assert.equal(g.edges.length, 3, 'an edge to an unknown node is left out');
  const t = ui.graphLayout(g, 'tree');
  assert.ok(t.get('db').y < t.get('reg').y && t.get('reg').y < t.get('adj').y);
  assert.equal(t.get('adj').y, t.get('pay').y, 'siblings on one level');
  const l = ui.graphLayout(g, 'layered');
  assert.ok(l.get('db').x < l.get('reg').x && l.get('reg').x < l.get('adj').x);
  const f1 = ui.graphLayout(g, 'force'), f2 = ui.graphLayout(g, 'force');
  assert.deepEqual([...f1], [...f2], 'the same graph lays out the same way');
  for (const p of f1.values()) assert.ok(p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 520);
  const cyc = ui.graphOf([{ id: 'a' }, { id: 'b' }], [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]);
  assert.equal(ui.graphLayout(cyc, 'layered').size, 2, 'a cycle lays out');
  assert.equal(ui.graphLayout(cyc, 'tree').size, 2);
  const fg = ui.graphOfFeatures([{ type: 'Feature', id: 's1', kind: 'track.ship', label: 'MV Northgate', geometry: { type: 'Point', coordinates: [0, 0] }, links: [{ rel: 'bound-for', id: 'b4' }] },
    { type: 'Feature', id: 'b4', kind: 'area.berth', label: 'Berth 4', geometry: { type: 'Point', coordinates: [0, 0] } }]);
  assert.deepEqual(fg.edges, [{ source: 's1', target: 'b4', rel: 'bound-for' }]);
});

test('2,000 nodes and 5,000 edges lay out by force in under two seconds (GEO-G-03)', () => {
  const ns = Array.from({ length: 2000 }, (_, i) => ({ id: 'n' + i, kind: 'k' + (i % 5) }));
  const es = Array.from({ length: 5000 }, (_, i) => ({ source: 'n' + (i % 2000), target: 'n' + ((i * 7 + 13) % 2000) }));
  const g = ui.graphOf(ns, es);
  const t0 = performance.now();
  const p = ui.graphLayout(g, 'force');
  const ms = performance.now() - t0;
  assert.equal(p.size, 2000);
  assert.ok(ms < 2000, `laid out in ${ms.toFixed(0)} ms`);
});

test('GraphView draws the nodes by kind, selects one on a click, and lists the edges in a table', async () => {
  const p = await draw([{ id: 'g', component: 'GraphView', nodes: '/nodes', edges: '/edges', layout: 'layered', selectAction: 'inspect', title: 'Who feeds whom' }], { nodes, edges });
  const view = p.container.querySelector('[data-component="GraphView"]');
  assert.equal(view.querySelectorAll('[data-node]').length, 4);
  assert.ok(view.querySelector('.bma-legend').textContent.includes('source') && view.querySelector('.bma-legend').textContent.includes('agent'));
  const reg = view.querySelector('[data-node="reg"]');
  await React.act(async () => {
    reg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 }));
    view.querySelector('svg').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 }));
  });
  assert.equal(view.dataset.selected, 'reg');
  assert.deepEqual(p.actions.at(-1).context, { id: 'reg', kind: 'agent' });
  assert.ok(reg.classList.contains('node') && reg.classList.contains('selected') && reg.querySelector('circle.halo'), 'the selected node keeps class node and has a halo');
  assert.equal(view.querySelectorAll('circle.halo').length, 1, 'one halo, on the selected node only');
  assert.equal(view.querySelectorAll('.edges path.edge.on').length, 3, 'the selected node\'s edges stand out');
  await click([...view.querySelectorAll('button')].find(b => b.textContent === 'Table'));
  assert.ok(view.querySelector('[data-graph-table]').textContent.includes('hands over'));
  await p.unmount();
});

test('GraphView draws on a stage: curved edges, ringed discs, label chips, and the legend and count over it', async () => {
  const p = await draw([{ id: 'g', component: 'GraphView', nodes: '/nodes', edges: '/edges', layout: 'force', title: 'Who feeds whom' }], { nodes, edges });
  const view = p.container.querySelector('[data-component="GraphView"]');
  const stage = view.querySelector('.as-graphview-stage');
  assert.ok(stage && stage.querySelector(':scope > svg.as-graphview-canvas'), 'the svg sits in the stage');
  const paths = [...stage.querySelectorAll('.edges path')];
  assert.equal(paths.length, 3, 'an edge each');
  assert.ok(paths.every(e => / Q/.test(e.getAttribute('d')) && e.getAttribute('fill') === 'none'), 'quadratic curves, unfilled');
  assert.equal(stage.querySelector('.edges line'), null, 'no straight lines left');
  const db = stage.querySelector('.node[data-node="db"]');
  assert.equal(db.querySelector('circle.disc').getAttribute('fill'), 'var(--bma-color-panel)', 'a disc in the panel colour');
  const hue = db.querySelector('circle.core').getAttribute('fill');
  assert.ok(hue && hue !== stage.querySelector('.node[data-node="reg"] circle.core').getAttribute('fill'), 'a hue per kind');
  assert.equal(db.querySelector('circle.disc').getAttribute('stroke'), hue, 'ringed in its kind\'s hue');
  assert.ok(db.querySelector('.label rect') && db.querySelector('.label text').textContent === 'claims-db', 'the label is a chip');
  assert.equal(stage.querySelectorAll('.node').length, 4);
  assert.equal(stage.querySelector('.as-graphview-count').textContent, '4 nodes · 3 edges');
  assert.ok(stage.querySelector('.bma-legend.as-graphview-legend').textContent.includes('source'), 'the legend lies over the stage');
  await click([...view.querySelectorAll('button')].find(b => b.textContent === 'Table'));
  assert.equal(view.querySelector('.as-graphview-stage'), null, 'the table replaces the stage');
  await p.unmount();
  const one = await draw([{ id: 'g', component: 'GraphView', nodes: '/nodes', edges: '/edges' }], { nodes: [nodes[0]], edges: [] });
  assert.equal(one.container.querySelector('.as-graphview-count').textContent, '1 node · 0 edges');
  assert.equal(one.container.querySelector('.bma-legend'), null, 'no legend for one kind');
  await one.unmount();
});

test('GraphView and Graph with no nodes show the empty state with the sentence they always showed', async () => {
  const p = await draw([{ id: 'g', component: 'GraphView', nodes: '/nodes', edges: '/edges' }], { nodes: [], edges: [] });
  const empty = p.container.querySelector('[data-component="GraphView"] .as-empty');
  assert.ok(empty && empty.querySelector('.glyph[aria-hidden="true"]') && empty.querySelector('b'));
  assert.equal(empty.querySelector('p').textContent, 'No nodes yet.');
  await p.unmount();
  const q = await draw([{ id: 'g', component: 'Graph', nodes: '/nodes', edges: '/edges' }], { nodes: [], edges: [] });
  const e2 = q.container.querySelector('.as-empty[data-component="Graph"]');
  assert.ok(e2 && e2.querySelector('.glyph[aria-hidden="true"]') && e2.querySelector('b'));
  assert.equal(e2.querySelector('p').textContent, 'No node yet.');
  await q.unmount();
});

test('Graph keeps its natural width and shows an edge\'s label only while one of its nodes is hovered or lit', async () => {
  const gn = [{ id: 'q', title: 'Question', column: 'ask' }, { id: 'd', title: 'Doc 1', column: 'docs' }, { id: 'e', title: 'Doc 2', column: 'docs' }, { id: 'a', title: 'Answer', column: 'out' }];
  const ge = [{ from: 'q', to: 'd', label: 'cites' }, { from: 'q', to: 'e', label: 'cites' }, { from: 'd', to: 'a', label: 'supports' }];
  const p = await draw([{ id: 'g', component: 'Graph', nodes: '/n', edges: '/e', nodeAction: 'open', columns: [{ key: 'ask' }, { key: 'docs' }, { key: 'out' }] }], { n: gn, e: ge });
  const g = p.container.querySelector('[data-component="Graph"]');
  const svg = g.querySelector('svg');
  assert.equal(svg.style.maxWidth, svg.getAttribute('viewBox').split(' ')[2] + 'px', 'never wider than the layout');
  assert.equal(g.querySelectorAll('.node').length, 4);
  const labels = () => [...g.querySelectorAll('.edge')].map(e => [e.classList.contains('on'), e.querySelector('text').getAttribute('opacity'), e.querySelector('text').textContent]);
  assert.ok(labels().every(([on, o]) => !on && o === '0'), 'no label shows at rest');
  assert.deepEqual(labels().map(l => l[2]), ['cites', 'cites', 'supports'], 'the labels stay in the page');
  const doc = g.querySelector('.node[aria-label="Doc 1"]');
  await React.act(async () => { doc.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  assert.deepEqual(labels().map(l => l[0]), [true, false, true], 'the hovered node\'s two edges');
  await React.act(async () => { doc.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  assert.ok(labels().every(([on]) => !on));
  const ask = g.querySelector('.node[aria-label="Question"]');
  await React.act(async () => { ask.dispatchEvent(new MouseEvent('click', { bubbles: true })); });   // an svg g has no click()
  assert.deepEqual(labels().map(l => [l[0], l[1]]), [[true, '1'], [true, '1'], [false, '0']], 'the lit node\'s edges');
  assert.equal(p.actions.at(-1).context.id, 'q');
  await p.unmount();
});

test('in a GeoLayout a node whose id is a feature\'s selects it on the map', async () => {
  localStorage.clear();
  const ship = { type: 'Feature', id: 's1', kind: 'track.ship', label: 'MV Northgate', geometry: { type: 'Point', coordinates: [-3, 53.4] }, properties: {}, style: {}, at: '2026-11-12T09:00:00Z', links: [{ rel: 'bound-for', id: 'b4' }] };
  const berth = { type: 'Feature', id: 'b4', kind: 'area.berth', label: 'Berth 4', geometry: { type: 'Point', coordinates: [-3.01, 53.41] }, properties: {}, style: {}, at: '2026-11-12T09:00:00Z' };
  const surfaces = {
    watch: surf([{ id: 'harbour', component: 'GeoMap', layers: [{ path: '/f' }] }], { f: [ship, berth] }, 'agentspaces-geo', 'watch'),
    links: surf([{ id: 'g', component: 'GraphView', features: '/f', layout: 'force' }], { f: [ship, berth] }, 'agentspaces-geo', 'links'),
  };
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'links'], render: id => React.createElement(ui.Surfaces, { envelopes: surfaces[id] }),
    layout: { kind: 'geo', map: 'watch', windows: [{ page: 'links', label: 'Links', open: true }] }, persist: 'graph-1' }));
  const node = container.querySelector('[data-window="links"] [data-node="b4"]');
  await React.act(async () => {
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 2 }));
    container.querySelector('[data-window="links"] svg').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5, pointerId: 2 }));
  });
  assert.equal(container.querySelector('.as-geo-map [data-component="GeoMap"]').dataset.selected, 'b4');
  await unmount();
});

/** The boxes of an axis's labels as drawn (x and anchor), at the font size the chart's CSS gives them. */
const boxes = ticks => ticks.map(t => { const w = ui.textWidth(t.label, 11); const left = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2; return { left, right: left + w }; });
const apart = (bs, gap = 8) => bs.every((b, i) => i === 0 || b.left >= bs[i - 1].right + gap);

test('the x axis thins its labels to fit without overlapping, and a time axis over several days labels by day', () => {
  // a week at fifteen minutes: 672 categories, as a pattern chart of a week's captures gives them
  const start = Date.UTC(2026, 10, 7, 7, 0);
  const week = Array.from({ length: 672 }, (_, i) => new Date(start + i * 900_000).toISOString().slice(0, 16).replace('T', ' '));
  for (const width of [240, 640, 1600]) {
    const step = (width - 64) / week.length;
    const { ticks, time } = ui.axisTicks(week, i => 48 + step * (i + 0.5), [2, width - 2]);
    assert.equal(time, 'day', `${width}: a week reads by day`);
    assert.ok(ticks.length >= 1 && apart(boxes(ticks)), `${width}: no two labels overlap: ${JSON.stringify(ticks)}`);
    assert.ok(ticks.every(t => /^Nov \d+$/.test(t.label)), `${width}: day-level words: ${ticks.map(t => t.label)}`);
    assert.ok(boxes(ticks).every(b => b.left >= 2 && b.right <= width - 2), `${width}: every label inside the chart`);
    if (width >= 640) assert.equal(ticks[0].label, 'Nov 7');
  }
  // at 640 every day of the week has room
  assert.deepEqual(ui.axisTicks(week, i => 48 + (576 / 672) * (i + 0.5), [2, 638]).ticks.map(t => t.label), ['Nov 7', 'Nov 8', 'Nov 9', 'Nov 10', 'Nov 11', 'Nov 12', 'Nov 13', 'Nov 14']);
  // within one day, hh:mm, thinned to fit
  const day = Array.from({ length: 96 }, (_, i) => new Date(start + i * 900_000 - 7 * 3600_000).toISOString());
  const hours = ui.axisTicks(day, i => 48 + 6 * (i + 0.5), [2, 638]);
  assert.equal(hours.time, 'time');
  assert.ok(hours.ticks.every(t => /^\d\d:\d\d$/.test(t.label)) && apart(boxes(hours.ticks)) && hours.ticks.length < 96 && hours.ticks.length >= 4, JSON.stringify(hours.ticks));
  // dates over two years carry the year; plain words are cut, and a short list keeps every label
  assert.deepEqual(ui.axisTicks(['2025-12-31', '2026-01-01'], i => 100 + 300 * i, [2, 638]).ticks.map(t => t.label), ['Dec 31 2025', 'Jan 1 2026']);
  assert.deepEqual(ui.axisTicks(['north', 'south'], i => 100 + 300 * i, [2, 638]).ticks.map(t => t.label), ['north', 'south']);
  const long = ui.axisTicks(['a category with a very long name indeed'], () => 320, [2, 638]).ticks[0].label;
  assert.equal(long.length, ui.AXIS_LABEL_MAX);
  assert.ok(long.endsWith('…'));
  assert.deepEqual(ui.axisTicks([], () => 0, [0, 1]).ticks, []);
});

test('a line of one series over a week draws day labels that never overlap, and no field name as a label', async () => {
  const start = Date.UTC(2026, 10, 7, 7, 0);
  const rows = Array.from({ length: 672 }, (_, i) => ({ t: new Date(start + i * 900_000).toISOString().slice(0, 16).replace('T', ' '), y: (i * 7) % 23 }));
  const p = await draw([{ id: 'c', component: 'Visualize', rows: '/rows', mark: 'line', x: 't', y: 'y', title: 'Devices per 15 minutes', unit: 'devices' }], { rows });
  const svg = p.container.querySelector('[data-mark="line"] svg');
  const ticks = [...svg.querySelectorAll('.x-ticks text')].map(t => ({ label: t.textContent, x: Number(t.getAttribute('x')), anchor: t.getAttribute('text-anchor') }));
  assert.equal(svg.querySelector('.x-ticks').dataset.time, 'day');
  assert.ok(ticks.length >= 2 && ticks.every(t => /^Nov \d+$/.test(t.label)), JSON.stringify(ticks));
  assert.ok(apart(boxes(ticks)), 'no two x labels overlap: ' + JSON.stringify(ticks));
  assert.equal(svg.querySelectorAll('text.label').length, 0, 'a lone series has no direct label: its name is the column y');
  assert.ok(![...svg.querySelectorAll('text')].some(t => t.textContent === 'y'), 'no field name printed on the chart');
  await p.unmount();
  // two series keep their direct labels: they tell the lines apart
  const q = await draw([{ id: 'c', component: 'Visualize', rows: '/rows', mark: 'line', x: 'm', y: ['a', 'b'] }], { rows: [{ m: 'jan', a: 1, b: 2 }, { m: 'feb', a: 3, b: 4 }] });
  assert.deepEqual([...q.container.querySelectorAll('svg text.label')].map(t => t.textContent), ['a', 'b']);
  await q.unmount();
});
