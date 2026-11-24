// The pick set (srad/agentspaces-geo.md GEO-M-09, M-10, D-06, W-08;
// Q-PRF-04, UX-01, UX-04): a GeoMap layer with pick draws the picked features alone (show picked) or every feature with
// the picked ones in their hue (show all); a key's shape of one family is drawn once across pick layers; one chip per key,
// one fit per change; the layers without pick are dimmed meanwhile; the legend's Picked group removes a key or clears
// them, moving the focus as the SRAD says, and one polite live region says each change; a search for a feature a
// show-picked layer hides adds its key; in a GeoLayout a select table in one window and a watchbox's pick in another
// write the one set the map reads, the watchbox's keys kept to the table's rows. Plain string keys, any property by.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, key, click, React, ui } from './setup.mjs';

const AT = '2026-11-19T17:15:00Z';
const pt = (id, kind, key, lon, lat) => ({ type: 'Feature', id, kind, label: id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { who: key }, style: {}, at: AT });
const line = (id, kind, key, lon) => ({ type: 'Feature', id, kind, label: key, geometry: { type: 'LineString', coordinates: [[lon, 53.40], [lon + 0.02, 53.42]] }, properties: { who: key }, style: {}, at: AT });
const HUES = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'];
// two layers of lines and two of points keyed by "who", the follower layers show all, the others show picked; an alert
// layer without pick
const SPECS = [
  { path: '/routes', label: 'Routes', pick: { by: 'who', show: 'picked', fit: true } },
  { path: '/stops', label: 'Stops', pick: { by: 'who', show: 'picked' } },
  { path: '/followers', kind: 'track.follower.route', label: 'Followers\' routes', pick: { by: 'who', show: 'all', fit: true } },
  { path: '/followers', kind: 'track.follower', label: 'Followers\' stops', pick: { by: 'who', show: 'all' } },
  { path: '/alerts', label: 'Alerts' },
];
const DATA = {
  routes: [line('r12', 'track.route', 'Walker 12', -3.1), line('r13', 'track.route', 'Walker 13', -3.2), line('rK', 'track.route', 'Walker K', -3.3)],
  stops: [pt('s12a', 'track.stop', 'Walker 12', -3.1, 53.4), pt('s12b', 'track.stop', 'Walker 12', -3.09, 53.41), pt('s13a', 'track.stop', 'Walker 13', -3.2, 53.4)],
  followers: [line('fK', 'track.follower.route', 'Walker K', -3.3), line('fB', 'track.follower.route', 'Walker B', -3.4),
    pt('fKa', 'track.follower', 'Walker K', -3.3, 53.4), pt('fKb', 'track.follower', 'Walker K', -3.29, 53.42), pt('fBa', 'track.follower', 'Walker B', -3.4, 53.4)],
  alerts: [pt('a1', 'alert.near', 'Walker K', -3.3, 53.4)],
};
const layersOf = (data = DATA) => ui.featureLayers(SPECS, p => data[p.slice(1)], HUES);
const ids = l => l.features.map(f => f.id);

test('a pick layer shows the picked features alone or every one recoloured; a key is drawn once per shape, with one chip and one fit set', () => {
  const v = ui.applyPicks(layersOf(), ['Walker K', 'Walker 12'], HUES);
  assert.deepEqual(ids(v.layers[0]), ['r12'], 'show picked: the picked routes, and not Walker K\'s, which a show-all layer draws');
  assert.deepEqual(ids(v.layers[1]), ['s12a', 's12b'], 'show picked: the picked stops, a key\'s points beside its route');
  assert.deepEqual(ids(v.layers[2]), ['fK', 'fB'], 'show all: every follower route');
  assert.deepEqual(ids(v.layers[3]), ['fKa', 'fKb', 'fBa']);
  assert.deepEqual([...v.hue].sort(), [['fK', '#111111'], ['fKa', '#111111'], ['fKb', '#111111'], ['r12', '#222222'], ['s12a', '#222222'], ['s12b', '#222222']], 'the hue of each key\'s place in the set');
  assert.deepEqual(v.chips.map(c => [c.key, c.feature.id, c.hue]), [['Walker K', 'fK', '#111111'], ['Walker 12', 'r12', '#222222']], 'one chip per key, on its route');
  assert.deepEqual(v.fit.map(f => f.id).sort(), ['fK', 'r12'], 'the fit takes the picked features of the fitting layers');
  assert.deepEqual([...v.dimmed], [4], 'the layer without pick is dimmed');
  assert.deepEqual([...v.hidden.keys()].sort(), ['r13', 's13a'], 'what a show-picked layer leaves out, for the search');
  const none = ui.applyPicks(layersOf(), [], HUES);
  assert.deepEqual([ids(none.layers[0]), ids(none.layers[1]), ids(none.layers[2]).length], [[], [], 2], 'nothing picked: show-picked layers draw nothing');
  assert.equal(none.dimmed.size, 0);
  assert.equal(none.hue.size, 0);
  // a picked follower with no device route of its own: drawn once, one chip, in the fit once
  const k = ui.applyPicks(layersOf({ ...DATA, routes: DATA.routes.filter(r => r.id !== 'rK') }), ['Walker K'], HUES);
  assert.equal(k.chips.length, 1);
  assert.deepEqual(k.fit.map(f => f.id), ['fK']);
});

test('the pick set\'s pieces: a layer\'s pick, a clean set of at most eight, the keys a property lists, and the hue', () => {
  assert.deepEqual(ui.pickSpecOf({ by: 'who', show: 'all' }), { by: 'who', show: 'all', fit: false });
  assert.equal(ui.pickSpecOf({ by: 'who', show: 'some' }), undefined);
  assert.equal(ui.pickSpecOf({ show: 'all' }), undefined);
  assert.deepEqual(ui.cleanPicks(['a', 'b', 'a', 3, '', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.equal(ui.MAX_PICKED, 8);
  assert.deepEqual(ui.keysOf(['x', 'y', 'x', 7, null]), ['x', 'y', '7']);
  assert.deepEqual(ui.keysOf('one'), ['one']);
  assert.deepEqual(ui.keysOf({}), []);
  assert.equal(ui.pickHue(2, HUES), '#333333');
  assert.equal(ui.pickedWords(['A', 'B']), 'Showing 2 on the map: A, B.');
  assert.deepEqual(ui.geoState('watch').picked, '/_geo/watch/picked');
});

test('10,000 points filtered by a pick set: a measurement against a 10 ms goal (the CPU path)', t => {
  const pts = Array.from({ length: 10_000 }, (_, i) => pt('p' + i, 'track.stop', 'Walker ' + (i % 400), -6 + (i % 100) * 0.06, 50 + Math.floor(i / 100) * 0.06));
  const others = Array.from({ length: 2000 }, (_, i) => pt('q' + i, 'track.stop', 'Other ' + (i % 50), -6 + (i % 100) * 0.06, 50));
  const layers = ui.featureLayers([{ path: '/p', pick: { by: 'who', show: 'picked', fit: true } }, { path: '/q', pick: { by: 'who', show: 'all' } }], p => (p === '/p' ? pts : p === '/q' ? others : undefined), HUES);
  const picked = ['Walker 1', 'Walker 7', 'Walker 99', 'Walker 200', 'Walker 333', 'Walker 5', 'Walker 6', 'Walker 8'];
  const runs = [];
  for (let i = 0; i < 25; i++) { const t0 = performance.now(); ui.applyPicks(layers, picked, HUES); runs.push(performance.now() - t0); }
  const v = ui.applyPicks(layers, picked, HUES);
  assert.equal(v.layers[0].features.length, 200, '25 points for each of the eight keys');
  runs.sort((a, b) => a - b);
  const median = runs[12], p90 = runs[22];
  // goal 10 ms; out of bounds at 40 ms (a loaded test machine); the median is the measurement kept in the build record
  t.diagnostic(`applyPicks over 12,000 features: median ${median.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms (goal 10 ms, limit 40 ms)`);
  assert.ok(median < 40, `the median ${median.toFixed(2)} ms is inside the 40 ms limit`);
});

/** A geo page whose envelopes grow: push(path, value) feeds one path. */
async function page(components, data, surfaceId = 'watch') {
  const actions = [];
  let set;
  const base = [
    { version: '1.0', createSurface: { surfaceId, catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId, path: '/', value: data } },
  ];
  function Host() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }); }
  const m = await mount(React.createElement(Host));
  const push = async (path, value) => { await React.act(async () => { set(e => [...e, { version: '1.0', updateDataModel: { surfaceId, path, value } }]); }); };
  return { ...m, actions, push };
}
const people = [{ who: 'Walker 12', places: 3 }, { who: 'Walker 13', places: 2 }, { who: 'Walker K', places: 4 }, { who: 'Walker B', places: 5 }];
const MAP = { id: 'watch', component: 'GeoMap', layers: SPECS };
const TABLE = { id: 'list', component: 'DataTable', columns: [{ key: 'who', title: 'Who' }, { key: 'places', title: 'Places', format: 'number' }], rows: '/people', select: { key: 'who', map: 'watch' } };
const tableRows = c => [...c.querySelectorAll('.as-geomap .layer-table')].map(t => [t.querySelector('.layer-title').textContent.replace(/\s+\d.*$/, ''), [...t.querySelectorAll('tbody tr')].map(r => r.querySelector('td').textContent)]);
const said = c => c.querySelector('.as-picked-said')?.textContent.replace(/​/g, '') ?? '';
const geo = c => c.querySelector('.as-geomap');

test('on one surface: the table picks, the map draws the picked alone, the legend\'s Picked group removes and clears, moving the focus', async () => {
  const p = await page([TABLE, MAP], { ...DATA, people });
  const box = who => p.container.querySelector(`input[aria-label="Show ${who} on the map"]`);
  assert.deepEqual(tableRows(p.container)[0], ['Routes', []], 'nothing picked: a show-picked layer lists nothing');
  assert.equal(geo(p.container).dataset.picked, '0');
  assert.equal(p.container.querySelector('.as-picked'), null, 'no Picked group yet');
  await click(box('Walker 12'));
  await click(box('Walker 13'));
  await click(box('Walker K'));
  assert.deepEqual(tableRows(p.container)[0], ['Routes', ['Walker 12', 'Walker 13']], 'the picked routes; Walker K\'s is the follower layer\'s');
  assert.equal(geo(p.container).dataset.picked, '3');
  assert.equal(geo(p.container).dataset.pickFits, '3', 'one fit per change of the set');
  const group = p.container.querySelector('.as-picked');
  assert.ok(group.textContent.startsWith('Picked'));
  assert.deepEqual([...group.querySelectorAll('.as-pick-remove')].map(b => b.getAttribute('aria-label')), ['Stop showing Walker 12', 'Stop showing Walker 13', 'Stop showing Walker K']);
  assert.equal(said(p.container), 'Showing 3 on the map: Walker 12, Walker 13, Walker K.');
  // a remove moves the focus to the next remove button, else the previous, else Clear
  await click(group.querySelector('[aria-label="Stop showing Walker 13"]'));
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Stop showing Walker K');
  assert.equal(said(p.container), 'Stopped showing Walker 13. Showing 2 on the map: Walker 12, Walker K.');
  await click(p.container.querySelector('[aria-label="Stop showing Walker K"]'));
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Stop showing Walker 12', 'the last one: the previous');
  assert.equal(box('Walker 13').checked, false, 'the table reads the same set');
  // Clear empties the set and takes the focus to the table's first checkbox
  await click(p.container.querySelector('.as-picked .as-pick-clear'));
  assert.equal(geo(p.container).dataset.picked, '0');
  assert.equal(document.activeElement, p.container.querySelector('[data-pick-map="watch"] input.as-pick-box'));
  assert.equal(said(p.container), 'The picks were cleared; the map shows every layer.');
  await p.unmount();
});

test('the map fits a change of the pick set the person makes, never a prune the data makes, and no fit undoes a fly the person asked for', async () => {
  const p = await page([{ id: 'find', component: 'FeatureSearch', map: 'watch' }, TABLE, MAP], { ...DATA, people });
  const box = who => p.container.querySelector(`input[aria-label="Show ${who} on the map"]`);
  const fits = () => geo(p.container).dataset.pickFits;
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    await click(box('Walker 12'));
    await click(box('Walker 13'));
    assert.equal(fits(), '2', 'a person\'s pick fits once each');
    // the rows change under the person (replayed data, another scope's devices): Walker 13 leaves the table and the set,
    // and the map stays where it is
    await p.push('/people', people.filter(r => r.who !== 'Walker 13'));
    assert.equal(geo(p.container).dataset.picked, '1', 'the key that left the rows left the set');
    assert.equal(said(p.container), 'Walker 13 is no longer in the table, so no longer shown.');
    assert.equal(fits(), '2', 'a prune the data made does not fit');
    // the remove button is the person's: it fits, once
    await click(box('Walker K'));
    assert.equal(fits(), '3');
    await click(p.container.querySelector('.as-picked [aria-label="Stop showing Walker K"]'));
    assert.equal(fits(), '4', 'the legend\'s remove is the person\'s change, fitted once');
    // a fly the person asks for (the search's pick of an alert): neither a prune nor a pick within the guard moves the map
    const input = p.container.querySelector('.as-feature-search input');
    await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'a1'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await key(input, 'Enter');
    await p.push('/people', people);
    await click(box('Walker B'));
    await p.push('/people', people.filter(r => r.who !== 'Walker B'));
    assert.equal(geo(p.container).dataset.picked, '1', 'the pick, then its prune, happened');
    assert.equal(fits(), '4', 'no fit within the guard of the fly');
    // past the guard the person's pick fits again
    skew = 4000;
    await click(box('Walker K'));
    assert.equal(fits(), '5', 'past the guard a person\'s pick fits');
  } finally {
    Date.now = realNow;
    await p.unmount();
  }
});

test('in a GeoLayout a row action\'s pick keeps to the listed keys, and with dispatch picks every key and asks for the rest (kismet-life-patterns §10.12)', async () => {
  localStorage.clear();
  const meetups = [{ place: 'The hotel', members: ['Walker 12', 'Walker Z'] }];
  const actions = [];
  const surface = (id, components, value) => [{ version: '1.0', createSurface: { surfaceId: id, catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: id, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId: id, path: '/', value } }];
  const meet = { id: 'meet', component: 'DataTable', columns: [{ key: 'place', title: 'Place' }], rows: '/meetups',
    rowActions: [{ action: 'show-who', label: 'Show who', pick: { from: 'members' } }, { action: 'pattern-both', label: 'Show both', pick: { from: 'members', dispatch: true } }] };
  let list = surface('list', [TABLE], { people });
  let setList;
  function Pages() {
    const [l, setL] = React.useState(list);
    setList = setL;
    const surfaces = { map: surface('map', [MAP], DATA), list: l, meet: surface('meet', [meet], { meetups }) };
    const render = id => React.createElement(ui.Surfaces, { envelopes: surfaces[id], onAction: a => actions.push(a) });
    return React.createElement(ui.Pages, { surfaces: ['map', 'list', 'meet'], render, title: 'Walks', persist: 'walks-2',
      layout: { kind: 'geo', map: 'map', windows: [{ page: 'list', label: 'People', icon: 'list', open: true }, { page: 'meet', label: 'Meetups', icon: 'list', open: true }] } });
  }
  const { container, unmount } = await mount(React.createElement(Pages));
  const button = label => container.querySelector(`button[aria-label="${label} The hotel"]`);
  await click(button('Show who'));
  assert.equal(geo(container).dataset.picked, '1', 'a pick alone keeps to the keys a table lists');
  assert.equal(actions.length, 0, 'and dispatches nothing');
  await click(button('Show both'));
  assert.equal(geo(container).dataset.picked, '2', 'with dispatch every key is picked, the one no table lists yet too');
  assert.deepEqual(actions.map(a => [a.name, a.context.row.place]), [['pattern-both', 'The hotel']], 'and the action is dispatched with {row}');
  assert.match(container.textContent, /Asked for Walker Z; each shows when its rows arrive\./);
  // the dispatch's answer arrives: the key now listed is picked in the table, not dropped
  await React.act(async () => { setList(l => [...l, { version: '1.0', updateDataModel: { surfaceId: 'list', path: '/people', value: [...people, { who: 'Walker Z', places: 1 }] } }]); });
  assert.equal(geo(container).dataset.picked, '2');
  assert.deepEqual([...container.querySelectorAll('tbody tr[data-picked]')].map(r => r.querySelectorAll('td')[1].textContent).sort(), ['Walker 12', 'Walker Z']);
  await unmount();
});

test('a search for a feature a show-picked layer hides adds its key; past eight it says so', async () => {
  const many = Array.from({ length: 9 }, (_, i) => line('w' + i, 'track.route', 'Walker ' + i, -3 + i / 10));
  const p = await page([{ id: 'find', component: 'FeatureSearch', map: 'watch' }, { ...MAP, layers: [SPECS[0]] }], { routes: many });
  const search = async words => {
    const input = p.container.querySelector('.as-feature-search input');
    await React.act(async () => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(input, words); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await key(input, 'Enter');
  };
  await search('Walker 3');
  assert.equal(geo(p.container).dataset.picked, '1');
  assert.deepEqual(tableRows(p.container)[0][1], ['Walker 3']);
  for (const i of [0, 1, 2, 4, 5, 6, 7]) await search('Walker ' + i);
  assert.equal(geo(p.container).dataset.picked, '8');
  await search('Walker 8');
  assert.equal(geo(p.container).dataset.picked, '8', 'the ninth is refused');
  assert.equal(said(p.container), 'At most 8 at a time; clear one first to show Walker 8.');
  await p.unmount();
});

test('in a GeoLayout a select table, a watchbox\'s pick and the map share one set; the watchbox keeps to the table\'s rows (GEO-W-08)', async () => {
  localStorage.clear();
  const alerts = [{ ...pt('al1', 'alert.early', 'x', -3.3, 53.4), label: 'Building near the gate', properties: { precursors: ['Walker K', 'Walker 12', 'Walker Z'] } }];
  const surfaces = {
    map: [{ version: '1.0', createSurface: { surfaceId: 'map', catalogId: 'agentspaces-geo' } },
      { version: '1.0', updateComponents: { surfaceId: 'map', components: [{ id: 'root', component: 'Column', children: ['watch'] }, MAP] } },
      { version: '1.0', updateDataModel: { surfaceId: 'map', path: '/', value: DATA } }],
    list: [{ version: '1.0', createSurface: { surfaceId: 'list', catalogId: 'agentspaces-geo' } },
      { version: '1.0', updateComponents: { surfaceId: 'list', components: [{ id: 'root', component: 'Column', children: ['list'] }, TABLE] } },
      { version: '1.0', updateDataModel: { surfaceId: 'list', path: '/', value: { people } } }],
    alerts: [{ version: '1.0', createSurface: { surfaceId: 'alerts', catalogId: 'agentspaces-geo' } },
      { version: '1.0', updateComponents: { surfaceId: 'alerts', components: [{ id: 'root', component: 'Column', children: ['box'] },
        { id: 'box', component: 'Watchbox', path: '/alerts', label: 'alerts', actions: [{ name: 'show-who', label: 'Show who', pick: { from: 'precursors' } }] }] } },
      { version: '1.0', updateDataModel: { surfaceId: 'alerts', path: '/', value: { alerts } } }],
  };
  const render = id => React.createElement(ui.Surfaces, { envelopes: surfaces[id] });
  const windows = [{ page: 'list', label: 'People', icon: 'list' }, { page: 'alerts', label: 'Alerts', icon: 'bell', open: true }];
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['map', 'list', 'alerts'], render, layout: { kind: 'geo', map: 'map', windows }, title: 'Walks', persist: 'walks-1' }));
  // three picks by pointer: the window's chip, then three checkboxes (4 actions, at most 6)
  let actions = 0;
  await click([...container.querySelectorAll('.as-geo-menu-item')].find(b => b.textContent === 'People')); actions++;
  for (const who of ['Walker B', 'Walker 13', 'Walker 12']) { await click(container.querySelector(`input[aria-label="Show ${who} on the map"]`)); actions++; }
  assert.ok(actions <= 6, `three picks in ${actions} actions`);
  assert.equal(geo(container).dataset.picked, '3', 'the map, in another surface, reads the layout\'s set');
  assert.deepEqual(tableRows(container)[0], ['Routes', ['Walker 12', 'Walker 13']]);
  // the watchbox's pick: the property's keys, kept to the table's rows, the rest said
  await click([...container.querySelectorAll('.as-watchbox button')].find(b => b.textContent === 'Show who'));
  assert.equal(geo(container).dataset.picked, '2');
  assert.deepEqual([...container.querySelectorAll('.as-picked .as-pick-remove')].map(b => b.getAttribute('aria-label')), ['Stop showing Walker K', 'Stop showing Walker 12']);
  assert.equal(said(container), 'Showing 2 on the map: Walker K, Walker 12. Not in the table, so left out: Walker Z.');
  assert.deepEqual([...container.querySelectorAll('tbody tr[data-picked]')].map(r => r.querySelectorAll('td')[1].textContent), ['Walker 12', 'Walker K']);
  assert.equal(localStorage.getItem('agentspaces-geo:windows:walks-1')?.includes('Walker') ?? false, false, 'the layout keeps its windows, never the picks');
  await unmount();
});
