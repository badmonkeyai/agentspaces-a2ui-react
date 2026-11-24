// The page the GeoLayout's fit test draws in headless Chrome (geo-fit.test.mjs): a map surface (a GeoMap in the real
// Surfaces, so the surfaces' own wrappers are around it), two tall windows on the left, two on the right, one at the
// foot holding a wide table under a checkbox, and a free one kept at a place off a smaller screen. ?details=1 selects a
// feature, so the map opens its details window too. The map has a time slider and a draw control at its top; the free
// window is a watchbox over the map's pins, whose row flies the map to its pin. ?stats=1 gives the map a legend toggle
// (srad/agentspaces-geo.md GEO-M-14) whose layer chips start hidden.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import * as ui from '../../dist/index.js';

const pin = (id, label, lon, lat, at = '2026-11-12T09:14:03Z') => ({ type: 'Feature', id, kind: 'track.pin', label, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { note: 'a pin' }, style: {}, at, schemaVersion: 1 });
const pins = [pin('p1', 'First pin', -3.01, 53.41), pin('p2', 'Second pin', -3.02, 53.42, '2026-11-12T09:20:00Z')];
const more = [pin('p3', 'Third pin', -3.03, 53.43, '2026-11-12T09:30:00Z')];
const params = new URLSearchParams(location.search);
const envelopes = [
  { version: '1.0', createSurface: { surfaceId: 'map', catalogId: 'agentspaces-geo' } },
  { version: '1.0', updateComponents: { surfaceId: 'map', components: [{ id: 'root', component: 'Column', children: ['find', 'watch'] },
    { id: 'find', component: 'FeatureSearch', map: 'watch' },
    { id: 'watch', component: 'GeoMap', basemap: 'plain', timeSlider: true, draw: { action: 'fence', label: 'Draw an area' }, layers: [{ path: '/pins', label: 'Pins' }, { path: '/more', label: 'More pins' }],
      ...(params.get('stats') ? { legendToggle: { label: 'Stats', hidden: true } } : {}) }] } },
  { version: '1.0', updateDataModel: { surfaceId: 'map', path: '/', value: { pins, more,
    ...(params.get('details') ? { _geo: { watch: { selected: 'p1' } } } : {}) } } },
];
const rows = (n, what) => h('ul', { 'data-list': what }, Array.from({ length: n }, (_, i) => h('li', { key: i }, `${what} ${i}: a line long enough to wrap in a narrow window`)));
const table = h('table', { className: 'bma-table' },
  h('thead', null, h('tr', null, ['Name', 'State', 'What happened', 'Observations', 'Devices', 'When', ''].map(c => h('th', { key: c }, c)))),
  h('tbody', null, [0, 1, 2, 3].map(i => h('tr', { key: i }, ['a-rather-long-capture-name.json', 'replaying', 'Replaying in slices', '306', '87', '2026-11-19 01:18'].map((c, j) => h('td', { key: j, style: { whiteSpace: 'nowrap' } }, c)),
    h('td', null, h('button', { type: 'button', className: 'bma-btn', 'data-last': i === 3 ? '1' : undefined }, 'Replay'))))));
const bodies = {
  alerts: rows(60, 'Alert'), places: rows(40, 'Place'), ask: rows(30, 'Line'), patterns: rows(50, 'Pattern'),
  data: h('div', null, h('label', null, h('input', { type: 'checkbox', 'data-basis': '1' }), ' I may process these files'), rows(12, 'Note'), h('div', { style: { overflowX: 'auto' } }, table)),
  files: h(ui.Surfaces, { envelopes: [
    { version: '1.0', createSurface: { surfaceId: 'files', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'files', components: [{ id: 'root', component: 'Watchbox', path: '/pins', label: 'pins' }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'files', path: '/', value: { pins: [...pins, ...more] } } },
  ], mode: 'dark' }),
};
const windows = [
  { page: 'alerts', label: 'Alerts', open: true, dock: 'left' }, { page: 'places', label: 'Places', open: true, dock: 'left' },
  { page: 'ask', label: 'Ask', open: true, dock: 'right' }, { page: 'patterns', label: 'Patterns', open: true, dock: 'right' },
  { page: 'data', label: 'Data', open: true, dock: 'bottom' }, { page: 'files', label: 'Files', open: true, dock: 'free' },
];
localStorage.clear();
// a free window kept at a place on a larger screen, far off this one
localStorage.setItem('agentspaces-geo:windows:fit', JSON.stringify({ files: { open: true, folded: false, dock: 'free', x: 3000, y: 2400, w: 300, h: 260, z: 9 } }));
const render = id => (id === 'map' ? h(ui.Surfaces, { envelopes, mode: 'dark' }) : bodies[id]);
createRoot(document.getElementById('root')).render(
  h(ui.LookAndFeelProvider, { mode: 'dark' }, h('main', { className: 'bma-page' },
    h(ui.Pages, { surfaces: ['map', ...windows.map(w => w.page)], layout: { kind: 'geo', map: 'map', kicker: 'A kicker', windows }, title: 'A page that follows things', lede: 'A lede under the title.', persist: 'fit', render }))));
