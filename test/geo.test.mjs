// agentspaces-geo (srad/agentspaces-geo.md phase 2): the feature logic (GEO-M-01, M-04, S-01, S-03), the basemap names
// (M-05), and the four components drawn where the map cannot draw (no WebGL here), so each layer's features are listed:
// a row selects its feature, Escape clears it (M-03), the legend and the layer menu hide a layer and say when one is
// capped (M-06, F-05), the search finds by label, id and property, ignoring case and accents, and Enter picks the first
// (S-01, S-02), and the card shows its feature's fields as text, follows its updates, says when it is gone, and fills a
// chat's box (S-03, S-05, Q-10). The card heads with a kicker (the kind, a dot in its colour) and, in a GeoLayout's
// window, leaves the title and the close to the window; an empty card or layer says so in an empty state; the map's
// labels are placed by rank without overlapping, at most forty past the selected and the hovered one (M-04).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, key, click, React, ui } from './setup.mjs';

const AT = '2026-11-12T09:14:03Z';
const point = (id, kind, lon, lat, more = {}) => ({ type: 'Feature', id, kind, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {}, label: id, style: {}, at: AT, schemaVersion: 1, ...more });
const ships = [
  point('ship217', 'track.ship.cargo', -3.0123, 53.4087, { label: 'MV Northgate', severity: 'info', properties: { mmsi: '235012345', speed_kn: 11.2, destination: 'Berth 4' } }),
  point('ship340', 'track.ship.tanker', -3.05, 53.45, { label: 'Ålesund Pilot', severity: 'warning', properties: { mmsi: '235099876' } }),
  point('tug9', 'track.tug', -3.02, 53.41, { label: 'Tug Nine' }),
];
const berth = { type: 'Feature', id: 'berth4', kind: 'area.berth', label: 'Berth 4', at: AT, properties: {}, style: { fill: '#29261e' },
  geometry: { type: 'Polygon', coordinates: [[[-3.01, 53.40], [-3.00, 53.40], [-3.00, 53.41], [-3.01, 53.41], [-3.01, 53.40]]] } };
const layers = [{ path: '/berths', kind: 'area.berth', label: 'Berths' }, { path: '/ships', kind: 'track.ship*', label: 'Ships', style: { icon: 'ship' } }];

test('a row that is not a GeoFeature is left out, and a kind filter takes its prefix', () => {
  assert.equal(ui.featureOf({ id: 'x', kind: 'k', geometry: { type: 'Point', coordinates: [0, 0] } }), undefined, 'no type Feature');
  assert.equal(ui.featureOf({ type: 'Feature', id: 'x', kind: 'k', geometry: { type: 'GeometryCollection', geometries: [] } }), undefined);
  assert.equal(ui.featureOf(point('a', 'k', 0, 0)).id, 'a');
  assert.ok(ui.kindMatches('track.ship*', 'track.ship.cargo'));
  assert.ok(!ui.kindMatches('track.ship', 'track.ship.cargo'));
  const [b, s] = ui.featureLayers(layers, p => ({ '/berths': [berth, ships[0]], '/ships': ships, '/shipsTotal': 12 })[p], ['#111111', '#222222']);
  assert.deepEqual(b.features.map(f => f.id), ['berth4'], 'the berths layer draws its kind alone');
  assert.deepEqual(s.features.map(f => f.id), ['ship217', 'ship340']);
  // the binding's 12 count every kind it matched; this layer drew two of the three it holds (a tug is another kind)
  assert.equal(s.total, undefined, 'a layer of some kinds has no total of its own');
  assert.equal(ui.capped(s), '2, from the newest 3 of 12');
  const [whole] = ui.featureLayers([{ path: '/ships' }], p => ({ '/ships': ships, '/shipsTotal': 12 })[p], ['#111111']);
  assert.equal(ui.capped(whole), '3 of 12', 'a layer that is the whole path takes the binding\'s total');
  const [shared] = ui.featureLayers([{ path: '/ships', kind: 'track.tug' }], p => ({ '/ships': ships, '/shipsTotal': 3 })[p], ['#111111']);
  assert.equal(ui.capped(shared), '1', 'kinds sharing an uncut binding: each its own count, never "1 of 3"');
  assert.equal(b.color, '#111111', 'the look\'s hue for the layer\'s turn');
});

test('a feature\'s colour is its own, else its kind\'s, else its layer\'s, else the layer\'s hue', () => {
  const layer = ui.featureLayers([{ path: '/x', style: { size: 30 } }], () => [], ['#4477aa'])[0];
  const kinds = [{ kind: 'track.ship', style: { color: '#8888cc', icon: 'ship' } }, { kind: 'track.ship.tanker', style: { color: '#c97531' } }];
  const own = ui.lookOf(ui.featureOf(point('a', 'track.ship.cargo', 0, 0, { style: { color: '#ff4544' } })), layer, kinds);
  assert.equal(own.color, '#ff4544');
  assert.equal(own.icon, 'ship', 'the kind gives what the feature does not');
  assert.equal(own.size, 30, 'the layer gives what neither does');
  assert.equal(ui.lookOf(ui.featureOf(point('b', 'track.ship.tanker', 0, 0)), layer, kinds).color, '#c97531', 'the longest kind wins');
  assert.equal(ui.lookOf(ui.featureOf(point('c', 'zone', 0, 0)), layer, kinds).color, '#4477aa');
  assert.deepEqual(ui.styleOf({ color: 'url(javascript:x)', opacity: 3, icon: 'skull', width: 2 }), { width: 2 }, 'only the closed grammar passes');
});

test('points cluster on a grid below a layer\'s zoom, and a lone point stays a point', () => {
  const many = Array.from({ length: 50 }, (_, i) => ui.featureOf(point('p' + i, 'k', 2.35 + i * 0.0001, 48.85)));
  many.push(ui.featureOf(point('far', 'k', 140, -35)));
  const low = ui.clusterPoints(many, 3);
  assert.equal(low.clusters.length, 1);
  assert.equal(low.clusters[0].count, 50);
  assert.deepEqual(low.points.map(f => f.id), ['far']);
  const high = ui.clusterPoints(many, 20);
  assert.equal(high.clusters.length, 0, 'at a street zoom every point stands alone');
});

test('the search folds case and accents, ranks a label that starts with the query first, and stops at ten', () => {
  const ls = ui.featureLayers([{ path: '/s' }], () => [...ships, ...Array.from({ length: 20 }, (_, i) => point('buoy' + i, 'mark.buoy', 0, 0, { label: 'Buoy ' + i }))], ['#111111']);
  assert.deepEqual(ui.searchFeatures(ls, 'alesund').map(h => h.feature.id), ['ship340'], 'Å folds to a');
  assert.deepEqual(ui.searchFeatures(ls, 'NORTH').map(h => h.feature.id), ['ship217']);
  assert.deepEqual(ui.searchFeatures(ls, '235099876', ['mmsi']).map(h => h.feature.id), ['ship340'], 'a named property');
  assert.deepEqual(ui.searchFeatures(ls, '235099876').map(h => h.feature.id), [], 'an unnamed property is not searched');
  assert.equal(ui.searchFeatures(ls, 'buoy').length, 10);
  assert.deepEqual(ui.searchFeatures(ls, 'nine').map(h => h.feature.id), ['tug9']);
  assert.deepEqual(ui.searchFeatures(ls, 'tug').map(h => h.feature.id), ['tug9'], 'the id too');
  const near = [{ index: 0, features: [
    point('link1', 'link.berth', -3, 53.4, { label: 'MV Northgate bound for Seaforth' }),
    point('near1', 'incident', -3, 53.4, { label: 'Near miss: MV Northgate' }),
    point('ship1', 'track.ship', -3, 53.4, { label: 'MV Northgate' }),
    point('gate', 'berth', -3, 53.4, { label: 'Northgate' }),
    point('gate2', 'berth', -3, 53.4, { label: 'Northgate Quay' })].map(ui.featureOf) }];
  assert.deepEqual(ui.searchFeatures(near, 'northgate').map(h => h.feature.id), ['gate', 'gate2', 'ship1', 'near1', 'link1'],
    'the label itself, then a start, then a word start with the shorter label first');
});

test('the card\'s fields put the kind\'s first, and an age reads in words', () => {
  const f = ui.featureOf(ships[0]);
  assert.deepEqual(ui.cardFields(f, [{ kind: 'track.ship', fields: ['destination', 'mmsi'] }]).map(([k]) => k), ['destination', 'mmsi', 'speed_kn']);
  assert.deepEqual(ui.cardFields(f, [], ['speed_kn']).map(([k]) => k), ['speed_kn', 'mmsi', 'destination']);
  const now = Date.parse(AT);
  assert.equal(ui.ageOf(AT, now + 12_000), '12 s ago');
  assert.equal(ui.ageOf(AT, now + 4 * 60_000), '4 min ago');
  assert.equal(ui.ageOf('not a time', now), '');
});

test('a basemap is a name: the open three, the host\'s, and the look\'s default for anything else', () => {
  assert.equal(ui.basemapStyle('', true, '#0a0a0a').name, 'osm-dark');
  assert.equal(ui.basemapStyle('', false, '#ffffff').name, 'osm');
  assert.deepEqual(ui.basemapStyle('plain', true, '#101418').style.layers[0].paint, { 'background-color': '#101418' });
  const unknown = ui.basemapStyle('https://tiles.example/style.json', true, '#000000');
  assert.equal(unknown.known, false, 'a URL is not a name');
  assert.equal(unknown.name, 'osm-dark');
  ui.registerBasemap('harbour-pm', { version: 8, sources: {}, layers: [] });
  assert.ok(ui.basemapNames().includes('harbour-pm'));
  assert.equal(ui.basemapStyle('harbour-pm', true, '#000000').known, true);
  assert.throws(() => ui.registerBasemap('Bad Name', {}), /lower case/);
});

/** A geo page whose envelopes grow: push(path, value) feeds one path, as a feature binding's update does. */
async function page(components, data, extra = []) {
  const actions = [];
  let set;
  const base = [
    { version: '1.0', createSurface: { surfaceId: 'harbour', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'harbour', components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId: 'harbour', path: '/', value: data } },
    ...extra,
  ];
  function Host() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }); }
  const m = await mount(React.createElement(Host));
  const push = async (path, value, surfaceId = 'harbour') => { await React.act(async () => { set(e => [...e, { version: '1.0', updateDataModel: { surfaceId, path, value } }]); }); };
  return { ...m, actions, push };
}
const map = { id: 'harbour', component: 'GeoMap', layers, kinds: '/kinds', selectAction: 'inspect' };
const data = { ships, shipsTotal: 3, berths: [berth], berthsTotal: 1, kinds: [{ kind: 'track.ship', label: 'Ships', fields: ['destination'] }] };
const button = (container, words) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === words);
const settle = () => React.act(async () => { await new Promise(r => setTimeout(r, 200)); });

test('where the map cannot draw, each layer lists its features; a row selects, Escape clears', async () => {
  const p = await page([map], data);
  const el = p.container.querySelector('[data-component="GeoMap"]');
  assert.equal(el.dataset.state, 'fallback');
  assert.ok(p.text().includes('MV Northgate') && p.text().includes('Berth 4'), p.text());
  assert.ok(!p.text().includes('Tug Nine'), 'the ships layer draws track.ship* alone');
  await click(button(p.container, 'MV Northgate'));
  assert.equal(el.dataset.selected, 'ship217');
  assert.equal(p.actions.at(-1).name, 'inspect');
  assert.deepEqual(p.actions.at(-1).context, { id: 'ship217', kind: 'track.ship.cargo' }, 'the select action carries the id and the kind');
  await key(document.body, 'Escape');
  assert.equal(el.dataset.selected, '');
  await p.unmount();
});

test('with the map focused, N and Shift+N step through the shown features in label order and say each (GEO-Q-40)', async () => {
  const p = await page([map], data);
  const el = p.container.querySelector('[data-component="GeoMap"]');
  const canvas = el.querySelector('.canvas');
  const said = () => el.querySelector('[aria-live="polite"].as-visually-hidden').textContent;
  assert.match(canvas.getAttribute('aria-label'), /N and Shift\+N/);
  await key(canvas, 'n');
  assert.equal(el.dataset.selected, 'ship340', 'Ålesund Pilot comes first by label');
  assert.match(said(), /^Ålesund Pilot, track\.ship\.tanker, warning: 1 of 3\./);
  await key(canvas, 'n');
  assert.equal(el.dataset.selected, 'berth4');
  await key(canvas, 'N', { shiftKey: true });
  await key(canvas, 'N', { shiftKey: true });
  assert.equal(el.dataset.selected, 'ship217', 'Shift+N wraps from the first to the last');
  await key(canvas, 'Enter');
  assert.equal(el.dataset.selected, 'ship217', 'Enter shows the selected one and keeps it');
  await click(el.querySelector('.legend .entry'));
  await key(canvas, 'n');
  assert.equal(el.dataset.selected, 'ship340', 'a hidden layer is not stepped through');
  assert.match(said(), /1 of 2/);
  await click(el.querySelector('.legend .entry'));   // the browser keeps a hidden layer; leave it shown
  await p.unmount();
});

test('the legend and the layer menu hide the same layer, and a capped layer says so', async () => {
  const p = await page([map, { id: 'layers', component: 'LayerMenu', map: 'harbour' }], { ...data, shipsTotal: 4800 });
  assert.ok(p.text().includes('2, from the newest 3 of 4,800'), 'the capped count: ' + p.text());
  const box = [...p.container.querySelectorAll('.as-layer-menu input[type="checkbox"]')];
  assert.equal(box.length, 2);
  await click(box[0]);
  assert.ok(!p.container.querySelector('.as-geomap .table-view').textContent.includes('Berth 4'), 'the menu hid the berths');
  const entry = p.container.querySelector('.as-geomap .legend .entry');
  assert.equal(entry.getAttribute('aria-pressed'), 'false', 'and the legend agrees');
  await click(entry);
  assert.ok(p.container.querySelector('.as-geomap .table-view').textContent.includes('Berth 4'));
  assert.equal(p.container.querySelectorAll('.as-layer-menu input:checked').length, 2);
  await p.unmount();
});

test('the search finds as a person types, ignoring accents, and Enter picks the first', async () => {
  const p = await page([{ id: 'find', component: 'FeatureSearch', map: 'harbour', fields: ['mmsi'] }, map], data);
  const input = p.container.querySelector('.as-feature-search input');
  const type = async value => { await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); };
  await type('alesund');
  await settle();
  const results = [...p.container.querySelectorAll('.as-feature-search [role="option"]')];
  assert.deepEqual(results.map(r => r.querySelector('.label')?.textContent), ['Ålesund Pilot']);
  assert.ok(results[0].textContent.includes('track.ship.tanker'), 'the kind beside the label');
  await type('235012345');
  await key(input, 'Enter');
  assert.equal(p.container.querySelector('[data-component="GeoMap"]').dataset.selected, 'ship217', 'Enter picked the first without waiting');
  assert.equal(input.value, '', 'the box empties');
  await type('zzz');
  await settle();
  assert.ok(p.text().includes('No feature matches'));
  await p.unmount();
});

test('the card shows the fields as text, the kind\'s first, follows updates, says when its feature is gone, and fills a chat\'s box', async () => {
  const markup = '<img src=x onerror="globalThis.pwned=1">';
  const hostile = point('x1', 'track.ship.hulk', -3.0, 53.4, { label: markup, properties: { note: markup } });
  const chat = [
    { version: '1.0', createSurface: { surfaceId: 'ask', catalogId: 'agentspaces-widgets' } },
    { version: '1.0', updateComponents: { surfaceId: 'ask', components: [{ id: 'root', component: 'Column', children: ['chat'] }, { id: 'chat', component: 'Chat', key: 'main' }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'ask', path: '/', value: { conversations: [] } } },
  ];
  const p = await page([{ id: 'details', component: 'FeatureCard', map: 'harbour', ask: 'ask/chat' }, map],
    { ...data, _geo: { harbour: { selected: 'ship217' } } }, chat);
  const card = () => p.container.querySelector('[data-component="FeatureCard"]');
  assert.equal(card().querySelector('h3').textContent, 'MV Northgate');
  assert.ok(card().textContent.includes('track.ship.cargo') && card().textContent.includes('info'));
  const kicker = card().querySelector('header .as-kicker');
  assert.equal(kicker.textContent, 'track.ship.cargo', 'the kind as the kicker above the title');
  assert.ok(kicker.querySelector('.dot[aria-hidden="true"]').style.background, 'with a dot in the kind\'s colour');
  assert.ok(button(card(), 'Close'), 'a card of its own closes itself');
  assert.deepEqual([...card().querySelectorAll('dt')].map(d => d.textContent), ['destination', 'mmsi', 'speed_kn'], 'the kind\'s fields first');
  // the feature moves and changes: the card follows
  await p.push('/ships', [{ ...ships[0], properties: { ...ships[0].properties, destination: 'Berth 7' } }, ships[1]]);
  assert.ok(card().textContent.includes('Berth 7'));
  await click(button(card(), 'Follow'));
  assert.equal(button(card(), 'Following').getAttribute('aria-pressed'), 'true');
  await click(button(card(), 'Ask'));
  const box = p.container.querySelector('[data-component="Chat"] input');
  assert.equal(box.value, 'About MV Northgate (ship217) ', 'the chat\'s box holds the question for the person to finish');
  // its lease ends: the entry leaves the binding
  await p.push('/ships', [ships[1]]);
  assert.ok(card().textContent.includes('MV Northgate is no longer on the map.'), 'it says plainly which left the map: ' + card().textContent);
  assert.equal(card().querySelector('h3').textContent, 'MV Northgate', 'under its last label, never its raw id');
  assert.ok(button(card(), 'Close'), 'and closes');
  // a feature full of markup: text, never markup (GEO-Q-10)
  await p.push('/ships', [...ships, hostile]);
  await p.push('/_geo/harbour/selected', 'x1');
  assert.equal(card().querySelector('h3').textContent, markup, 'the label as text');
  assert.ok(card().querySelector('dd').textContent.includes(markup));
  assert.equal(p.container.querySelector('img'), null);
  assert.equal(globalThis.pwned, undefined);
  await p.unmount();
});

test('10,000 points and 500 polygons are read, styled and clustered well inside a frame budget (the CPU side of GEO-M-04)', () => {
  const pts = Array.from({ length: 10_000 }, (_, i) => point('p' + i, 'track.ship.cargo', -6 + (i % 100) * 0.06, 50 + Math.floor(i / 100) * 0.06, { severity: i % 50 ? undefined : 'warning' }));
  const polys = Array.from({ length: 500 }, (_, i) => ({ ...berth, id: 'b' + i }));
  const t0 = performance.now();
  const [ships, berths] = ui.featureLayers([{ path: '/s', kind: 'track.ship*', cluster: { below: 9 } }, { path: '/b' }], p => (p === '/s' ? pts : p === '/b' ? polys : undefined), ['#8888cc', '#9a8139']);
  const looks = ships.features.map(f => ui.lookOf(f, ships, []));
  const low = ui.clusterPoints(ships.features, 6);
  const read = performance.now() - t0;
  assert.equal(ships.features.length, 10_000);
  assert.equal(berths.features.length, 500);
  assert.equal(looks.length, 10_000);
  assert.ok(low.clusters.length > 0 && low.clusters.reduce((n, c) => n + c.count, 0) + low.points.length === 10_000, 'every point is in a cluster or alone');
  // a generous bound for a test machine; the frame rate itself is measured in a browser on the reference laptop
  assert.ok(read < 400, `read, styled and clustered in ${read.toFixed(0)} ms`);
});

test('the time slider shows the features of a window that ends where the person drags it (GEO-M-07)', async () => {
  const t = m => new Date(Date.parse(AT) + m * 60_000).toISOString();
  const tracks = [point('a', 'track.ship', -3, 53.4, { label: 'Early', at: t(0) }), point('b', 'track.ship', -3, 53.4, { label: 'Middle', at: t(30) }), point('c', 'track.ship', -3, 53.4, { label: 'Late', at: t(60) })];
  const p = await page([{ id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }], timeSlider: true }], { ships: tracks });
  const table = () => p.container.querySelector('.table-view').textContent;
  assert.ok(table().includes('Early') && table().includes('Late'), 'every time at first');
  const select = p.container.querySelector('.time select');
  await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value').set.call(select, String(15 * 60_000)); select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.ok(table().includes('Late') && !table().includes('Middle') && !table().includes('Early'), 'the last 15 minutes: ' + table());
  const range = p.container.querySelector('.time input[type="range"]');
  await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(range), 'value').set.call(range, String(Date.parse(t(35)))); range.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.ok(table().includes('Middle') && !table().includes('Late'), 'dragged back to the middle: ' + table());
  assert.ok(p.container.querySelector('.time').textContent.includes('1 shown'));
  await p.unmount();
});

test('a point keeps its feature\'s id whatever the id holds, and a MultiPoint\'s points share their feature\'s', () => {
  // an id may hold a '#' (the schema allows any 1 to 128 characters): the point's look and its click are its own feature's,
  // never those of a feature whose id is the part before the '#'
  const hash = ui.featureOf(point('alert#42', 'k', 1, 2));
  const plain = ui.featureOf(point('alert', 'k', 3, 4, { style: { color: '#ff4544' } }));
  const multi = ui.featureOf({ type: 'Feature', id: 'fleet', kind: 'k', geometry: { type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] } });
  const lookalike = ui.featureOf(point('fleet#1', 'k', 5, 6));
  const pts = ui.pointsOf([hash, plain, multi, lookalike]);
  assert.deepEqual(pts.map(p => p.partOf), ['alert#42', 'alert', 'fleet', 'fleet', 'fleet#1']);
  assert.deepEqual(pts.map(p => p.id), ['alert#42', 'alert', 'fleet', 'fleet', 'fleet#1'], 'the feature\'s own id, unsplit');
  assert.equal(new Set(pts.map(p => p.key)).size, 5, 'every point its own key, the lookalike id too');
  assert.deepEqual(pts[3].geometry, { type: 'Point', coordinates: [1, 1] });
  const layer = ui.featureLayers([{ path: '/x' }], () => [], ['#4477aa'])[0];
  const looks = new Map([hash, plain, multi, lookalike].map(f => [f.id, ui.lookOf(f, layer, [])]));
  assert.ok(pts.every(p => looks.get(p.partOf)), 'each point finds its look');
  assert.equal(looks.get(pts[0].partOf).color, '#4477aa', 'not the look of the feature named "alert"');
  assert.deepEqual(ui.clusterPoints(pts, 20).points.map(p => p.partOf), pts.map(p => p.partOf), 'clustering keeps what each point belongs to');
});

test('the time slider\'s grid ends on the newest time, so the thumb reaches it', () => {
  const span = [Date.parse(AT), Date.parse(AT) + 24 * 3_600_000 + 1234];
  const g = ui.sliderGrid(span);
  assert.equal(g.max, span[1]);
  assert.equal(g.step, Math.round((span[1] - span[0]) / 200));
  assert.equal((g.max - g.min) % g.step, 0, 'max is min plus a whole number of steps');
  assert.ok(g.min <= span[0] && g.min > span[0] - g.step, 'and min sits within a step below the earliest');
  assert.deepEqual(ui.sliderGrid([5000, 5000]), { min: 5000, max: 5000, step: 1000 }, 'one instant: a grid of one');
});

test('with a time window set, a watchbox\'s row for a feature outside it moves the window to show it', async () => {
  const t = m => new Date(Date.parse(AT) + m * 60_000).toISOString();
  const tracks = [point('a', 'track.ship', -3, 53.4, { label: 'Early', at: t(0) }), point('b', 'track.ship', -3, 53.4, { label: 'Middle', at: t(30) }), point('c', 'track.ship', -3, 53.4, { label: 'Late', at: t(60) })];
  const p = await page([{ id: 'recent', component: 'Watchbox', path: '/ships', map: 'harbour' }, { id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }], timeSlider: true }], { ships: tracks });
  const table = () => p.container.querySelector('.table-view').textContent;
  const select = p.container.querySelector('.time select');
  await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value').set.call(select, String(15 * 60_000)); select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.ok(!table().includes('Early'), 'the last 15 minutes: ' + table());
  await click(p.container.querySelector('[data-feature="a"] .as-watchbox-pick'));
  assert.equal(p.container.querySelector('[data-component="GeoMap"]').dataset.selected, 'a');
  assert.ok(table().includes('Early') && !table().includes('Late'), 'the window moved to end at its time: ' + table());
  assert.ok(p.container.querySelector('.time').textContent.includes('09:14 UTC'), p.container.querySelector('.time').textContent);
  await p.unmount();
});

test('Enter right after typing picks the first result of what was typed, not the arrows\' place in the last list', async () => {
  const p = await page([{ id: 'find', component: 'FeatureSearch', map: 'harbour', fields: ['mmsi'] }, map], data);
  const input = p.container.querySelector('.as-feature-search input');
  const type = async value => { await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); };
  await type('2350');
  await settle();
  assert.equal(p.container.querySelectorAll('.as-feature-search [role="option"]').length, 2);
  await key(input, 'ArrowDown');
  assert.equal(p.container.querySelector('.as-feature-search [aria-selected="true"] .label').textContent, 'Ålesund Pilot');
  await type('235');
  await key(input, 'Enter');
  assert.equal(p.container.querySelector('[data-component="GeoMap"]').dataset.selected, 'ship217', 'the first of the new results');
  await p.unmount();
});

test('Copy id shows the id to copy by hand where the page has no clipboard (not a secure context)', async () => {
  const p = await page([{ id: 'details', component: 'FeatureCard', map: 'harbour' }, map], { ...data, _geo: { harbour: { selected: 'ship217' } } });
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  try {
    await click(button(p.container.querySelector('[data-component="FeatureCard"]'), 'Copy id'));
    assert.equal(p.container.querySelector('[data-component="FeatureCard"] [role="status"]')?.textContent, 'ship217');
  } finally {
    delete navigator.clipboard;
  }
  await p.unmount();
});

test('a card with nothing selected and an empty layer say so in an empty state, in the words they always used', async () => {
  // an empty list at /none: a path with nothing at all is still loading (test/states.test.mjs); and no selection, since
  // the surface id is the one an earlier test selected on, and a selection outlives a page drawn again on it
  const p = await page([{ id: 'details', component: 'FeatureCard', map: 'harbour' }, { ...map, layers: [...layers, { path: '/none', label: 'None' }] }],
    { ...data, none: [], _geo: { harbour: { selected: '' } } });
  const empty = p.container.querySelector('[data-component="FeatureCard"] .as-empty');
  assert.ok(empty, 'the card\'s empty state');
  assert.equal(empty.querySelector('.glyph').getAttribute('aria-hidden'), 'true');
  assert.ok(empty.querySelector('b').textContent);
  assert.equal(empty.querySelector('p').textContent, 'Select a feature on the map for its details.');
  const layer = [...p.container.querySelectorAll('.layer-table')].find(t => t.textContent.includes('None'));
  assert.equal(layer.querySelector('.as-empty p').textContent, 'No feature yet.');
  await p.unmount();
});

test('in a GeoLayout\'s details window the card leaves the title and the close to the window, and keeps its kicker and fields', async () => {
  localStorage.clear();
  const ship = { ...ships[0], properties: { ...ships[0].properties, score: 0.82 } };
  const envelopes = [
    { version: '1.0', createSurface: { surfaceId: 'watch', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'watch', components: [{ id: 'root', component: 'Column', children: ['harbour'] }, { id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'watch', path: '/', value: { ships: [ship] } } },
  ];
  const surface = id => (id === 'watch' ? React.createElement(ui.Surfaces, { envelopes }) : React.createElement('p', null, id));
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch'], render: surface, layout: { kind: 'geo', map: 'watch', windows: [] }, title: 'Harbour', persist: 'geo-card-window' }));
  await click([...container.querySelectorAll('.as-geo-map button')].find(b => b.textContent === 'MV Northgate'));
  const details = container.querySelector('.as-geo-details [data-window="details"]');
  assert.ok(details, 'the details window opened');
  const card = details.querySelector('[data-component="FeatureCard"]');
  assert.ok(card.classList.contains('in-window'));
  assert.equal(card.querySelector('h3'), null, 'the window\'s head holds the title');
  assert.equal(button(card, 'Close'), undefined, 'and the close');
  assert.ok(details.querySelector('[aria-label="close MV Northgate"]'), 'the window closes it');
  assert.equal(card.querySelector('.as-kicker').textContent, 'track.ship.cargo');
  assert.ok(details.textContent.includes('score'), 'the fields, the score among them');
  await unmount();
  localStorage.clear();
});

test('a details window whose feature leaves the data keeps its last label as the title, says so plainly, and closes by itself', async t => {
  localStorage.clear();
  const g = await ui.loadGeo();
  let set;
  const base = [
    { version: '1.0', createSurface: { surfaceId: 'watch', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'watch', components: [{ id: 'root', component: 'Column', children: ['harbour'] }, { id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'watch', path: '/', value: { ships } } },
  ];
  function Map() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env }); }
  const push = async (path, value) => { await React.act(async () => { set(e => [...e, { version: '1.0', updateDataModel: { surfaceId: 'watch', path, value } }]); }); };
  const surface = id => (id === 'watch' ? React.createElement(Map) : React.createElement('p', null, id));
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch'], render: surface, layout: { kind: 'geo', map: 'watch', windows: [] }, title: 'Harbour', persist: 'geo-card-gone' }));
  await click([...container.querySelectorAll('.as-geo-map button')].find(b => b.textContent === 'MV Northgate'));
  const details = () => container.querySelector('.as-geo-details [data-window="details"]');
  assert.equal(details().getAttribute('aria-label'), 'MV Northgate');
  // its lease ends: the entry leaves the binding, and the time it waits is the test's to move
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await push('/ships', ships.slice(1));
  assert.equal(details().querySelector('.as-geo-window-head b').textContent, 'MV Northgate', 'the title stays the last label, never the raw id');
  assert.equal(details().getAttribute('aria-label'), 'MV Northgate');
  const card = details().querySelector('[data-component="FeatureCard"]');
  assert.ok(card.textContent.includes('MV Northgate is no longer on the map.'), card.textContent);
  assert.ok(!card.textContent.includes('ship217'), 'no raw id in sight');
  assert.ok(card.textContent.includes('closes in a few seconds'));
  assert.ok(button(card, 'Close'), 'with a Close of its own');
  await React.act(async () => { t.mock.timers.tick(g.GONE_CLOSE_MS - 100); });
  assert.ok(details(), 'still open a little before the time');
  await React.act(async () => { t.mock.timers.tick(200); });
  assert.equal(details(), null, 'closed by itself');
  assert.equal(container.querySelector('[data-component="GeoMap"]').dataset.selected, '', 'and the selection with it');
  // the feature comes back before the time: the window stays and shows it again
  await push('/ships', ships);
  await click([...container.querySelectorAll('.as-geo-map button')].find(b => b.textContent === 'MV Northgate'));
  await push('/ships', ships.slice(1));
  await push('/ships', ships);
  await React.act(async () => { t.mock.timers.tick(g.GONE_CLOSE_MS * 2); });
  assert.ok(details()?.querySelector('[data-feature="ship217"]'), 'a feature back in the data keeps its window');
  // Close closes at once
  await push('/ships', ships.slice(1));
  await click(button(details(), 'Close'));
  assert.equal(details(), null);
  t.mock.timers.reset();
  await unmount();
  localStorage.clear();
});

test('map labels: by rank, none overlapping, none off the screen, at most the cap past the selected and the hovered', async () => {
  const geo = await ui.loadGeo();
  const ranked = geo.rankLabels([
    { key: 'a', label: 'Quiet', at: '2026-11-12T09:00:00Z' },
    { key: 'b', label: 'Newer', at: '2026-11-12T10:00:00Z' },
    { key: 'c', label: 'Grave', severity: 'critical', at: '2026-11-12T08:00:00Z' },
    { key: 'd', label: 'Picked', always: true },
  ]);
  assert.deepEqual(ranked.map(l => l.key), ['d', 'c', 'b', 'a'], 'the always first, then the graver, then the newer');
  const at = (key, x, y, more = {}) => ({ key, label: 'Label ' + key, x, y, dy: 10, ...more });
  // two labels on one spot: the first in rank keeps it
  assert.deepEqual([...geo.placeLabels([at('a', 100, 100), at('b', 104, 102), at('c', 300, 100)], 800, 600)], ['a', 'c']);
  // the always shown one is placed even over another, and the next ones keep clear of it
  assert.deepEqual([...geo.placeLabels([at('s', 100, 100, { always: true }), at('h', 102, 100, { always: true }), at('a', 106, 100)], 800, 600)], ['s', 'h']);
  // off the screen is not placed
  assert.deepEqual([...geo.placeLabels([at('a', -200, 100), at('b', 100, 900), at('c', 100, 100)], 800, 600)], ['c']);
  // a grid of a hundred far-apart points shows the cap alone, and the always ones on top of it
  const grid = Array.from({ length: 100 }, (_, i) => at('g' + i, 60 + (i % 10) * 120, 30 + Math.floor(i / 10) * 60));
  assert.equal(geo.placeLabels(grid, 1400, 700).size, geo.LABEL_MAX);
  assert.equal(geo.placeLabels([at('s', 5000, 5000, { always: true }), ...grid], 1400, 700).size, geo.LABEL_MAX, 'an always one off the screen is not drawn');
  assert.equal(geo.placeLabels([at('s', 700, 690, { always: true }), ...grid], 1400, 700).size, geo.LABEL_MAX + 1);
  const box = geo.labelBox(at('x', 100, 100));
  assert.ok(box.left < 100 && box.right > 100 && box.top === 110, 'the chip sits centred under its point');
});
