// The page the map's jump-back test draws in headless Chrome (geo-fit.test.mjs): a GeoLayout whose map holds routes in
// one city (a pick layer keyed by "who", fitted) and an alert in another, a select table of the people in one window and
// a watchbox over the alerts in another, whose row flies the map to its alert. window.__push(surface, path, value) feeds
// a surface's data model, as a changing feed does, so the test can take a picked key out of the table's rows.
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as ui from '../../dist/index.js';

const AT = '2026-11-19T17:15:00Z';
const route = (who, lon, lat) => ({ type: 'Feature', id: 'r-' + who, kind: 'track.route', label: who, geometry: { type: 'LineString', coordinates: [[lon, lat], [lon + 0.02, lat + 0.015]] }, properties: { who }, style: {}, at: AT, schemaVersion: 1 });
// the first city's routes, and an alert far off in the second
const routes = [route('A', -122.43, 37.76), route('B', -122.41, 37.78), route('C', -122.45, 37.74)];
const alert = { type: 'Feature', id: 'al1', kind: 'alert.near', label: 'Far alert', geometry: { type: 'Point', coordinates: [-104.99, 39.74] }, properties: {}, style: {}, at: AT, schemaVersion: 1 };
const people = [{ who: 'A' }, { who: 'B' }, { who: 'C' }];
const start = {
  map: [{ version: '1.0', createSurface: { surfaceId: 'map', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'map', components: [{ id: 'root', component: 'Column', children: ['watch'] },
      { id: 'watch', component: 'GeoMap', basemap: 'plain', layers: [{ path: '/routes', label: 'Routes', pick: { by: 'who', show: 'picked', fit: true } }, { path: '/alerts', label: 'Alerts' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'map', path: '/', value: { routes, alerts: [alert] } } }],
  list: [{ version: '1.0', createSurface: { surfaceId: 'list', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'list', components: [{ id: 'root', component: 'Column', children: ['list'] },
      { id: 'list', component: 'DataTable', columns: [{ key: 'who', title: 'Who' }], rows: '/people', select: { key: 'who' } }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'list', path: '/', value: { people } } }],
  alerts: [{ version: '1.0', createSurface: { surfaceId: 'alerts', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'alerts', components: [{ id: 'root', component: 'Watchbox', path: '/alerts', label: 'alerts' }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'alerts', path: '/', value: { alerts: [alert] } } }],
};
const windows = [{ page: 'list', label: 'People', open: true, dock: 'left' }, { page: 'alerts', label: 'Alerts', open: true, dock: 'left' }];
localStorage.clear();
function Host() {
  const [env, setEnv] = useState(start);
  window.__push = (surfaceId, path, value) => setEnv(e => ({ ...e, [surfaceId]: [...e[surfaceId], { version: '1.0', updateDataModel: { surfaceId, path, value } }] }));
  return h(ui.Pages, { surfaces: ['map', 'list', 'alerts'], layout: { kind: 'geo', map: 'map', kicker: 'Jump', windows }, title: 'A map that stays', persist: 'jump',
    render: id => h(ui.Surfaces, { envelopes: env[id], mode: 'dark' }) });
}
createRoot(document.getElementById('root')).render(h(ui.LookAndFeelProvider, { mode: 'dark' }, h('main', { className: 'bma-page' }, h(Host))));
