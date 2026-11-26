// Visualize mark: heatmap (srad/agentspaces-geo.md GEO-D-08): the grid's logic (fixed orders, aggregation, facets, the
// pick, the domain over every row), the sequential ramp (one hue, its lightness one way, flipped in dark mode), and the
// drawing: a grid by keyboard (a roving tabindex, the arrows, Enter), a click that flies, dispatches and selects, a second
// click that clears, empty cells as outlines, a legend, a table view per facet. And the filter a selected cell drives: a
// GeoMap hex layer and a DataTable on the same surface keep only the clicked cell's rows (GEO-M-12, GEO-D-09).
import test from 'node:test';
import assert from 'node:assert/strict';
import { React, draw, envelope, key, ui } from './setup.mjs';

const ROWS = [
  { person: 'Ada', day: 'Mon', hour: '08', count: 3, place: 'desk-north' }, { person: 'Ada', day: 'Mon', hour: '09', count: 5, place: 'desk-north' },
  { person: 'Ada', day: 'Mon', hour: '09', count: 1, place: 'desk-north' }, { person: 'Ada', day: 'Tue', hour: '10', count: 2, place: 'lab-2' },
  { person: 'Ben', day: 'Mon', hour: '08', count: 1, place: 'desk-south' }, { person: 'Ben', day: 'Wed', hour: '10', count: 4, place: 'lab-2' },
  { person: 'Ben', day: 'Sun', hour: '10', count: 9, place: 'lab-2' },
];
const SPEC = { x: 'hour', row: 'day', value: 'count', aggregate: 'sum', xOrder: ['08', '09', '10', '11'], rowOrder: ['Mon', 'Tue', 'Wed'], facet: 'person', pickBy: 'person' };

test('the grid: fixed orders keep every category and leave out the rest, cells aggregate, facets split, the pick keeps its keys', () => {
  const h = ui.heatOf(ROWS, SPEC);
  assert.deepEqual(h.xs, ['08', '09', '10', '11']);
  assert.deepEqual(h.ys, ['Mon', 'Tue', 'Wed']);
  assert.equal(h.outside, 1, 'the Sunday row lies outside rowOrder');
  assert.deepEqual(h.facets.map(f => f.name), ['Ada', 'Ben']);
  assert.equal(h.facets[0].cells.get(ui.heatCellKey('09', 'Mon')).value, 6, 'summed');
  assert.equal(h.facets[0].cells.get(ui.heatCellKey('11', 'Mon')), undefined, 'an hour no row has has no cell');
  assert.deepEqual(h.domain, { min: 0, max: 6 });
  const picked = ui.heatOf(ROWS, SPEC, ['Ben']);
  assert.deepEqual(picked.facets.map(f => f.name), ['Ben']);
  assert.deepEqual(picked.domain, h.domain, 'the domain is every row\'s, so a colour does not move with the pick');
  assert.deepEqual(ui.heatOf(ROWS, SPEC, ['Ben', 'Ada']).facets.map(f => f.name), ['Ben', 'Ada'], 'the pick set\'s order');
  assert.equal(ui.heatOf(ROWS, { ...SPEC, value: undefined }).facets[0].cells.get(ui.heatCellKey('09', 'Mon')).value, 2, 'no y: a count');
  assert.equal(ui.heatOf(ROWS, { ...SPEC, aggregate: 'none' }).facets[0].cells.get(ui.heatCellKey('09', 'Mon')).value, 1, 'none: the last row');
  const many = Array.from({ length: 10 }, (_, i) => ({ person: 'p' + i, day: 'Mon', hour: '08', count: i }));
  const ten = ui.heatOf(many, SPEC);
  assert.equal(ten.facets.length, ui.MAX_FACETS);
  assert.deepEqual(ten.left, ['p8', 'p9']);
  const free = ui.heatOf(ROWS, { x: 'hour', row: 'day', aggregate: 'none' });
  assert.deepEqual(free.xs, ['08', '09', '10'], 'without an order, the rows\' own');
  assert.ok(ui.heatSelects({ hour: '09', day: 'Mon', person: 'Ada' }, { x: '09', y: 'Mon', facet: 'Ada' }, SPEC));
  assert.ok(!ui.heatSelects({ hour: '09', day: 'Mon', person: 'Ben' }, { x: '09', y: 'Mon', facet: 'Ada' }, SPEC));
  assert.ok(!ui.heatSelects(null, { x: '09', y: 'Mon', facet: 'Ada' }, SPEC));
});

/** The relative luminance of a colour, for the ramp's order. */
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

test('the ramp: five steps of one hue, darker each step on a light surface and lighter on a dark one; a value takes its fifth', () => {
  const light = ui.sequentialRamp('#ffffff', '#635a93');
  assert.equal(light.length, ui.RAMP_STEPS);
  for (let i = 1; i < light.length; i++) assert.ok(lum(light[i]) < lum(light[i - 1]), `light step ${i} is darker: ${light}`);
  assert.ok(lum(light[0]) < lum('#ffffff') - 0.08, 'the faintest step still stands apart from the surface');
  const dark = ui.sequentialRamp('#13191f', '#bf9bfc');
  for (let i = 1; i < dark.length; i++) assert.ok(lum(dark[i]) > lum(dark[i - 1]), `dark step ${i} is lighter: ${dark}`);
  const d = ui.rampDomain([0.2, 0.9, 0.5]);
  assert.deepEqual(d, { min: 0, max: 0.9 });
  assert.equal(ui.rampStep(0, d), 0);
  assert.equal(ui.rampStep(0.9, d), 4);
  assert.equal(ui.rampStep(0.45, d), 2);
  assert.equal(ui.rampStep(5, { min: 5, max: 5 }), 4, 'one value: the last step');
  assert.equal(ui.rampDomain([]), undefined);
  assert.deepEqual(ui.rampBounds({ min: 0, max: 10 }), [0, 2, 4, 6, 8]);
});

test('the filter: a key, a list of keys, or an object on the match columns; an empty value keeps every row', () => {
  const rows = [{ d: 1, h: 9, slot: 33 }, { d: 1, h: 10, slot: 34 }, { d: 2, h: 9, slot: 57 }];
  const f = (match, value) => ui.filterRows(rows, { path: '/s', match }, value).map(r => r.slot);
  assert.deepEqual(f(['slot'], 33), [33]);
  assert.deepEqual(f(['slot'], '34'), [34], 'as text');
  assert.deepEqual(f(['slot'], [33, 57]), [33, 57]);
  assert.deepEqual(f(['d', 'h'], { d: 1, h: 9, x: '09' }), [33], 'an object, column by column');
  assert.deepEqual(f(['slot'], { d: 1 }), [33, 34, 57], 'an object holding none of the columns keeps every row');
  for (const keep of [undefined, null, '', '  ', [], {}]) assert.deepEqual(f(['slot'], keep), [33, 34, 57], JSON.stringify(keep));
  assert.deepEqual(ui.rowFilterOf({ path: '/s', match: 'slot' }), { path: '/s', match: ['slot'] });
  assert.equal(ui.rowFilterOf({ path: 's', match: 'slot' }), undefined);
  assert.equal(ui.rowFilterOf({ path: '/s', match: [] }), undefined);
});

const heat = (more = {}) => ({ id: 'week', component: 'Visualize', rows: '/visits', mark: 'heatmap', x: 'hour', row: 'day', y: 'count', aggregate: 'sum', title: 'Visits by hour',
  xOrder: ['08', '09', '10', '11'], rowOrder: ['Mon', 'Tue', 'Wed'], facet: 'person', ...more });

test('the grid draws by keyboard: one cell of each grid takes the Tab, the arrows move it, Enter clicks, a click dispatches and selects, a second clears', async () => {
  const { container, actions, problems, unmount } = await draw(envelope('hm', [heat({ cellAction: 'visit.open', selected: '/slot', pick: { by: 'person' } })], { visits: ROWS }));
  assert.deepEqual(problems, []);
  const own = container.querySelector('[data-component="Visualize"][data-mark="heatmap"]');
  assert.equal(own.dataset.facets, '2');
  const grids = [...own.querySelectorAll('table[role="grid"]')];
  assert.deepEqual(grids.map(g => g.getAttribute('aria-label')), ['Visits by hour: Ada', 'Visits by hour: Ben']);
  const cells = [...own.querySelectorAll('td[role="gridcell"]')];
  assert.equal(cells.length, 2 * 3 * 4, 'every hour of every day of each person');
  assert.equal(own.querySelectorAll('td.cell.empty').length, 24 - 5, 'a cell no row has is an outline');
  assert.deepEqual(cells.filter(c => c.tabIndex === 0).map(c => c.dataset.cell), ['0:0:0', '1:0:0'], 'one cell of each grid takes the Tab, so the second facet is reached by keyboard');
  // the second grid answers its own keys: its arrows move inside it, and each grid keeps one tab stop
  const second = own.querySelector('td[data-cell="1:0:0"]');
  second.focus();
  await key(second, 'ArrowDown');
  assert.equal(document.activeElement?.dataset.cell, '1:0:1', 'an arrow in the second grid moves inside it');
  assert.deepEqual([...own.querySelectorAll('td[tabindex="0"]')].map(c => c.dataset.cell), ['0:0:1', '1:0:1']);
  await key(document.activeElement, 'ArrowUp');
  assert.equal(document.activeElement?.dataset.cell, '1:0:0');
  assert.equal(cells[1].getAttribute('aria-label'), 'Ada, Mon 09: 6');
  assert.equal(cells[3].getAttribute('aria-label'), 'Ada, Mon 11: no data');
  assert.ok(own.textContent.includes('0 to 6') && own.textContent.includes('no data'), 'the legend: the range and the outline\'s meaning');
  cells[0].focus();
  await key(cells[0], 'ArrowRight');
  assert.equal(own.querySelector('td[tabindex="0"]').dataset.cell, '0:1:0');
  assert.equal(own.querySelectorAll('td[tabindex="0"]').length, 2);
  assert.equal(document.activeElement?.dataset.cell, '0:1:0', 'the focus moves with it');
  await key(own.querySelector('td[tabindex="0"]'), 'Enter');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].name, 'visit.open');
  const ctx = actions[0].context;
  assert.deepEqual([ctx.x, ctx.y, ctx.value, ctx.facet, ctx.row.place], ['09', 'Mon', 6, 'Ada', 'desk-north']);
  assert.equal(own.querySelectorAll('td.selected').length, 1, 'the clicked cell is ringed');
  assert.equal(own.querySelector('td.selected').getAttribute('aria-selected'), 'true');
  // the second click on the selected cell clears it and dispatches nothing
  await React.act(async () => { own.querySelector('td.selected').click(); });
  assert.equal(own.querySelectorAll('td.selected').length, 0);
  assert.equal(actions.length, 1);
  await key(own.querySelector('td[tabindex="0"]'), 'End');
  assert.equal(own.querySelector('td[tabindex="0"]').dataset.cell, '0:3:0');
  await key(own.querySelector('td[tabindex="0"]'), 'ArrowDown');
  assert.equal(own.querySelector('td[tabindex="0"]').dataset.cell, '0:3:1');
  await key(own.querySelector('td[tabindex="0"]'), 'Enter');
  assert.equal(actions.length, 1, 'Enter on an empty cell does nothing');
  // the table view: each facet's rows by its columns, an empty cell as a dash
  await React.act(async () => { [...own.querySelectorAll('button')].find(b => b.textContent === 'Table').click(); });
  const tables = [...own.querySelectorAll('table[data-chart-table]')];
  assert.equal(tables.length, 2);
  assert.deepEqual([...tables[0].querySelectorAll('tbody tr')[0].querySelectorAll('td')].map(t => t.textContent), ['3', '6', '–', '–']);
  await unmount();
});

test('each cell is filled by its own value on the ramp, the legend\'s steps are the cells\' colours, and a flat week draws one shade', async () => {
  // rows shaped like a weekday-hour presence grid: string hours and day names, a numeric probability, a facet per key
  const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const peak = (d, h) => ((d === 2 || d === 4) && h === 12 ? 0.78 : d === 3 && h === 21 ? 0.7 : (h + d) % 4 === 0 ? 0.3 : 0.05);
  const rows = [];
  for (const key of ['varied', 'flat']) for (let s = 0; s < 168; s++) {
    const d = Math.floor(s / 24), h = s % 24;
    rows.push({ key, d, h, x: HOURS[h], y: DAYS[d], value: key === 'flat' ? 0.76 : peak(d, h), place: 'p-' + (s % 5) });
  }
  const comp = { id: 'week', component: 'Visualize', rows: '/cells', mark: 'heatmap', x: 'x', row: 'y', y: 'value', xOrder: HOURS, rowOrder: DAYS, facet: 'key', pick: { by: 'key' }, focus: 'place', title: 'Week', unit: 'p' };
  for (const mode of ['light', 'dark']) {
    const { container, problems, unmount } = await draw(envelope('hw-' + mode, [comp], { cells: rows }), { mode });
    assert.deepEqual(problems, []);
    const own = container.querySelector('[data-mark="heatmap"]');
    const ramp = [...own.querySelectorAll('.as-heat-ramp .step')].map(s => s.style.background);
    assert.equal(ramp.length, ui.RAMP_STEPS);
    assert.equal(new Set(ramp).size, ui.RAMP_STEPS, `${mode}: five distinct steps`);
    assert.match(own.querySelector('.as-heat-legend').textContent, /0 to 0\.78/);
    const domain = { min: 0, max: 0.78 };
    const [varied, flat] = [...own.querySelectorAll('.as-heat-facet')].map(f => [...f.querySelectorAll('td[role="gridcell"]')]);
    assert.equal(varied.length, 168);
    varied.forEach((c, i) => assert.equal(c.style.background, ramp[ui.rampStep(peak(Math.floor(i / 24), i % 24), domain)], `${mode}: ${c.getAttribute('aria-label')}`));
    assert.equal(new Set(varied.map(c => c.style.background)).size, 3, `${mode}: the varied week draws its three magnitudes apart`);
    assert.equal(varied[2 * 24 + 12].style.background, ramp[4], 'the greatest value takes the last step, the legend\'s top');
    assert.equal(varied[1].style.background, ramp[0], 'the least (Sun 01, 0.05) the first');
    assert.deepEqual([...new Set(flat.map(c => c.style.background))], [ramp[4]], `${mode}: a week of one value (0.76 in every hour) is one shade, as its data is`);
    await unmount();
  }
});

test('the edges of a value: a grid of only zeros is the faintest step, an empty or unreadable value is no data, not zero', async () => {
  const S = { x: 'x', row: 'y', value: 'v', aggregate: 'none' };
  const cell = (h, x) => h.facets[0].cells.get(ui.heatCellKey(x, 'r'));
  const step = (h, x) => ui.rampStep(cell(h, x).value, h.domain);
  // only zeros: nothing has magnitude, so every cell is the first step, not the last; one value above zero is the last
  const zeros = ui.heatOf([{ x: 'a', y: 'r', v: 0 }, { x: 'b', y: 'r', v: 0 }], S);
  assert.deepEqual(zeros.domain, { min: 0, max: 0 });
  assert.deepEqual([step(zeros, 'a'), step(zeros, 'b')], [0, 0]);
  assert.equal(ui.rampStep(0, { min: 0, max: 0 }), 0);
  const one = ui.heatOf([{ x: 'a', y: 'r', v: 0.4 }], S);
  assert.equal(step(one, 'a'), ui.RAMP_STEPS - 1, 'a single row above zero is the greatest');
  const flat = ui.heatOf([{ x: 'a', y: 'r', v: 0.76 }, { x: 'b', y: 'r', v: 0.76 }], S);
  assert.deepEqual([step(flat, 'a'), step(flat, 'b')], [4, 4], 'equal values above zero share the last step');
  // null, missing, '' and 'n/a' are no data: no cell (an outline), and they do not reach the domain; '0.5' reads as 0.5
  const odd = ui.heatOf([{ x: 'a', y: 'r', v: null }, { x: 'b', y: 'r' }, { x: 'c', y: 'r', v: '' }, { x: 'd', y: 'r', v: 'n/a' }, { x: 'e', y: 'r', v: '0.5' }, { x: 'f', y: 'r', v: -2 }, { x: 'g', y: 'r', v: 30.55 }], S);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(x => cell(odd, x)), [undefined, undefined, undefined, undefined]);
  assert.equal(cell(odd, 'e').value, 0.5);
  assert.deepEqual(odd.domain, { min: -2, max: 30.55 }, 'a negative value opens the domain below zero, one past 1 above');
  assert.deepEqual([step(odd, 'f'), step(odd, 'g')], [0, 4]);
  assert.deepEqual(ui.heatOf([{ x: 'a', y: 'r', v: null }], S).domain, undefined, 'no value at all: no domain');
  // a sum skips the empty value and keeps the rest; a mean is over the values there are; a count still counts every row
  const two = [{ x: 'a', y: 'r', v: null }, { x: 'a', y: 'r', v: 4 }];
  assert.equal(cell(ui.heatOf(two, { ...S, aggregate: 'sum' }), 'a').value, 4);
  assert.equal(cell(ui.heatOf(two, { ...S, aggregate: 'mean' }), 'a').value, 4);
  assert.equal(cell(ui.heatOf(two, { ...S, aggregate: 'count' }), 'a').value, 2);
  assert.equal(cell(ui.heatOf(two, { ...S, aggregate: 'none' }), 'a').rows.length, 2, 'the cell keeps every row for a click');
  // drawn: the zero week is the first swatch, and a null hour is an outline that says no data
  const HOURS = ['00', '01', '02'];
  const rows = HOURS.map((x, i) => ({ x, y: 'Mon', v: i === 2 ? null : 0 }));
  const { container, problems, unmount } = await draw(envelope('he', [{ id: 'z', component: 'Visualize', rows: '/c', mark: 'heatmap', x: 'x', row: 'y', y: 'v', xOrder: HOURS, rowOrder: ['Mon'], title: 'Z' }], { c: rows }));
  assert.deepEqual(problems, []);
  const own = container.querySelector('[data-mark="heatmap"]');
  const ramp = [...own.querySelectorAll('.as-heat-ramp .step')].map(s => s.style.background);
  const tds = [...own.querySelectorAll('td[role="gridcell"]')];
  assert.deepEqual(tds.slice(0, 2).map(t => t.style.background), [ramp[0], ramp[0]], 'zeros are the faintest swatch');
  assert.ok(tds[2].classList.contains('empty'));
  assert.equal(tds[2].style.background, '');
  assert.match(tds[2].getAttribute('aria-label'), /no data/);
  await unmount();
});

test('the pick keeps the picked keys\' grids, in the set\'s order, titled beside their hue; with none picked, every grid', async () => {
  const picked = { visits: ROWS, _geo: { m: { picked: ['Ben'] } } };
  const a = await draw(envelope('hp', [heat({ pick: { by: 'person' }, map: 'm' })], picked));
  const own = a.container.querySelector('[data-mark="heatmap"]');
  assert.deepEqual([...own.querySelectorAll('.as-heat-facet')].map(f => f.dataset.facet), ['Ben']);
  assert.ok(own.querySelector('.as-heat-facet-title .swatch'), 'the facet of a picked key shows its pick hue');
  await a.unmount();
  const b = await draw(envelope('hp2', [heat({ pick: { by: 'person' }, map: 'm' })], { visits: ROWS, _geo: { m: { picked: ['Zoe'] } } }));
  assert.match(b.container.textContent, /None of the picked keys has a row here/);
  await b.unmount();
});

test('a click flies the map to the feature the focus column names and selects it there', async () => {
  const place = { type: 'Feature', id: 'desk-north', kind: 'place', label: 'North desk', geometry: { type: 'Point', coordinates: [-104.99, 39.74] }, properties: {}, at: '2026-11-19T09:00:00Z' };
  const { container, unmount } = await draw(envelope('hf', [heat({ focus: 'place', map: 'm' }), { id: 'm', component: 'GeoMap', layers: [{ path: '/places', label: 'Places' }] }],
    { visits: ROWS, places: [place] }, 'agentspaces-geo'));
  await React.act(async () => { container.querySelector('td[data-cell="0:1:0"]').click(); });
  assert.equal(container.querySelector('.as-geomap').dataset.selected, 'desk-north');
  await unmount();
});

test('a selected cell filters a hex layer and a table on the same surface at once; a second click shows every row again', async () => {
  const slots = [{ d: 1, h: 9, x: '09', y: 'Mon', value: 3 }, { d: 1, h: 10, x: '10', y: 'Mon', value: 1 }];
  const r9 = (lat, lon) => ui.hexOf(lat, lon, ui.HEX_R9);
  const hexes = [
    { hex: r9(39.7392, -104.9903), d: 1, h: 9, score: 0.9, name: 'Union Station' }, { hex: r9(39.7392, -104.9903), d: 1, h: 10, score: 0.3, name: 'Union Station' },
    { hex: r9(39.7508, -104.9966), d: 1, h: 10, score: 0.6, name: 'Coors Field' }, { hex: 'not a hex', d: 1, h: 9, score: 1, name: 'Nowhere' },
  ];
  const pairs = [{ who: 'A+B', d: 1, h: 9 }, { who: 'C+D', d: 1, h: 10 }];
  const comps = [
    { id: 'grid', component: 'Visualize', rows: '/slots', mark: 'heatmap', x: 'x', row: 'y', y: 'value', title: 'Expected visits', selected: '/slot' },
    { id: 'm', component: 'GeoMap', selectAction: 'hex.open', layers: [{ path: '/hexes', label: 'Busy hexes', hexes: { id: 'hex', value: 'score', size: 225, label: 'name' }, filter: { path: '/slot', match: ['d', 'h'] } }] },
    { id: 'list', component: 'DataTable', columns: [{ key: 'who', title: 'Who' }], rows: '/pairs', rowFilter: { path: '/slot', match: ['d', 'h'] } },
  ];
  const { container, actions, problems, unmount } = await draw(envelope('hs', comps, { slots, hexes, pairs }, 'agentspaces-geo'));
  assert.deepEqual(problems, []);
  const shown = () => [...container.querySelectorAll('.as-geomap .layer-table tbody td:first-child')].map(td => td.textContent);
  const listed = () => [...container.querySelectorAll('[data-component="DataTable"] tbody td:first-child')].map(td => td.textContent);
  assert.deepEqual(shown().sort(), ['Coors Field', 'Union Station'], 'rows that share a hex draw once; a row whose id is no hex is left out');
  assert.deepEqual(listed(), ['A+B', 'C+D']);
  await React.act(async () => { container.querySelector('td[data-cell="0:0:0"]').click(); });
  assert.deepEqual(shown(), ['Union Station'], 'the 09:00 rows alone');
  assert.deepEqual(listed(), ['A+B']);
  assert.match(container.querySelector('.as-geomap .legend').textContent, /1 of 3 kept by the filter/);
  assert.match(container.querySelector('[data-component="DataTable"]').textContent, /1 of 2 rows/);
  // a hex selected from the table view sends the map's selectAction with the hex, its centre and its row
  await React.act(async () => { container.querySelector('.as-geomap .layer-table button.as-geo-link').click(); });
  const a = actions.find(x => x.name === 'hex.open');
  assert.equal(a.context.hex, r9(39.7392, -104.9903));
  assert.equal(a.context.row.score, 0.9);
  assert.equal(a.context.centre.length, 2);
  assert.ok(Math.abs(a.context.centre[0] + 104.99) < 0.01 && Math.abs(a.context.centre[1] - 39.74) < 0.01, `the centre is [longitude, latitude]: ${a.context.centre}`);
  await React.act(async () => { container.querySelector('td[data-cell="0:0:0"]').click(); });
  assert.deepEqual(shown().sort(), ['Coors Field', 'Union Station'], 'the second click shows every row again');
  assert.deepEqual(listed(), ['A+B', 'C+D']);
  await unmount();
});

test('a path under /_page/ is the page\'s: a heatmap selected in one surface filters a hex layer and a table drawn by others (GEO-D-12)', async () => {
  ui.resetPageState();
  const slots = [{ d: 1, h: 9, x: '09', y: 'Mon', value: 3 }, { d: 1, h: 10, x: '10', y: 'Mon', value: 1 }];
  const r9 = (lat, lon) => ui.hexOf(lat, lon, ui.HEX_R9);
  const hexes = [{ hex: r9(39.7392, -104.9903), d: 1, h: 9, score: 0.9, name: 'Union Station' }, { hex: r9(39.7508, -104.9966), d: 1, h: 10, score: 0.6, name: 'Coors Field' }];
  const pairs = [{ who: 'A+B', d: 1, h: 9 }, { who: 'C+D', d: 1, h: 10 }];
  const envelopes = [
    ...envelope('grid-window', [{ id: 'grid', component: 'Visualize', rows: '/slots', mark: 'heatmap', x: 'x', row: 'y', y: 'value', title: 'Expected visits', selected: '/_page/slot' }], { slots }),
    ...envelope('map-window', [{ id: 'm', component: 'GeoMap', layers: [{ path: '/hexes', label: 'Busy hexes', hexes: { id: 'hex', value: 'score', size: 225, label: 'name' }, filter: { path: '/_page/slot', match: ['d', 'h'] } }] }], { hexes }, 'agentspaces-geo'),
    ...envelope('list-window', [{ id: 'list', component: 'DataTable', columns: [{ key: 'who', title: 'Who' }], rows: '/pairs', rowFilter: { path: '/_page/slot', match: ['d', 'h'] } }], { pairs }),
  ];
  const { container, problems, unmount } = await draw(envelopes);
  assert.deepEqual(problems, []);
  const shown = () => [...container.querySelectorAll('.as-geomap .layer-table tbody td:first-child')].map(td => td.textContent).sort();
  const listed = () => [...container.querySelectorAll('[data-component="DataTable"] tbody td:first-child')].map(td => td.textContent);
  assert.deepEqual(shown(), ['Coors Field', 'Union Station']);
  assert.deepEqual(listed(), ['A+B', 'C+D']);
  await React.act(async () => { container.querySelector('td[data-cell="0:0:0"]').click(); });
  assert.deepEqual(shown(), ['Union Station'], 'the other surface\'s layer keeps the 09:00 rows alone');
  assert.deepEqual(listed(), ['A+B'], 'and so does the third surface\'s table');
  assert.equal(ui.pageGet('/_page/slot').h, 9, 'the page holds the selected row');
  await React.act(async () => { container.querySelector('td[data-cell="0:0:0"]').click(); });
  assert.deepEqual(shown(), ['Coors Field', 'Union Station'], 'the second click shows every row again, in every surface');
  assert.deepEqual(listed(), ['A+B', 'C+D']);
  await unmount();
  ui.resetPageState();
});

test('a hex layer: the size keeps its own hexes, the ramp colours by value over every row, and the legend shows the ramp and range', () => {
  const r9 = ui.hexOf(39.74, -104.99, 225), r8 = ui.hexOf(39.74, -104.99, 600), other = ui.hexOf(39.76, -105.0, 225);
  const rows = [{ hex: r9, v: 2, h: 9 }, { hex: r9, v: 8, h: 10 }, { hex: r8, v: 5, h: 9 }, { hex: other, v: 0, h: 9 }];
  const ramp = ui.sequentialRamp('#ffffff', '#635a93');
  const [layer] = ui.featureLayers([{ path: '/h', label: 'H', hexes: { id: 'hex', value: 'v', size: 225 }, filter: { path: '/slot', match: 'h' } }], p => (p === '/h' ? rows : p === '/slot' ? 9 : undefined), ['#111111'], ramp);
  assert.deepEqual(layer.features.map(f => f.id).sort(), [r9, other].sort());
  assert.deepEqual(layer.ramp.domain, { min: 0, max: 8 }, 'the domain is every row of the size, before the filter');
  assert.equal(layer.features.find(f => f.id === r9).style.fill, ramp[1], 'the 09:00 value 2 of 8 takes the second step');
  assert.equal(layer.features.find(f => f.id === other).style.fill, ramp[0]);
  assert.deepEqual(layer.filtered, { kept: 2, of: 3 });
  assert.equal(layer.features[0].geometry.type, 'Polygon');
  assert.equal(layer.features[0].geometry.coordinates[0].length, 7);
  const [unfiltered] = ui.featureLayers([{ path: '/h', hexes: { id: 'hex', value: 'v' } }], p => (p === '/h' ? rows : undefined), ['#111111'], ramp);
  assert.equal(unfiltered.features.length, 3, 'every size when none is named');
  assert.equal(unfiltered.features.find(f => f.id === r9).properties.v, 8, 'the row of the greatest value draws');
  assert.equal(unfiltered.filtered, undefined);
  const [kinds] = ui.featureLayers([{ path: '/h', kind: 'busy', hexes: { id: 'hex', value: 'v' } }], () => [{ hex: r9, v: 1, kind: 'busy' }, { hex: other, v: 1, kind: 'quiet' }], [], ramp);
  assert.deepEqual(kinds.features.map(f => f.kind), ['busy'], 'the layer\'s kind keeps the rows of that kind');
});

test('2,000 hex rows filtered and coloured within a frame budget: a measurement against a 16 ms goal (the CPU side of GEO-M-11)', t => {
  const rows = [];
  for (let i = 0; i < 500; i++) for (let h = 0; h < 4; h++) rows.push({ hex: ui.hexOf(39.6 + (i % 25) * 0.004, -105.1 + Math.floor(i / 25) * 0.005, 225), v: (i * 7 + h) % 11, h });
  const ramp = ui.sequentialRamp('#ffffff', '#635a93');
  const run = slot => ui.featureLayers([{ path: '/h', hexes: { id: 'hex', value: 'v' }, filter: { path: '/slot', match: 'h' } }], p => (p === '/h' ? rows : slot), [], ramp)[0];
  run(0);
  const times = [];
  for (let k = 0; k < 20; k++) { const t0 = performance.now(); run(k % 4); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  const median = times[10], worst = times[19];
  // goal 16 ms (one frame), typical band 2 to 10 ms on a laptop, out of bounds past 50 ms
  t.diagnostic(`2,000 hex rows, a filter change: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms (goal 16 ms, limit 50 ms)`);
  assert.equal(run(1).features.length, 500);
  assert.ok(median < 50, `under the limit: ${median.toFixed(1)} ms`);
});
