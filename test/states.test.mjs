// GEO-Q-31: each component of srad/agentspaces-geo.md (Visualize, GraphView, GeoMap, FeatureCard, FeatureSearch,
// Watchbox, LayerMenu) draws its four golden states so a person tells them apart: the data, none yet, the data not
// arrived yet (busy, for a screen reader too), and a value that does not read (said in words, never a blank). And the
// accessibility fixes the gallery's axe run asked for: a map's layer tables are labelled by their layer's name, not by a
// heading that skips levels, and an action column's header has a name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope, ui } from './setup.mjs';

const NEW = ['Visualize', 'GraphView', 'GeoMap', 'FeatureCard', 'FeatureSearch', 'Watchbox', 'LayerMenu'];

/** What a sighted person reads: the text outside visually hidden and hidden content, and each empty field's placeholder. */
function visibleText(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.as-visually-hidden, [hidden]').forEach(n => n.remove());
  const placeholders = [...copy.querySelectorAll('input, textarea')].filter(i => !i.value).map(i => i.getAttribute('placeholder') ?? '');
  return [copy.textContent ?? '', ...placeholders].join(' ');
}

for (const name of NEW) {
  for (const g of ui.GOLDENS.filter(x => x.name === name)) {
    // a variant's own states end in -empty, -loading or -error (a heatmap's, a hex layer's, a sorted watchbox's); any other
    // variant (picked, lit, a heatmap) is a full one
    const state = /-(empty|loading|error)$/.exec(g.state ?? '')?.[1] ?? (['empty', 'loading', 'error'].includes(g.state) ? g.state : 'full');
    test(`${ui.goldenTitle(g)} draws its state`, async () => {
      const { container, problems, unmount } = await draw(g.envelopes);
      assert.deepEqual(problems, []);
      const own = container.querySelector(`[data-component="${name}"]`);
      assert.ok(own, `${name} is drawn`);
      const busy = own.matches('[aria-busy="true"]') || Boolean(own.querySelector('[aria-busy="true"]'));
      const text = own.textContent ?? '';
      if (state === 'loading') assert.ok(busy, `${name} (loading) is busy for a screen reader`);
      else assert.ok(!busy, `${name} (${g.state}) is not busy`);
      if (state === 'error') assert.ok(text.includes('Unavailable'), `${name} (error) says it: ${text.slice(0, 200)}`);
      else assert.ok(!text.includes('Unavailable'), `${name} (${g.state}) says nothing is unavailable`);
      // and says it where a person sees it, not only to a screen reader
      const seen = visibleText(own);
      if (state === 'error') assert.match(seen, /unavailable/i, `${name} (error) shows it: ${seen.slice(0, 200)}`);
      else assert.doesNotMatch(seen, /unavailable/i, `${name} (${g.state}) shows nothing unavailable`);
      if (state === 'loading') assert.match(seen, /loading/i, `${name} (loading) shows it: ${seen.slice(0, 200)}`);
      else assert.doesNotMatch(seen, /loading/i, `${name} (${g.state}) shows nothing loading`);
      await unmount();
    });
  }
}

test('featuresState: a broken path, then any feature, then a layer still to arrive, then none', () => {
  const layer = (more = {}) => ({ path: '/p', index: 0, color: '#111111', features: [], ...more });
  const f = ui.featureOf({ type: 'Feature', id: 'a', kind: 'k', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {}, at: '2026-11-12T09:00:00Z' });
  assert.equal(ui.featuresState([layer({ broken: true, path: '/ships' }), layer({ features: [f] })]).state, 'error', 'a broken path is said beside features that draw');
  assert.match(ui.featuresState([layer({ broken: true, path: '/ships' })]).text, /features at \/ships do not read as a list/);
  assert.equal(ui.featuresState([layer({ pending: true }), layer({ features: [f] })]).state, 'full');
  assert.equal(ui.featuresState([layer({ pending: true }), layer()]).state, 'loading');
  assert.equal(ui.featuresState([layer(), layer()]).state, 'empty');
  assert.equal(ui.featuresState([]).state, 'empty');
  const [pending, broken, empty] = ui.featureLayers([{ path: '/a' }, { path: '/b' }, { path: '/c' }], p => ({ '/b': 'not a list', '/c': [] })[p], ['#111111']);
  assert.ok(pending.pending && !pending.broken);
  assert.ok(broken.broken && !broken.pending);
  assert.ok(!empty.pending && !empty.broken);
});

test('a GeoMap\'s layer tables are labelled by the layer, with no heading in the table view', async () => {
  const g = ui.GOLDENS.find(x => x.name === 'GeoMap' && x.state === 'full');
  const { container, unmount } = await draw(g.envelopes);
  const view = container.querySelector('[data-component="GeoMap"] .table-view');
  assert.ok(view, 'the table view draws where the map cannot');
  assert.equal(view.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]'), null);
  const tables = [...view.querySelectorAll('table')];
  assert.ok(tables.length >= 2);
  for (const t of tables) {
    const label = container.querySelector(`[id="${t.getAttribute('aria-labelledby')}"]`);
    assert.ok(label && label.classList.contains('layer-title'), 'each table names its layer');
  }
  await unmount();
});

test('the Map\'s layer tables and a DataTable name their action column', async () => {
  const map = ui.GOLDENS.find(x => x.name === 'Map');
  const m = await draw(map.envelopes);
  assert.equal(m.container.querySelector('[data-component="Map"] .table-view :is(h1, h2, h3, h4, h5, h6)'), null, 'no heading in the table view');
  const heads = [...m.container.querySelectorAll('[data-component="Map"] .table-view th')];
  assert.ok(heads.length, 'the rows are listed where the map cannot draw');
  for (const th of heads) assert.notEqual(th.textContent.trim(), '', 'every header cell has a name');
  assert.ok(heads.some(th => th.querySelector('.as-visually-hidden')?.textContent === 'Action'), 'the action column, named for a screen reader alone');
  await m.unmount();
  const t = await draw(envelope('dt', [{ id: 't', component: 'DataTable', columns: [{ key: 'id', title: 'Claim' }], rows: '/rows', rowAction: 'open' }], { rows: [{ id: 'C-1' }] }));
  const ths = [...t.container.querySelectorAll('[data-component="DataTable"] th')];
  assert.deepEqual(ths.map(th => th.textContent), ['Claim', 'Action']);
  assert.equal(ths[1].querySelector('.as-visually-hidden').textContent, 'Action');
  await t.unmount();
});

test('a KeyValue\'s and a Notification group\'s titles are h3, one level under a page\'s section', async () => {
  const kv = ui.GOLDENS.find(x => x.name === 'KeyValue');
  const k = await draw(kv.envelopes);
  assert.equal(k.container.querySelector('[data-component="KeyValue"] h3')?.textContent, 'The desk');
  assert.equal(k.container.querySelector('[data-component="KeyValue"] h4'), null);
  await k.unmount();
  const n = await draw(envelope('nt', [{ id: 'n', component: 'Notification', items: '/incidents', groupBy: 'group' }],
    { incidents: [{ id: 'i1', severity: 'serious', title: 'one', at: '2026-11-06T09:00:00Z', group: 'claims' }, { id: 'i2', severity: 'warning', title: 'two', at: '2026-11-06T09:01:00Z', group: 'claims' }] }));
  assert.equal(n.container.querySelector('.bma-notification-group > h3')?.textContent, 'group claims · 2');
  assert.equal(n.container.querySelector('h4'), null);
  await n.unmount();
});

test('a FeatureSearch over a map with one broken layer and one that draws shows the error, not the full look', async () => {
  const full = ui.GOLDENS.find(x => x.name === 'FeatureSearch' && x.state === 'full');
  const error = ui.GOLDENS.find(x => x.name === 'FeatureSearch' && x.state === 'error');
  const a = await draw(full.envelopes);
  const fullBox = a.container.querySelector('[data-component="FeatureSearch"]');
  const fullLook = { state: fullBox.dataset.state, placeholder: fullBox.querySelector('input').getAttribute('placeholder') };
  await a.unmount();
  const b = await draw(error.envelopes);
  const box = b.container.querySelector('[data-component="FeatureSearch"]');
  const input = box.querySelector('input');
  assert.equal(fullLook.state, 'full');
  assert.equal(fullLook.placeholder, 'Search the map');
  assert.equal(box.dataset.state, 'error', 'the box carries the state its border is drawn from');
  assert.equal(input.getAttribute('placeholder'), 'Search the map (some unavailable)');
  assert.equal(b.container.querySelector('label').textContent, 'Search the map', 'the field keeps its name');
  assert.match(b.container.querySelector(`[id="${input.getAttribute('aria-describedby')}"]`).textContent, /features at \/ships do not read as a list/);
  await b.unmount();
});
