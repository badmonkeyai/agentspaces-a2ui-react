// The page the hexagon-click test draws in headless Chrome (geo-fit.test.mjs, srad/agentspaces-geo.md GEO-M-11): a
// GeoMap whose home is one hexagon that three hex layers draw (an activity layer under a gathering layer under a meetup
// layer, as an overlay of where devices meet stacks them), each a row of its own, and a select action the page records
// in window.__actions, so a real click on the hexagon says which layer's row it dispatched.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import * as ui from '../../dist/index.js';

const [LAT, LON] = [39.776, -104.976];
const HEX = ui.hexOf(LAT, LON, ui.HEX_R9);
const [hlat, hlon] = ui.hexCenter(HEX);
const row = (kind, d, h) => ({ id: kind + '-' + HEX, kind, hex: HEX, d, h, score: 0.9, placeName: 'The yard' });
const layer = (path, kind, label) => ({ path, kind, label, hexes: { id: 'hex', value: 'score', size: ui.HEX_R9, label: 'placeName' } });
window.__hex = HEX;
window.__actions = [];
const surfaces = {
  map: [{ version: '1.0', createSurface: { surfaceId: 'map', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'map', components: [{ id: 'root', component: 'Column', children: ['watch'] },
      { id: 'watch', component: 'GeoMap', basemap: 'plain', home: { center: [hlon, hlat], zoom: 15 }, selectAction: 'hex.select',
        layers: [layer('/activity', 'activity', 'Activity'), layer('/gatherings', 'gathering', 'Gatherings'), layer('/meetups', 'meetup', 'Meetups')] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'map', path: '/', value: { activity: [row('activity', -1, 21)], gatherings: [row('gathering', 3, 21)], meetups: [row('meetup', 3, 21)] } } }],
};
localStorage.clear();
createRoot(document.getElementById('root')).render(h(ui.LookAndFeelProvider, { mode: 'dark' }, h('main', { className: 'bma-page' },
  h(ui.Surfaces, { envelopes: surfaces.map, mode: 'dark', onAction: a => window.__actions.push(a) }))));
