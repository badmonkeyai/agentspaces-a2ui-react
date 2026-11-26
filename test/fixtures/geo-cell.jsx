// The page the cell-click fly test draws in headless Chrome (geo-fit.test.mjs, srad/agentspaces-geo.md GEO-D-08): a
// GeoLayout whose map holds routes in one city (where it fits first) and a place far off in another, and a window with a
// heatmap whose cells name that place in their focus column, so a click on a cell flies the map there.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import * as ui from '../../dist/index.js';

const AT = '2026-11-19T17:15:00Z';
const route = (who, lon, lat) => ({ type: 'Feature', id: 'r-' + who, kind: 'track.route', label: who, geometry: { type: 'LineString', coordinates: [[lon, lat], [lon + 0.02, lat + 0.015]] }, properties: { who }, style: {}, at: AT, schemaVersion: 1 });
const place = { type: 'Feature', id: 'pl-far', kind: 'place', label: 'Far place', geometry: { type: 'Point', coordinates: [-104.99, 39.74] }, properties: {}, style: {}, at: AT, schemaVersion: 1 };
const cells = ['08', '09', '10'].flatMap((x, i) => ['Mon', 'Tue'].map(y => ({ x, y, p: 0.2 + 0.2 * i, place: 'pl-far' })));
const surfaces = {
  map: [{ version: '1.0', createSurface: { surfaceId: 'map', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'map', components: [{ id: 'root', component: 'Column', children: ['watch'] },
      { id: 'watch', component: 'GeoMap', basemap: 'plain', layers: [{ path: '/routes', label: 'Routes' }, { path: '/places', label: 'Places' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'map', path: '/', value: { routes: [route('A', -122.43, 37.76), route('B', -122.41, 37.78)], places: [place] } } }],
  week: [{ version: '1.0', createSurface: { surfaceId: 'week', catalogId: 'agentspaces-viz' } },
    { version: '1.0', updateComponents: { surfaceId: 'week', components: [{ id: 'root', component: 'Visualize', rows: '/cells', mark: 'heatmap', x: 'x', row: 'y', y: 'p', title: 'A week', focus: 'place' }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'week', path: '/', value: { cells } } }],
};
const windows = [{ page: 'week', label: 'Week', open: true, dock: 'left' }];
localStorage.clear();
createRoot(document.getElementById('root')).render(h(ui.LookAndFeelProvider, { mode: 'dark' }, h('main', { className: 'bma-page' },
  h(ui.Pages, { surfaces: ['map', 'week'], layout: { kind: 'geo', map: 'map', kicker: 'Cells', windows }, title: 'A grid that flies', persist: 'cells',
    render: id => h(ui.Surfaces, { envelopes: surfaces[id], mode: 'dark' }) }))));
