// kismet-life-patterns §10.13, the walk-through's screenshot check: map labels kept inside the part of the map no window
// covers and to the features a layer's labels name (hidden while its windows are open), a fitNew layer's new features,
// the windows a GeoLayout has open, a DataTable's lists capped at five with "+N", its long columns and wrapping row
// buttons, and a KeyValue item whose value is blank left out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mount, click, draw, envelope, React, ui } from './setup.mjs';

test('labels stay inside the visible part of the map: none under a docked window, an always one moved in, not one whose point is covered', async () => {
  const geo = await ui.loadGeo();
  const at = (key, x, y, more = {}) => ({ key, label: 'Label ' + key, x, y, dy: 10, ...more });
  const insets = { left: 300, right: 200, top: 40, bottom: 100 };
  // a label under the left window, one across its edge, one under the bottom row, one in the clear
  assert.deepEqual([...geo.placeLabels([at('under', 100, 200), at('edge', 310, 200), at('foot', 500, 560), at('clear', 500, 200)], 1000, 600, undefined, undefined, insets)], ['clear']);
  // without insets the same labels inside the map all show, and one across the map's own edge does not
  assert.deepEqual([...geo.placeLabels([at('under', 100, 200), at('rim', 4, 300), at('clear', 500, 200)], 1000, 600)], ['under', 'clear']);
  // the selected one, near the window's edge, moves right into the clear; one whose point a window covers stays put
  const { shown, shift } = geo.layoutLabels([at('sel', 305, 200, { always: true }), at('hidden', 100, 200, { always: true })], 1000, 600, undefined, undefined, insets);
  assert.deepEqual([...shown], ['sel', 'hidden']);
  assert.ok(shift.get('sel')[0] > 0 && shift.get('sel')[1] === 0, `moved right: ${shift.get('sel')}`);
  assert.equal(shift.has('hidden'), false, 'its point is under the window, so its chip is not dragged away from it');
  // one near the foot goes above its point
  const foot = geo.layoutLabels([at('low', 500, 495, { always: true })], 1000, 600, undefined, undefined, insets);
  assert.ok(foot.shift.get('low')[1] < 0, 'above its point');
  // insets that leave too little keep the whole map
  assert.deepEqual(geo.visibleArea(300, 200, { left: 200, right: 150 }), { left: 0, top: 0, right: 300, bottom: 200 });
});

test('a layer\'s labels filter names the features whose labels show; hideWhileOpen is carried; fitNew finds the features new since the last drawing', () => {
  const f = (id, scope, kind = 'alert.early') => ({ type: 'Feature', id, kind, label: 'L ' + id, geometry: { type: 'Point', coordinates: [-105, 39.7] }, properties: { scope } });
  const data = { '/features': [f('a', 'ds-1'), f('b', 'ds-2'), f('c', 'ds-1')], '/analysis': [{ id: 'analysis', scope: 'ds-1' }] };
  const dataAt = p => (p === '/analysis/0' ? data['/analysis'][0] : data[p]);
  const spec = { path: '/features', kind: 'alert*', labels: { filter: { path: '/analysis/0', match: ['scope'] }, hideWhileOpen: ['life', 'matrix'] } };
  const [layer] = ui.featureLayers([spec], dataAt, ['#123456']);
  assert.equal(layer.features.length, 3, 'every feature draws');
  assert.deepEqual([...layer.labelIds].sort(), ['a', 'c'], 'the data set on screen labels');
  assert.deepEqual(layer.hideLabelsWhileOpen, ['life', 'matrix']);
  const [all] = ui.featureLayers([{ ...spec, labels: { filter: { path: '/missing', match: 'scope' } } }], dataAt, ['#123456']);
  assert.equal(all.labelIds, undefined, 'no value at the path keeps every label');
  assert.equal(ui.labelsSpecOf({ hideWhileOpen: [] }), undefined);
  // fitNew
  const held = new Map();
  const ext = (ids) => ui.featureLayers([{ path: '/x', kind: 'place.dataset', fitNew: true }], () => ids.map(id => f(id, id, 'place.dataset')), ['#123456']);
  assert.deepEqual(ui.freshFeatures(ext(['ds-1']), held), [], 'the first drawing fits nothing');
  assert.deepEqual(ui.freshFeatures(ext(['ds-1']), held), [], 'nothing new');
  assert.deepEqual(ui.freshFeatures(ext(['ds-2']), held).map(x => x.id), ['ds-2'], 'Show switched the data set');
  assert.deepEqual(ui.freshFeatures(ui.featureLayers([{ path: '/x', kind: 'place.dataset' }], () => [f('z', 'z', 'place.dataset')], ['#1']), new Map()), [], 'a layer without fitNew never fits');
});

test('a GeoLayout tells its windows\' surfaces which pages are open', async () => {
  localStorage.clear();
  let seen = [];
  function Probe() { const frame = ui.useGeoFrame(); seen = frame?.openPages ?? null; return null; }
  const render = id => (id === 'watch' ? React.createElement(Probe) : React.createElement('p', null, id));
  const layout = { kind: 'geo', map: 'watch', windows: [{ page: 'alerts', label: 'Alerts', open: true, dock: 'left' }, { page: 'life', label: 'Life', dock: 'right' }] };
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'alerts', 'life'], render, layout, persist: 'polish-1' }));
  assert.deepEqual(seen, ['alerts']);
  await click([...container.querySelectorAll('.as-geo-menu-item')].find(b => b.textContent.includes('Life')));
  assert.deepEqual(seen, ['alerts', 'life']);
  await unmount();
  localStorage.clear();
});

test('a DataTable caps a list in a cell at five with +N, keeps a long column readable, and lets its row buttons wrap', async () => {
  const rows = [{ place: 'Stage door', devices: ['Device BJ', 'Device BE', 'Device F', 'Device G', 'Device H', 'Device I', 'Device J'], note: 'I learned denver-weeks-1-4.csv (4 Oct to 1 Nov): the model holds 5 weeks of 7730 devices' },
    { place: 'Hotel', devices: ['Device A'], note: 'short' }];
  const p = await draw(envelope('t', [{ id: 'w', component: 'DataTable', columns: [{ key: 'place', title: 'Place' }, { key: 'devices', title: 'Devices' }, { key: 'note', title: 'Note' }], rows: '/rows',
    rowActions: [{ action: 'show', label: 'Show' }, { action: 'pick', label: 'Pick its devices' }, { action: 'cancel', label: 'Cancel' }] }], { rows }));
  const cells = [...p.container.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')]);
  assert.equal(cells[0][1].textContent, 'Device BJ; Device BE; Device F; Device G; Device H +2');
  assert.equal(cells[0][1].title, rows[0].devices.join('; '), 'the whole list on hover');
  assert.equal(cells[1][1].textContent, 'Device A');
  assert.equal(cells[0][2].className, 'as-long', 'the note column keeps a reading width');
  assert.equal(cells[0][0].className, '', 'a short column does not');
  await p.unmount();
  const css = readFileSync(new URL('../src/a2ui-react.css', import.meta.url), 'utf8');
  assert.match(css, /\.bma-table td\.as-row-actions \{ white-space: normal;/, 'the row buttons wrap');
  assert.match(css, /\.bma-table td\.as-long \{ min-width: 18em; \}/);
});

test('a KeyValue item whose bound value is blank text is left out; one not there yet still reads as a dash', async () => {
  const p = await draw(envelope('k', [{ id: 'kv', component: 'KeyValue', items: [{ label: 'Zone', value: '/m/zone' }, { label: 'Cut', value: '/m/bounds' }, { label: 'Later', value: '/m/later' }] }], { m: { zone: 'Mountain time', bounds: '  ' } }));
  assert.deepEqual([...p.container.querySelectorAll('dt')].map(d => d.textContent), ['Zone', 'Later']);
  assert.deepEqual([...p.container.querySelectorAll('dd')].map(d => d.textContent), ['Mountain time', '—']);
  await p.unmount();
});

test('a hex layer\'s card names the columns its card shows under their titles; the select row keeps every column', async () => {
  const row = { id: 'm1', kind: 'meetup', hex: 'hx:225:10,20', d: 3, h: 21, when: 'Wednesday 21:00', score: 0.9, observedWeeks: 4, placeName: 'X1', peak: '' };
  const spec = { path: '/hexes', kind: 'meetup', hexes: { id: 'hex', value: 'score', size: 225, label: 'placeName', card: [{ key: 'when', title: 'When' }, { key: 'placeName', title: 'Place' }, { key: 'observedWeeks', title: 'Weeks met' }, { key: 'peak', title: 'Peak' }] } };
  const [layer] = ui.featureLayers([spec], p => (p === '/hexes' ? [row] : undefined), ['#123456'], ['#eeeeee', '#111111']);
  const [f] = layer.features;
  assert.deepEqual(Object.entries(f.properties), [['When', 'Wednesday 21:00'], ['Place', 'X1'], ['Weeks met', 4]], 'no D, H or ObservedWeeks; a blank column left out');
  assert.deepEqual(f.hex.row, row, 'the hex\'s row, which a click dispatches, keeps d and h');
  const [plain] = ui.featureLayers([{ ...spec, hexes: { id: 'hex', value: 'score' } }], p => (p === '/hexes' ? [row] : undefined), ['#123456'], ['#111111']);
  assert.equal(plain.features[0].properties.observedWeeks, 4, 'without card every column under its own name, as before');
});
