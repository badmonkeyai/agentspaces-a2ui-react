// agentspaces-viz/DataTable as srad/agentspaces-geo.md grows it (GEO-D-06, D-07; keyboard picks, the pick set in
// memory only): sort headers that are buttons, several row actions, its own empty words, and select: a
// checkbox per row that picks the row's key into a map's pick set (kept by key across sort and filter, its hue as a
// swatch, Clear (n), the refusal past max, Shift for a range, the arrow keys between rows, pruning and clearOn said in a
// polite live region), the focus button that flies the map, and a pick set that never leaves the browser's memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, key, click, React, ui } from './setup.mjs';

const ROWS = [
  { name: 'Ana', visits: 4, team: 'north', route: 'r-ana' }, { name: 'Ben', visits: 9, team: 'north', route: 'r-ben' },
  { name: 'Cy', visits: 2, team: 'north', route: 'r-cy' }, { name: 'Dee', visits: 7, team: 'north', route: 'r-dee' },
];
const columns = [{ key: 'name', title: 'Person' }, { key: 'visits', title: 'Visits', format: 'number' }];

/** A viz page whose envelopes grow; push(path, value) feeds one path. */
async function page(components, data, surfaceId = 'people', catalogId = 'agentspaces-viz') {
  const actions = [];
  let set;
  const base = [
    { version: '1.0', createSurface: { surfaceId, catalogId } },
    { version: '1.0', updateComponents: { surfaceId, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId, path: '/', value: data } },
  ];
  function Host() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }); }
  const m = await mount(React.createElement(Host));
  const push = async (path, value) => { await React.act(async () => { set(e => [...e, { version: '1.0', updateDataModel: { surfaceId, path, value } }]); }); };
  return { ...m, actions, push };
}
const names = c => [...c.querySelectorAll('tbody tr')].map(r => r.querySelectorAll('td')[1]?.textContent ?? '');
const box = (c, who) => c.querySelector(`input[aria-label="Show ${who} on the map"]`);
const said = c => c.querySelector('.bma-datatable > p[aria-live="polite"]')?.textContent.replace(/​/g, '') ?? '';
const picked = c => [...c.querySelectorAll('tbody tr[data-picked]')].map(r => r.querySelectorAll('td')[1].textContent);

test('each sort header is a button (so Tab, Enter and Space reach it), with aria-sort on the sorted column alone', async () => {
  const p = await page([{ id: 't', component: 'DataTable', columns, rows: '/people' }], { people: ROWS });
  const heads = [...p.container.querySelectorAll('thead th')];
  assert.deepEqual(heads.map(h => h.querySelector('button.as-sort')?.textContent), ['Person', 'Visits'], 'a button in each header');
  assert.ok(heads.every(h => !h.hasAttribute('aria-sort')), 'no column sorted yet');
  assert.ok(heads.every(h => h.querySelector('button').type === 'button' && h.querySelector('button').tabIndex >= 0), 'native buttons, in the Tab order');
  assert.ok(heads.every(h => !h.onclick && !h.hasAttribute('onclick')), 'the cell itself takes no click');
  await click(heads[1].querySelector('button'));
  assert.equal(heads[1].getAttribute('aria-sort'), 'ascending');
  assert.equal(heads[0].hasAttribute('aria-sort'), false);
  assert.deepEqual([...p.container.querySelectorAll('tbody tr')].map(r => r.querySelector('td').textContent), ['Cy', 'Ana', 'Dee', 'Ben']);
  await click(heads[1].querySelector('button'));
  assert.equal(heads[1].getAttribute('aria-sort'), 'descending');
  await p.unmount();
});

test('rowActions put a button each in every row, named with the row, dispatching {row}; emptyText says the table\'s own words', async () => {
  const p = await page([{ id: 't', component: 'DataTable', columns, rows: '/people', rowAction: 'open', rowActionLabel: 'Open',
    rowActions: [{ action: 'people.replay', label: 'Replay' }, { action: 'people.show', label: 'Show' }] }], { people: ROWS.slice(0, 2) });
  const row = p.container.querySelector('tbody tr');
  assert.deepEqual([...row.querySelectorAll('button')].map(b => [b.textContent, b.getAttribute('aria-label')]), [['Open', 'Open Ana'], ['Replay', 'Replay Ana'], ['Show', 'Show Ana']]);
  await click(row.querySelector('button[aria-label="Show Ana"]'));
  assert.equal(p.actions.at(-1).name, 'people.show');
  assert.equal(p.actions.at(-1).context.row.name, 'Ana');
  await p.unmount();
  const e = await page([{ id: 't', component: 'DataTable', columns, rows: '/people', emptyText: 'Nobody has called twice yet.' }], { people: [] });
  assert.ok(e.text().includes('Nobody has called twice yet.'));
  assert.ok(!e.text().includes('No row yet.'));
  await e.unmount();
});

test('select picks rows by key into the map\'s pick set: a swatch, Clear (n), kept across sort and filter, the refusal past max said', async () => {
  const p = await page([{ id: 't', component: 'DataTable', columns, rows: '/people', select: { key: 'name', map: 'watch', max: 3, label: 'Show on the map' } }], { people: ROWS });
  const wrap = p.container.querySelector('[data-pick-map="watch"]');
  assert.ok(wrap, 'the table says which map it picks for');
  assert.equal(p.container.querySelector('thead th.as-pick-col').textContent, 'Show on the map');
  assert.ok(box(p.container, 'Ana') && box(p.container, 'Dee'), 'a named checkbox per row');
  assert.ok(!p.container.querySelector('tr[aria-selected]'), 'no aria-selected on a plain table row');
  await click(box(p.container, 'Ben'));
  await click(box(p.container, 'Ana'));
  assert.deepEqual(picked(p.container), ['Ana', 'Ben']);
  assert.equal(box(p.container, 'Ben').checked, true);
  const swatches = [...p.container.querySelectorAll('.as-pick-swatch')].map(s => s.style.background);
  assert.equal(swatches.length, 2);
  assert.notEqual(swatches[0], swatches[1], 'each pick its own hue');
  assert.ok(p.text().includes('Clear (2)'));
  // kept by key: a sort and a filter leave them picked
  await click(p.container.querySelectorAll('thead th button.as-sort')[1]);
  await React.act(async () => { const f = p.container.querySelector('input[type="search"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(f, 'e'); f.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepEqual(names(p.container), ['Dee', 'Ben'], 'sorted by visits, filtered to e');
  assert.equal(box(p.container, 'Ben').checked, true, 'Ben stays picked through the sort and the filter');
  await React.act(async () => { const f = p.container.querySelector('input[type="search"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(f, ''); f.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(box(p.container, 'Cy'));
  await click(box(p.container, 'Dee'));
  assert.deepEqual(picked(p.container).sort(), ['Ana', 'Ben', 'Cy']);
  assert.equal(box(p.container, 'Dee').checked, false, 'the fourth past max 3 is refused');
  assert.equal(said(p.container), 'At most 3 at a time; clear one first.');
  // a click on a picked one takes it out
  await click(box(p.container, 'Ana'));
  assert.deepEqual(picked(p.container).sort(), ['Ben', 'Cy']);
  await click([...p.container.querySelectorAll('button')].find(b => b.textContent === 'Clear (2)'));
  assert.deepEqual(picked(p.container), []);
  assert.ok(!p.text().includes('Clear ('));
  await p.unmount();
});

test('Shift with a click picks the range from the last pick; the arrow keys go from one row\'s checkbox to the next (MAY D-15, UX-04)', async () => {
  const p = await page([{ id: 't', component: 'DataTable', columns, rows: '/people', select: { key: 'name', map: 'watch' } }], { people: ROWS });
  await click(box(p.container, 'Ana'));
  await React.act(async () => { box(p.container, 'Dee').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); });
  assert.deepEqual(picked(p.container), ['Ana', 'Ben', 'Cy', 'Dee']);
  // three picks by keyboard in six actions: Tab to the first box, Space, ArrowDown, Space, ArrowDown, Space
  await click(p.container.querySelector('.as-pick-clear'));
  let actions = 0;
  await React.act(async () => { box(p.container, 'Ana').focus(); }); actions++;                 // Tab
  for (const who of ['Ana', 'Ben', 'Cy']) {
    if (who !== 'Ana') { await key(document.activeElement, 'ArrowDown'); actions++; }
    assert.equal(document.activeElement, box(p.container, who), `the focus is on ${who}'s checkbox`);
    await click(document.activeElement); actions++;                                              // Space toggles a checkbox: its click
  }
  assert.deepEqual(picked(p.container), ['Ana', 'Ben', 'Cy']);
  assert.ok(actions <= 6, `three picks in ${actions} actions`);
  await key(document.activeElement, 'ArrowUp');
  assert.equal(document.activeElement, box(p.container, 'Ben'));
  await p.unmount();
});

test('a key that leaves the rows leaves the set, a change of the clearOn column empties it, each said; focus flies the map', async () => {
  const route = (id, lon) => ({ type: 'Feature', id, kind: 'track.route', label: id, geometry: { type: 'LineString', coordinates: [[lon, 53.4], [lon + 0.01, 53.41]] }, properties: {}, style: {}, at: '2026-11-19T10:00:00Z' });
  const p = await page([{ id: 't', component: 'DataTable', columns, rows: '/people', select: { key: 'name', map: 'watch', clearOn: 'team', focus: 'route' } },
    { id: 'watch', component: 'GeoMap', layers: [{ path: '/routes', label: 'Routes' }] }], { people: ROWS, routes: ROWS.map((r, i) => route(r.route, -3 + i / 10)) }, 'people', 'agentspaces-geo');
  for (const who of ['Ana', 'Ben', 'Cy']) await click(box(p.container, who));
  await p.push('/people', ROWS.filter(r => r.name !== 'Ben'));
  assert.deepEqual(picked(p.container), ['Ana', 'Cy']);
  assert.equal(said(p.container), 'Ben is no longer in the table, so no longer shown.');
  await p.push('/people', ROWS.map(r => ({ ...r, team: 'south' })));
  assert.deepEqual(picked(p.container), []);
  assert.equal(said(p.container), 'The picks were cleared: the table now shows south.');
  // the focus button (GEO-D-06 focus): the first column's text, named, selects the row's feature on the map and flies to it
  const go = p.container.querySelector('button[aria-label="Go to Dee on the map"]');
  assert.ok(go && go.textContent === 'Dee', 'the first column is a button');
  await click(go);
  assert.equal(p.container.querySelector('.as-geomap').dataset.selected, 'r-dee');
  await p.unmount();
});

test('the pick set stays in the browser\'s memory: nothing in storage, the address or an action (GEO-M-09)', async () => {
  localStorage.clear(); sessionStorage.clear();
  const href = location.href;
  const p = await page([{ id: 't', component: 'DataTable', columns, rows: '/people', select: { key: 'name', map: 'watch' }, rowAction: 'open' }], { people: ROWS });
  for (const who of ['Ana', 'Ben', 'Dee']) await click(box(p.container, who));
  await click(p.container.querySelector('.as-pick-clear'));
  const stored = [localStorage, sessionStorage].flatMap(s => Array.from({ length: s.length }, (_, i) => s.key(i) + '=' + s.getItem(s.key(i)))).join('\n');
  for (const who of ['Ana', 'Ben', 'Dee']) {
    assert.ok(!stored.includes(who), `${who} is in no storage`);
    assert.ok(!location.href.includes(who), `${who} is not in the address`);
  }
  assert.equal(location.href, href);
  assert.deepEqual(p.actions, [], 'a pick dispatches nothing');
  await p.unmount();
});
