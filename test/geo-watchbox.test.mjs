// agentspaces-geo/Watchbox (srad/agentspaces-geo.md GEO-W-01 to W-06): newest first with the severity as a ring and a
// word, the kind, the age and the property line; an arrival highlighted, or counted in a pill when the person scrolled;
// a row selects its feature on the map (its own surface's, or the GeoLayout's from another window); an area listed,
// drawn and entered; row actions; the empty and stopped feeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, click, React, ui } from './setup.mjs';

const now = Date.now();
const iso = ms => new Date(now - ms).toISOString();
const pt = (id, kind, lon, lat, more = {}) => ({ type: 'Feature', id, kind, label: id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {}, style: {}, at: iso(60_000), ...more });
const incidents = [
  pt('inc7', 'incident.collision', -3.02, 53.41, { label: 'Near miss off Seacombe', severity: 'serious', at: iso(120_000), properties: { note: 'two ferries, 40 m' } }),
  pt('inc8', 'incident.pollution', -3.04, 53.44, { label: 'Oil sheen', severity: 'warning', at: iso(600_000), properties: { note: 'light, drifting north' } }),
  pt('ship1', 'track.ship', -3.0, 53.4),
];
const berth = { type: 'Feature', id: 'berth4', kind: 'area.berth', label: 'Berth 4', at: iso(0), properties: {}, style: {},
  geometry: { type: 'Polygon', coordinates: [[[-3.035, 53.395], [-2.995, 53.395], [-2.995, 53.42], [-3.035, 53.42], [-3.035, 53.395]]] } };

test('the rows: newest first, the graver first on a tie; the area; the property line; a stopped feed', () => {
  const fs = [pt('a', 'k', 0, 0, { at: iso(1000), severity: 'info' }), pt('b', 'k', 0, 0, { at: iso(1000), severity: 'critical' }), pt('c', 'k', 0, 0, { at: iso(10) })].map(ui.featureOf);
  assert.deepEqual(ui.watchRows(fs).map(f => f.id), ['c', 'b', 'a']);
  assert.deepEqual(ui.watchRows(fs, 2).map(f => f.id), ['c', 'b']);
  const box = ui.areaOf([-3.1, 53.35, -2.9, 53.5]);
  assert.ok(ui.inArea(ui.featureOf(incidents[0]), box));
  assert.ok(!ui.inArea(ui.featureOf(pt('far', 'k', 2.35, 48.85)), box));
  const poly = ui.areaOf(undefined, ui.featureOf(berth));
  assert.equal(poly.label, 'Berth 4');
  assert.ok(ui.inArea(ui.featureOf(incidents[0]), poly) && !ui.inArea(ui.featureOf(incidents[1]), poly));
  assert.equal(ui.propertyLine(ui.featureOf(incidents[0]), ['note', 'missing']), 'note two ferries, 40 m');
  assert.equal(ui.staleText(now - 50_000, 30, now), '');
  assert.equal(ui.staleText(now - 180_000, 30, now), 'The feed stopped: nothing new for 3 min.');
  assert.equal(ui.staleText(now - 180_000, undefined, now), '', 'no interval, no verdict');
});

/** A geo page whose envelopes grow; push(path, value) feeds one path. */
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
const map = { id: 'harbour', component: 'GeoMap', layers: [{ path: '/incidents', label: 'Incidents' }] };
const rowIds = c => [...c.querySelectorAll('.as-watchbox-row')].map(r => r.dataset.feature);

test('a watchbox lists newest first with the severity as a ring and a word, and a row selects on its map', async () => {
  const p = await page([{ id: 'alerts', component: 'Watchbox', path: '/incidents', kind: 'incident*', fields: ['note'], map: 'harbour',
    actions: [{ name: 'acknowledge', label: 'Acknowledge' }] }, map], { incidents });
  assert.deepEqual(rowIds(p.container), ['inc7', 'inc8'], 'the kind filter, newest first');
  const first = p.container.querySelector('.as-watchbox-row');
  assert.ok(first.querySelector('.as-sev-serious .ring') && first.textContent.includes('serious'), 'a ring and a word');
  assert.ok(first.textContent.includes('Near miss off Seacombe') && first.textContent.includes('incident.collision') && first.textContent.includes('note two ferries, 40 m'));
  assert.ok(first.textContent.includes('2 min ago'));
  await click(first.querySelector('.as-watchbox-pick'));
  assert.equal(p.container.querySelector('[data-component="GeoMap"]').dataset.selected, 'inc7', 'the row selected its feature on the map');
  await click([...first.querySelectorAll('button')].find(b => b.textContent === 'Acknowledge'));
  assert.equal(p.actions.at(-1).name, 'acknowledge');
  assert.deepEqual(p.actions.at(-1).context, { id: 'inc7', kind: 'incident.collision' });
  await p.unmount();
});

test('an arrival is highlighted at the top, or counted in a pill when the person has scrolled down', async () => {
  const p = await page([{ id: 'alerts', component: 'Watchbox', path: '/incidents', kind: 'incident*' }], { incidents });
  await p.push('/incidents', [...incidents, pt('inc9', 'incident.fire', -3.01, 53.405, { label: 'Smoke on pier', severity: 'critical', at: iso(0) })]);
  assert.deepEqual(rowIds(p.container)[0], 'inc9');
  assert.ok(p.container.querySelector('[data-feature="inc9"]').classList.contains('arrived'), 'highlighted');
  assert.ok(!p.container.querySelector('[data-feature="inc7"]').classList.contains('arrived'));
  p.container.querySelector('.as-watchbox-list').scrollTop = 120;
  await p.push('/incidents', [...incidents, pt('inc9', 'incident.fire', -3.01, 53.405, { at: iso(0) }), pt('inc10', 'incident.fire', -3.0, 53.4, { at: iso(0) }), pt('inc11', 'incident.fire', -3.0, 53.4, { at: iso(0) })]);
  const pill = [...p.container.querySelectorAll('button')].find(b => b.textContent === '2 new');
  assert.ok(pill, 'a pill says how many are new: ' + p.text().slice(0, 200));
  await click(pill);
  assert.equal([...p.container.querySelectorAll('button')].find(b => b.textContent === '2 new'), undefined);
  await p.unmount();
});

test('an area: the features inside it, and an arrival inside it marked as an entry', async () => {
  const p = await page([{ id: 'berthWatch', component: 'Watchbox', path: '/incidents', areaFeature: 'berth4', areaPath: '/berths', label: 'anything at Berth 4' }],
    { incidents, berths: [berth] });
  assert.ok(p.text().includes('Watching Berth 4: 2 inside.'), p.text());
  assert.deepEqual(rowIds(p.container), ['ship1', 'inc7'], 'the features inside the berth, newest first');
  await p.push('/incidents', [incidents[0], { ...incidents[1], geometry: { type: 'Point', coordinates: [-3.01, 53.41] } }, incidents[2]]);
  assert.ok(rowIds(p.container).includes('inc8'), 'the oil sheen drifted in');
  assert.ok(p.container.querySelector('[data-feature="inc8"] .as-watchbox-entry'), 'marked as an entry');
  assert.equal(p.container.querySelector('[data-feature="inc7"] .as-watchbox-entry'), null, 'one that was inside from the start is not');
  await p.unmount();
});

test('an empty watchbox says what it waits for', async () => {
  const p = await page([{ id: 'w', component: 'Watchbox', path: '/incidents', kind: 'incident*' }], { incidents: [] });
  assert.ok(p.text().includes('Nothing yet. Waiting for incident.'), p.text());
  const empty = p.container.querySelector('.as-watchbox .as-empty.as-watchbox-empty');
  assert.ok(empty, 'an empty state: a glyph, a heading and the sentence');
  assert.equal(empty.querySelector('p').textContent, 'Nothing yet. Waiting for incident.');
  assert.equal(empty.querySelector('.glyph').getAttribute('aria-hidden'), 'true');
  // an empty list: a path with nothing at all is still loading (test/states.test.mjs)
  const q = await page([{ id: 'w', component: 'Watchbox', path: '/x', label: 'ships' }], { x: [] }, 'other');
  assert.ok(q.text().includes('Nothing yet. Waiting for ships.'));
  await p.unmount(); await q.unmount();
});

test('in a GeoLayout a watchbox in a window selects on the layout\'s map and draws its area there', async () => {
  localStorage.clear();
  const env = (id, catalogId, components, value) => [
    { version: '1.0', createSurface: { surfaceId: id, catalogId } },
    { version: '1.0', updateComponents: { surfaceId: id, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId: id, path: '/', value } },
  ];
  const surfaces = {
    watch: env('watch', 'agentspaces-geo', [map], { incidents }),
    alerts: env('alerts', 'agentspaces-geo', [{ id: 'box', component: 'Watchbox', path: '/incidents', kind: 'incident*', area: [-3.1, 53.35, -2.9, 53.5] }], { incidents }),
  };
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'alerts'], render: id => React.createElement(ui.Surfaces, { envelopes: surfaces[id] }),
    layout: { kind: 'geo', map: 'watch', windows: [{ page: 'alerts', label: 'Alerts', open: true, dock: 'left' }] }, title: 'Harbour', persist: 'watchbox-1' }));
  const geomap = container.querySelector('.as-geo-map [data-component="GeoMap"]');
  assert.equal(geomap.dataset.watched, '1', 'the area is drawn on the layout\'s map');
  await click(container.querySelector('[data-window="alerts"] [data-feature="inc8"] .as-watchbox-pick'));
  assert.equal(geomap.dataset.selected, 'inc8', 'the window\'s row selected on the map');
  assert.ok(container.querySelector('.as-geo-details [data-window="details"]'), 'and the map opened its card');
  await unmount();
});

test('in a GeoLayout a row action in a window reaches the page\'s action handler with the feature', async () => {
  localStorage.clear();
  const env = (id, catalogId, components, value) => [
    { version: '1.0', createSurface: { surfaceId: id, catalogId } },
    { version: '1.0', updateComponents: { surfaceId: id, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId: id, path: '/', value } },
  ];
  const surfaces = {
    watch: env('watch', 'agentspaces-geo', [map], { incidents }),
    alerts: env('alerts', 'agentspaces-geo', [{ id: 'box', component: 'Watchbox', path: '/incidents', kind: 'incident*', map: 'harbour',
      actions: [{ name: 'acknowledge', label: 'Acknowledge' }] }], { incidents }),
  };
  const acted = [];
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'alerts'],
    render: id => React.createElement(ui.Surfaces, { envelopes: surfaces[id], onAction: a => acted.push({ surface: id, ...a }) }),
    layout: { kind: 'geo', map: 'watch', windows: [{ page: 'alerts', label: 'Alerts', open: true, dock: 'left' }] }, title: 'Harbour', persist: 'watchbox-2' }));
  try {
  // a row selected first, as a person does: the map opens its card, and the row's action still goes out
  await click(container.querySelector('[data-window="alerts"] [data-feature="inc8"] .as-watchbox-pick'));
  const ack = [...container.querySelectorAll('[data-window="alerts"] [data-feature="inc8"] button')].find(b => b.textContent.trim() === 'Acknowledge');
  assert.ok(ack, 'the row has its action');
  await click(ack);
  assert.equal(acted.length, 1, 'one action: ' + JSON.stringify(acted));
  assert.equal(acted[0].surface, 'alerts');
  assert.equal(acted[0].name, 'acknowledge');
  assert.deepEqual(acted[0].context, { id: 'inc8', kind: 'incident.pollution' });
  } finally { await unmount(); }
});

test('a feature that left the data and comes back is announced again as an arrival', async () => {
  const p = await page([{ id: 'alerts', component: 'Watchbox', path: '/incidents', kind: 'incident*' }], { incidents });
  await p.push('/incidents', [incidents[1], incidents[2]]);
  assert.deepEqual(rowIds(p.container), ['inc8'], 'its lease ended');
  await p.push('/incidents', incidents);
  assert.deepEqual(rowIds(p.container), ['inc7', 'inc8']);
  assert.ok(p.container.querySelector('[data-feature="inc7"]').classList.contains('arrived'), 'back, and highlighted as new');
  assert.ok(!p.container.querySelector('[data-feature="inc8"]').classList.contains('arrived'), 'one that stayed is not');
  await p.unmount();
});

test('a done row is calmer, says its done value on the meta line, and keeps only the actions done.keep names', async () => {
  const rows = [
    pt('a1', 'alert.follower', -3.02, 53.41, { label: 'A tag was heard at four of your places over six hours, from the depot to the quay', severity: 'serious', at: iso(30_000),
      properties: { note: 'four places', acknowledged: 'by dana' } }),
    pt('a2', 'alert.follower', -3.03, 53.42, { label: 'A tag was heard at four of your places over six hours, from the depot to the marina', severity: 'warning', at: iso(60_000),
      properties: { note: 'four places' } }),
    pt('a3', 'alert.follower', -3.04, 53.43, { label: 'Seen once', severity: 'info', at: iso(90_000), properties: { acknowledged: true } }),
  ];
  const actions = [{ name: 'ack', label: 'Acknowledge' }, { name: 'send', label: 'Send on' }];
  const p = await page([{ id: 'alerts', component: 'Watchbox', path: '/alerts', fields: ['note', 'acknowledged'], actions, done: { field: 'acknowledged', keep: ['send'] } }], { alerts: rows });
  const row = id => p.container.querySelector(`[data-feature="${id}"]`);
  const buttons = id => [...row(id).querySelectorAll('.as-watchbox-actions button')].map(b => b.textContent);
  assert.ok(row('a1').classList.contains('done') && row('a1').dataset.done === 'true', 'the acknowledged row is done');
  assert.ok(!row('a2').classList.contains('done') && row('a2').dataset.done === undefined, 'the other is not');
  assert.deepEqual(buttons('a1'), ['Send on'], 'a done row keeps only the actions keep names');
  assert.deepEqual(buttons('a2'), ['Acknowledge', 'Send on'], 'an open row keeps them all');
  const meta = row('a1').querySelector('.line2 .meta').textContent;
  assert.ok(meta.startsWith('acknowledged by dana · alert.follower'), 'the done value leads the meta line: ' + meta);
  assert.equal(meta.split('acknowledged').length - 1, 1, 'and is not said twice by the property line: ' + meta);
  assert.ok(meta.includes('note four places'));
  assert.equal(row('a3').querySelector('.done-text').textContent, 'acknowledged', 'a true value says the field alone');
  assert.ok(row('a1').querySelector('.as-sev-serious .ring'), 'the severity still shows, as a ring and a word');
  // the two long titles read apart: each row carries its whole label, in its title and as its accessible name
  for (const id of ['a1', 'a2']) {
    const pick = row(id).querySelector('.as-watchbox-pick');
    const label = rows.find(r => r.id === id).label;
    assert.equal(pick.getAttribute('title'), label);
    assert.equal(pick.querySelector('.label').textContent, label);
  }
  // the age sits on the meta line, so it takes none of the title's width
  assert.equal(row('a2').querySelector('.line1 .age'), null);
  assert.equal(row('a2').querySelector('.line2 .age').textContent, '1 min ago');
  // a done spec with no keep leaves a done row no actions; no done spec leaves every row as it was
  const q = await page([{ id: 'alerts', component: 'Watchbox', path: '/alerts', actions, done: { field: 'acknowledged' } }], { alerts: rows }, 'second');
  assert.equal(q.container.querySelector('[data-feature="a1"] .as-watchbox-actions'), null);
  assert.equal(q.container.querySelectorAll('[data-feature="a2"] .as-watchbox-actions button').length, 2);
  const r = await page([{ id: 'alerts', component: 'Watchbox', path: '/alerts', actions }], { alerts: rows }, 'third');
  assert.equal(r.container.querySelectorAll('.as-watchbox-row.done').length, 0);
  assert.equal(r.container.querySelectorAll('[data-feature="a1"] .as-watchbox-actions button').length, 2);
  // a row acknowledged while shown turns done in place
  await r.unmount();
  await p.push('/alerts', [rows[0], { ...rows[1], properties: { ...rows[1].properties, acknowledged: 'by dana' } }, rows[2]]);
  assert.ok(row('a2').classList.contains('done'));
  assert.deepEqual(buttons('a2'), ['Send on']);
  await p.unmount(); await q.unmount();
});

test('done, as the helpers read it: true, a non-empty string or a non-zero number', () => {
  const f = v => ui.featureOf(pt('x', 'k', 0, 0, { properties: { ack: v } }));
  const spec = { field: 'ack', keep: new Set() };
  assert.deepEqual([true, 'yes', 3, false, '', ' ', 0, null, undefined, 'by dana'].map(v => ui.isWatchboxDone(f(v), spec)),
    [true, true, true, false, false, false, false, false, false, true]);
  assert.equal(ui.isWatchboxDone(f(true), undefined), false);
});

test('an empty watchbox says the design\'s own words when it gives them', async () => {
  const p = await page([{ id: 'w', component: 'Watchbox', path: '/areas', kind: 'area*', label: 'areas', emptyText: 'No area yet. Draw one with Draw an area.' }], { areas: [] });
  const empty = p.container.querySelector('.as-watchbox-empty');
  assert.equal(empty.querySelector('p').textContent, 'No area yet. Draw one with Draw an area.');
  assert.equal(empty.querySelector('b'), null, 'no "All quiet" heading over it');
  assert.ok(!p.text().includes('All quiet') && !p.text().includes('Waiting for'));
  await p.push('/areas', [pt('z1', 'area.zone', 0, 0, { label: 'Zone 1' })]);
  assert.deepEqual(rowIds(p.container), ['z1'], 'and lists what comes');
  await p.unmount();
});
