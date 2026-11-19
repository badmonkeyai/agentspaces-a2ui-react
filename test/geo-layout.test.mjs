// The GeoLayout (srad/agentspaces-geo.md §3.3, GEO-L-01 to L-08): a bar with the title, the search and the windows as
// menu items; the map under it; each window a card that drags, resizes (at least 240 x 160), folds, closes, raises on a
// click, docks (two on a side stack, a drag frees one), and is kept per app in the browser; F6 between the regions;
// sheets below 900 px; the map's search in the bar and its selection's details as a window of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, key, click, React, ui } from './setup.mjs';

const render = id => React.createElement('p', { 'data-surface': id }, 'surface ' + id);
const windows = [
  { page: 'ask', label: 'Ask', icon: 'chat', open: true, dock: 'left' },
  { page: 'incidents', label: 'Incidents', open: true, dock: 'left' },
  { page: 'files', label: 'Files', dock: 'right' },
  { page: 'spend', label: 'Spend', dock: 'free' },
];
const layout = { kind: 'geo', map: 'watch', windows };
const win = (c, page) => c.querySelector(`[data-window="${page}"]`);
const menu = (c, label) => [...c.querySelectorAll('.as-geo-menu-item')].find(b => b.textContent.includes(label));
const pointer = async (el, type, x, y) => {
  await React.act(async () => { el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 })); });
};
const drag = async (el, from, to) => { await pointer(el, 'pointerdown', ...from); await pointer(el, 'pointermove', ...to); await pointer(el, 'pointerup', ...to); };

test('the bar, the map, and the windows the layout opens; the menu opens and closes them', async () => {
  localStorage.clear();
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents', 'files', 'spend', 'extra'], render, layout, title: 'Harbour watch', lede: 'Ships in the Mersey.', persist: 'harbour-1' }));
  const bar = container.querySelector('.as-geo-bar');
  assert.ok(bar.textContent.includes('Harbour watch') && bar.textContent.includes('Ships in the Mersey.'));
  assert.deepEqual([...container.querySelectorAll('.as-geo-menu-item')].map(b => [b.textContent, b.getAttribute('aria-pressed')]),
    [['Ask', 'true'], ['Incidents', 'true'], ['Files', 'false'], ['Spend', 'false']]);
  assert.ok(container.querySelector('.as-geo-map [data-surface="watch"]'), 'the map\'s surface under the bar');
  assert.equal(win(container, 'ask').hidden, false);
  assert.equal(win(container, 'files').hidden, true);
  assert.ok(win(container, 'files').querySelector('[data-surface="files"]'), 'a closed window stays mounted');
  assert.ok(container.querySelector('.as-geo-rest [data-surface="extra"]'), 'a surface the layout does not name stays mounted');
  await click(menu(container, 'Files'));
  assert.equal(win(container, 'files').hidden, false);
  assert.equal(menu(container, 'Files').getAttribute('aria-pressed'), 'true');
  await click(win(container, 'files').querySelector('[aria-label="close Files"]'));
  assert.equal(win(container, 'files').hidden, true, 'closed from its header');
  assert.equal(menu(container, 'Files').getAttribute('aria-pressed'), 'false');
  await unmount();
});

test('two windows docked on one side stack; a drag frees a window and is kept', async () => {
  localStorage.clear();
  const first = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents'], render, layout, persist: 'harbour-2' }));
  const ask = win(first.container, 'ask'), incidents = win(first.container, 'incidents');
  assert.equal(ask.style.left, incidents.style.left, 'the left column');
  assert.ok(parseFloat(incidents.style.top) > parseFloat(ask.style.top) + 100, `stacked: ${ask.style.top} then ${incidents.style.top}`);
  await drag(ask.querySelector('.as-geo-window-head'), [100, 100], [400, 250]);
  assert.equal(ask.dataset.dock, 'free');
  assert.equal(ask.style.left, '308px');
  assert.equal(ask.style.top, '158px');
  const kept = JSON.parse(localStorage.getItem('agentspaces-geo:windows:harbour-2'));
  assert.deepEqual([kept.ask.x, kept.ask.y, kept.ask.dock], [308, 158, 'free']);
  await first.unmount();
  const again = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents'], render, layout, persist: 'harbour-2' }));
  assert.equal(win(again.container, 'ask').style.left, '308px', 'restored on reload');
  assert.equal(win(again.container, 'incidents').style.top, '8px', 'the other left window takes the top of the column');
  await again.unmount();
});

test('a window resizes from its corner, no smaller than 240 by 160, folds to its header, and raises on a click', async () => {
  localStorage.clear();
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents'], render, layout, persist: 'harbour-3' }));
  const ask = win(container, 'ask');
  await drag(ask.querySelector('.as-geo-window-size'), [500, 500], [50, 50]);
  assert.equal(ask.style.width, '240px');
  assert.equal(ask.style.height, '160px');
  await drag(ask.querySelector('.as-geo-window-size'), [500, 500], [620, 560]);
  assert.equal(ask.style.width, '360px');
  assert.equal(ask.dataset.dock, 'left', 'a resize keeps the dock');
  await click(ask.querySelector('[aria-label="fold Ask"]'));
  assert.ok(ask.classList.contains('folded'));
  assert.equal(ask.querySelector('.as-geo-window-body').hidden, true);
  assert.ok(ask.querySelector('[data-surface="ask"]'), 'a folded window keeps its surface');
  await click(ask.querySelector('[aria-label="unfold Ask"]'));
  const incidents = win(container, 'incidents');
  const before = Number(incidents.style.zIndex);
  await pointer(incidents, 'pointerdown', 10, 10);
  assert.ok(Number(incidents.style.zIndex) > Number(ask.style.zIndex) && Number(incidents.style.zIndex) > before, 'raised');
  await unmount();
});

test('F6 moves between the bar, the map and each open window, topmost first', async () => {
  localStorage.clear();
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents'], render, layout, persist: 'harbour-4' }));
  const order = [];
  for (let i = 0; i < 5; i++) {
    await key(document.activeElement ?? document.body, 'F6');
    const a = document.activeElement;
    order.push(a.classList.contains('as-geo-bar') ? 'bar' : a.classList.contains('as-geo-map') ? 'map' : a.dataset.window);
  }
  assert.deepEqual(order, ['bar', 'map', 'incidents', 'ask', 'bar']);
  await key(document.activeElement, 'F6', { shiftKey: true });
  assert.equal(document.activeElement.dataset.window, 'ask', 'Shift+F6 goes back');
  for (const b of container.querySelectorAll('.as-geo-window button')) assert.ok(b.getAttribute('aria-label'), 'every window control has a name');
  await unmount();
});

test('below 900 px the windows are sheets, one at a time', async () => {
  localStorage.clear();
  const wide = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  try {
    const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents', 'files'], render, layout, persist: 'harbour-5' }));
    assert.ok(container.querySelector('.as-geo-layout.narrow'));
    const open = () => [...container.querySelectorAll('.as-geo-window.sheet:not([hidden])')].map(w => w.dataset.window);
    assert.equal(open().length, 1, 'one sheet: ' + open());
    await click(menu(container, 'Files'));
    assert.deepEqual(open(), ['files'], 'the one opened last');
    await unmount();
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: wide, configurable: true });
  }
});

test('a window\'s place: docked sizes and the stacked columns', () => {
  const stage = { width: 1200, height: 800 };
  assert.deepEqual(ui.dockedSize('left', stage), { w: 360, h: 392 });
  assert.deepEqual(ui.dockedSize('left', { width: 500, height: 200 }), { w: 240, h: 160 }, 'never below the least');
  // windows the person resized (sized) keep their heights and stack
  const s = (dock, h = 300) => ({ open: true, folded: false, dock, x: 0, y: 0, w: 360, h, z: 1, sized: true });
  const placed = ui.placeDocked(['a', 'b', 'c', 'd'], { a: s('right'), b: s('right', 200), c: s('bottom'), d: { ...s('left'), open: false } }, stage);
  assert.deepEqual(placed.a, { x: 832, y: 8, h: 300 });
  assert.deepEqual(placed.b, { x: 832, y: 316, h: 200 });
  assert.deepEqual(placed.c, { x: 8, y: 492, h: 300 });
  assert.equal(placed.d, undefined, 'a closed window has no place');
  // a left window resized wider (it keeps its dock): the bottom row starts after it, never over it
  const wide = ui.placeDocked(['l', 'b'], { l: { ...s('left'), w: 600 }, b: s('bottom') }, stage);
  assert.deepEqual(wide.b, { x: 616, y: 492, h: 300 });
});

test('a docked window no one resized shares its column\'s height', () => {
  const stage = { width: 1200, height: 800 };
  const s = (dock, more = {}) => ({ open: true, folded: false, dock, x: 0, y: 0, w: 360, h: 392, z: 1, ...more });
  assert.deepEqual(ui.placeDocked(['l'], { l: s('left') }, stage).l, { x: 8, y: 8, h: 784 }, 'alone on its side, the stage\'s height');
  const two = ui.placeDocked(['r1', 'r2'], { r1: s('right'), r2: s('right') }, stage);
  assert.deepEqual([two.r1, two.r2], [{ x: 832, y: 8, h: 388 }, { x: 832, y: 404, h: 388 }], 'two share it');
  const kept = ui.placeDocked(['r1', 'r2'], { r1: s('right', { sized: true, h: 200 }), r2: s('right') }, stage);
  assert.deepEqual([kept.r1, kept.r2], [{ x: 832, y: 8, h: 200 }, { x: 832, y: 216, h: 576 }], 'a resized one keeps its height, the other takes the rest');
  const folded = ui.placeDocked(['r1', 'r2'], { r1: s('right', { folded: true }), r2: s('right') }, stage);
  assert.deepEqual(folded.r2, { x: 832, y: 52, h: 740 }, 'a folded one takes its header only');
  // the bottom row reaches under the right column: the column stops above it; the left column runs past it
  const row = ui.placeDocked(['l', 'r', 'b'], { l: s('left'), r: s('right'), b: s('bottom', { w: 560, h: 300 }) }, stage);
  assert.deepEqual(row.b, { x: 376, y: 492, h: 300 });
  assert.deepEqual(row.r, { x: 832, y: 8, h: 476 });
  assert.deepEqual(row.l, { x: 8, y: 8, h: 784 });
});

test('in a GeoLayout the map\'s search draws in the bar, and a selection opens its details as a window that Escape closes', async () => {
  localStorage.clear();
  const ship = { type: 'Feature', id: 'ship217', kind: 'track.ship.cargo', label: 'MV Northgate', geometry: { type: 'Point', coordinates: [-3.0123, 53.4087] }, properties: { mmsi: '235012345' }, style: {}, at: '2026-11-12T09:14:03Z' };
  const envelopes = [
    { version: '1.0', createSurface: { surfaceId: 'watch', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'watch', components: [{ id: 'root', component: 'Column', children: ['find', 'harbour'] },
      { id: 'find', component: 'FeatureSearch', map: 'harbour' }, { id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'watch', path: '/', value: { ships: [ship] } } },
  ];
  const surface = id => (id === 'watch' ? React.createElement(ui.Surfaces, { envelopes }) : render(id));
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask'], render: surface, layout: { kind: 'geo', map: 'watch', windows: [{ page: 'ask', label: 'Ask', open: true }] }, title: 'Harbour', persist: 'harbour-6' }));
  assert.ok(container.querySelector('.as-geo-bar .as-feature-search input'), 'the search is in the bar');
  assert.equal(container.querySelector('.as-geo-map .as-feature-search'), null, 'and not on the map');
  const row = [...container.querySelectorAll('.as-geo-map button')].find(b => b.textContent === 'MV Northgate');
  await click(row);
  const details = container.querySelector('.as-geo-details [data-window="details"]');
  assert.ok(details, 'the details window opened');
  assert.ok(details.textContent.includes('235012345') && details.querySelector('[aria-label="close MV Northgate"]'));
  await key(document.body, 'Escape');
  assert.equal(container.querySelector('.as-geo-details [data-window="details"]'), null, 'Escape closed it');
  await unmount();
});

test('the details window keeps its own place when another window moves, and raises in one order with the others', async () => {
  localStorage.clear();
  // a layout window raised many times over the days: its z is far past the details window's first one
  localStorage.setItem('agentspaces-geo:windows:harbour-7', JSON.stringify({ ask: { open: true, folded: false, dock: 'left', x: 120, y: 80, w: 360, h: 392, z: 100 } }));
  const ship = { type: 'Feature', id: 'ship217', kind: 'track.ship.cargo', label: 'MV Northgate', geometry: { type: 'Point', coordinates: [-3.0123, 53.4087] }, properties: {}, style: {}, at: '2026-11-12T09:14:03Z' };
  const envelopes = [
    { version: '1.0', createSurface: { surfaceId: 'watch', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'watch', components: [{ id: 'root', component: 'Column', children: ['harbour'] }, { id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'watch', path: '/', value: { ships: [ship] } } },
  ];
  const surface = id => (id === 'watch' ? React.createElement(ui.Surfaces, { envelopes }) : render(id));
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask'], render: surface, layout: { kind: 'geo', map: 'watch', windows: [{ page: 'ask', label: 'Ask', open: true, dock: 'left' }] }, persist: 'harbour-7' }));
  await click([...container.querySelectorAll('.as-geo-map button')].find(b => b.textContent === 'MV Northgate'));
  const details = () => container.querySelector('.as-geo-details [data-window="details"]');
  const ask = win(container, 'ask');
  const z = el => Number(el.style.zIndex);
  assert.ok(z(details()) > z(ask), `the card opens above the other windows: ${z(details())} over ${z(ask)}`);
  await drag(details().querySelector('.as-geo-window-head'), [100, 100], [300, 200]);
  const stored = () => JSON.parse(localStorage.getItem('agentspaces-geo:windows:harbour-7'));
  const placed = stored().details;
  assert.equal(placed.dock, 'free');
  await pointer(ask, 'pointerdown', 10, 10);
  assert.ok(z(ask) > z(details()), 'a click raises the other window over the card');
  await click(win(container, 'ask').querySelector('[aria-label="fold Ask"]'));
  assert.deepEqual([stored().details.x, stored().details.y, stored().details.dock], [placed.x, placed.y, 'free'], 'raising and folding another window keep the card\'s place');
  assert.equal(stored().ask.folded, true);
  await pointer(details(), 'pointerdown', 10, 10);
  assert.ok(z(details()) > z(ask), 'a click raises the card again');
  await unmount();
});

test('a GeoLayout draws its kicker above the title in the bar, and nothing without one', async () => {
  localStorage.clear();
  const withKicker = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask'], render, layout: { ...layout, kicker: 'Port operations' }, title: 'Harbour watch', persist: 'harbour-8' }));
  const title = withKicker.container.querySelector('.as-geo-bar .as-geo-title');
  assert.equal(title.querySelector('small.as-kicker')?.textContent, 'Port operations');
  assert.equal(title.querySelector('small.as-kicker').nextElementSibling.tagName, 'B', 'right above the title');
  assert.equal(title.querySelector('b').textContent, 'Harbour watch', 'the title is as it was');
  await withKicker.unmount();
  const plain = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask'], render, layout, title: 'Harbour watch', persist: 'harbour-8' }));
  assert.equal(plain.container.querySelector('.as-kicker'), null);
  await plain.unmount();
});

test('the stage carries how far the docked windows reach in from each side, 0px where nothing docks', async () => {
  localStorage.clear();
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents', 'files', 'spend'], render, layout, persist: 'harbour-9' }));
  const stage = container.querySelector('.as-geo-stage');
  const insets = () => ['left', 'right', 'bottom'].map(side => stage.style.getPropertyValue('--as-dock-' + side));
  // the default stage is 1200 by 800: a docked side window is 360 wide, 8px from the edge, with 8px past it
  assert.deepEqual(insets(), ['376px', '0px', '0px'], 'two windows on the left, the right one closed, the free one not counted');
  await click(menu(container, 'Files'));
  assert.deepEqual(insets(), ['376px', '376px', '0px'], 'opening the right window');
  await click(win(container, 'ask').querySelector('[aria-label="close Ask"]'));
  await click(win(container, 'incidents').querySelector('[aria-label="close Incidents"]'));
  assert.deepEqual(insets(), ['0px', '376px', '0px'], 'nothing left on the left');
  await unmount();
  localStorage.clear();
  const bottom = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'log'], render, persist: 'harbour-10',
    layout: { kind: 'geo', map: 'watch', windows: [{ page: 'log', label: 'Log', open: true, dock: 'bottom' }] } }));
  // a bottom window is 256 high (0.32 of 800), 8px off the edge, with 8px above it
  assert.equal(bottom.container.querySelector('.as-geo-stage').style.getPropertyValue('--as-dock-bottom'), '272px');
  await bottom.unmount();
});

test('a column that cannot hold its windows shares out what it has, and a bottom window fits the stage', () => {
  const stage = { width: 1200, height: 800 };
  const s = (dock, h, more = {}) => ({ open: true, folded: false, dock, x: 0, y: 0, w: 360, h, z: 1, sized: true, ...more });
  const three = ui.placeDocked(['a', 'b', 'c'], { a: s('right', 400), b: s('right', 400), c: s('right', 400) }, stage);
  const rows = ['a', 'b', 'c'].map(k => three[k]);
  assert.ok(rows.every(r => r.h >= ui.FIT_MIN_H), JSON.stringify(rows));
  assert.ok(rows[2].y + rows[2].h <= 792, 'the last one ends inside the stage: ' + JSON.stringify(rows));
  for (let i = 1; i < 3; i++) assert.ok(rows[i].y >= rows[i - 1].y + rows[i - 1].h + 8, 'stacked, none over the one above: ' + JSON.stringify(rows));
  const folded = ui.placeDocked(['a', 'b'], { a: s('left', 900, { folded: true }), b: s('left', 900) }, stage);
  assert.deepEqual(folded.b, { x: 8, y: 52, h: 740 }, 'a folded one keeps its head, the other takes what is left');
  const tall = ui.placeDocked(['d'], { d: s('bottom', 2000) }, stage);
  assert.deepEqual(tall.d, { x: 8, y: 8, h: 784 }, 'no taller than the stage');
  const row = ui.placeDocked(['l', 'd', 'e'], { l: s('left', 300), d: s('bottom', 200, { w: 600 }), e: s('bottom', 200, { w: 600 }) }, stage);
  assert.deepEqual(row.d, { x: 376, y: 592, h: 200 }, 'the first fits as it is');
  assert.deepEqual(row.e, { x: 984, y: 592, h: 200, w: 240 }, 'the next is cut to the room left, never under the stage\'s right edge');
});

test('a window is kept inside the stage, and one holding a table is wide enough for it unless the person sized it', () => {
  const stage = { width: 1200, height: 800 };
  assert.deepEqual(ui.fitRect({ x: 3000, y: 2400, w: 300, h: 260 }, stage), { x: 892, y: 532, w: 300, h: 260 }, 'a place kept on a larger screen comes back in');
  assert.deepEqual(ui.fitRect({ x: -50, y: -20, w: 2000, h: 1000 }, stage), { x: 8, y: 8, w: 1184, h: 784 }, 'no wider or taller than the stage');
  assert.deepEqual(ui.fitRect({ x: 100, y: 790, w: 300, h: 500 }, stage, true), { x: 100, y: 756, w: 300, h: 500 }, 'a folded one keeps its head on screen');
  assert.deepEqual(ui.fitRect({ x: 3000, y: 2400, w: 300, h: 260 }, { width: 0, height: 0 }), { x: 3000, y: 2400, w: 300, h: 260 }, 'a stage not measured yet moves nothing');
  const s = (more = {}) => ({ open: true, folded: false, dock: 'bottom', x: 0, y: 0, w: 360, h: 256, z: 1, ...more });
  assert.equal(ui.fitStates(['t'], { t: s() }, stage, { t: 700 }).t.w, 700, 'a table widens it');
  assert.equal(ui.fitStates(['t'], { t: s() }, stage, { t: 5000 }).t.w, ui.TABLE_MAX_W, 'up to the most a table widens a window to');
  assert.equal(ui.fitStates(['t'], { t: s({ sized: true }) }, stage, { t: 700 }).t.w, 360, 'the person\'s resize stands');
  assert.equal(ui.fitStates(['t'], { t: s() }, { width: 500, height: 400 }, { t: 700 }).t.w, 484, 'never wider than the stage');
  const kept = { t: s() };
  ui.fitStates(['t'], kept, stage, { t: 700 });
  assert.equal(kept.t.w, 360, 'the kept state is left as it was');
});

test('a window holding a table opens wide enough for one; the map\'s details window docks under the right windows, over none', async t => {
  localStorage.clear();
  const table = React.createElement('table', null, React.createElement('tbody', null, React.createElement('tr', null, React.createElement('td', null, 'a cell'))));
  const surface = id => (id === 'log' ? React.createElement('div', null, table) : render(id));
  const withTable = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'log', 'ask'], render: surface, persist: 'harbour-11',
    layout: { kind: 'geo', map: 'watch', windows: [{ page: 'log', label: 'Log', open: true, dock: 'bottom' }, { page: 'ask', label: 'Ask', open: true, dock: 'left' }] } }));
  await React.act(async () => { await new Promise(r => setTimeout(r, 50)); });
  try {
    assert.equal(win(withTable.container, 'log').style.width, ui.TABLE_MIN_W + 'px', 'the table\'s window');
    assert.equal(win(withTable.container, 'ask').style.width, '360px', 'a window without a table keeps its width');
  } finally {
    await withTable.unmount();
  }
  localStorage.clear();
  const ship = { type: 'Feature', id: 'ship217', kind: 'track.ship.cargo', label: 'MV Northgate', geometry: { type: 'Point', coordinates: [-3.0123, 53.4087] }, properties: {}, style: {}, at: '2026-11-12T09:14:03Z' };
  const envelopes = [
    { version: '1.0', createSurface: { surfaceId: 'watch', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 'watch', components: [{ id: 'root', component: 'Column', children: ['harbour'] }, { id: 'harbour', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }] }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'watch', path: '/', value: { ships: [ship] } } },
  ];
  const withMap = id => (id === 'watch' ? React.createElement(ui.Surfaces, { envelopes }) : render(id));
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask'], render: withMap, persist: 'harbour-12',
    layout: { kind: 'geo', map: 'watch', windows: [{ page: 'ask', label: 'Ask', open: true, dock: 'right' }] } }));
  t.after(unmount);
  const ask = win(container, 'ask');
  assert.deepEqual([ask.style.top, ask.style.height], ['8px', '784px'], 'alone on its side, the stage\'s height');
  await click([...container.querySelectorAll('.as-geo-map button')].find(b => b.textContent === 'MV Northgate'));
  const details = container.querySelector('.as-geo-details [data-window="details"]');
  assert.ok(details);
  const bottom = parseFloat(ask.style.top) + parseFloat(ask.style.height);
  assert.ok(parseFloat(details.style.top) >= bottom + 8, `the details window sits under Ask: Ask ends at ${bottom}, the details start at ${details.style.top}`);
  assert.ok(parseFloat(details.style.top) + parseFloat(details.style.height) <= 792, 'and inside the stage');
  assert.equal(container.querySelector('.as-geo-stage').style.getPropertyValue('--as-dock-right'), '376px', 'the overlays keep clear of the column, the details window in it');
  await key(document.body, 'Escape');
  assert.equal(container.querySelector('.as-geo-details [data-window="details"]'), null);
  assert.equal(ask.style.height, '784px', 'closed, Ask has the column again');
  localStorage.clear();
});

test('a column shares out between its bounds: the details window no taller than its content, a table window tall enough for its rows', () => {
  const stage = { width: 1200, height: 800 };
  const s = (dock, more = {}) => ({ open: true, folded: false, dock, x: 0, y: 0, w: 360, h: 392, z: 1, ...more });
  // the map's details window under a right window: it takes its content's height, the window above takes the rest
  const two = ui.placeDocked(['patterns', ui.DETAILS], { patterns: s('right'), [ui.DETAILS]: s('right') }, stage, { max: { [ui.DETAILS]: 300 } });
  assert.deepEqual([two.patterns, two[ui.DETAILS]], [{ x: 832, y: 8, h: 476 }, { x: 832, y: 492, h: 300 }]);
  assert.ok(two.patterns.y + two.patterns.h + 8 <= two[ui.DETAILS].y, 'over none of each other');
  // a content taller than its share is no limit, and nothing goes under MIN_H
  assert.deepEqual(ui.placeDocked(['a', 'b'], { a: s('right'), b: s('right') }, stage, { max: { b: 2000 } }).b.h, 388);
  assert.deepEqual(ui.shareOut(['a', 'b'], 776, { max: { b: 40 } }), { a: 616, b: ui.MIN_H });
  // a window holding a table takes the height its rows need; the others share what is left
  const table = ui.placeDocked(['data', 'notes'], { data: s('left'), notes: s('left') }, stage, { min: { data: 520 } });
  assert.deepEqual([table.data.h, table.notes.h], [520, 256]);
  assert.deepEqual(ui.shareOut(['a', 'b', 'c'], 900, { min: { a: 500 }, max: { c: 100 } }), { a: 500, b: 240, c: ui.MIN_H }, 'both bounds at once: c to its most (no lower than MIN_H), a to its least, b the rest');
  // a bottom window holding a table: fitStates raises its height to its rows' need, unless the person sized it
  const b = (more = {}) => ({ open: true, folded: false, dock: 'bottom', x: 0, y: 0, w: 560, h: 256, z: 1, ...more });
  assert.equal(ui.fitStates(['t'], { t: b() }, stage, { t: 640 }, { t: 440 }).t.h, 440);
  assert.equal(ui.fitStates(['t'], { t: b() }, stage, { t: 640 }, { t: 100 }).t.h, 256, 'never lower than it opened');
  assert.equal(ui.fitStates(['t'], { t: b({ sized: true }) }, stage, { t: 640 }, { t: 440 }).t.h, 256, 'the person\'s resize stands');
  const placed = ui.placeDocked(['t'], ui.fitStates(['t'], { t: b() }, stage, { t: 640 }, { t: 440 }), stage);
  assert.deepEqual(placed.t, { x: 8, y: 352, h: 440 });
  assert.equal(ui.dockInsets(['t'], ui.fitStates(['t'], { t: b() }, stage, { t: 640 }, { t: 440 }), stage).bottom, 456, 'the map\'s overlays keep clear of its new height');
});

test('a fly-to or a fit pads by what covers the map, and always leaves itself room', () => {
  assert.deepEqual(ui.fitPadding(undefined, 64, 1200, 800), { top: 64, right: 64, bottom: 64, left: 64 }, 'no insets: the base all round');
  assert.deepEqual(ui.fitPadding({ top: 56, left: 376, right: 388, bottom: 300 }, 48, 1600, 928), { top: 104, right: 436, bottom: 348, left: 424 });
  // windows that would cover nearly all the map are scaled down so a quarter of it stays to fit in
  const p = ui.fitPadding({ left: 700, right: 700, top: 0, bottom: 900 }, 48, 1600, 1000);
  assert.ok(1600 - p.left - p.right >= 400 && 1000 - p.top - p.bottom >= 250, JSON.stringify(p));
  assert.ok(p.left === p.right, 'in proportion');
  assert.deepEqual(ui.fitPadding({ left: -5 }, 10, 0, 0), { top: 10, right: 10, bottom: 10, left: 10 }, 'a map with no size yet pads by the base alone');
});

test('each window chip shows its label under its icon, the window glyph for a name outside the set', async () => {
  localStorage.clear();
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['watch', 'ask', 'incidents', 'files', 'spend'], render, layout: { ...layout, kicker: 'A kicker' }, persist: 'harbour-chips' }));
  const chips = [...container.querySelectorAll('.as-geo-menu-item')];
  assert.deepEqual(chips.map(c => [c.querySelector('svg.as-icon') !== null, c.querySelector('.as-geo-menu-label')?.textContent]),
    [[true, 'Ask'], [true, 'Incidents'], [true, 'Files'], [true, 'Spend']], 'an icon, then the label in its own line, on every chip');
  assert.ok(chips.every(c => c.firstElementChild.tagName.toLowerCase() === 'svg' && c.lastElementChild.classList.contains('as-geo-menu-label')), 'the icon first, the label under it');
  assert.ok(container.querySelector('.as-geo-bar .as-geo-menu'), 'the chips are a row of the bar, not of the map');
  await unmount();
});
