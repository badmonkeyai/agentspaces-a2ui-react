// A surface names one catalog. A page may hold the app's list of catalogs (its AppCard's): a surface on another is
// refused, as the feed refuses it. A catalog this renderer does not hold is loaded on demand from its document: the
// surface waits, then draws with the basic components; the document brings no code, so a component it declares that
// nothing here implements is left out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, React, ui } from './setup.mjs';

const BASIC = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
const surface = (sid, catalogId, components) => [
  { version: '1.0', createSurface: { surfaceId: sid, catalogId } },
  { version: '1.0', updateComponents: { surfaceId: sid, components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
];

async function page(envelopes, props) {
  const problems = [];
  const m = await mount(React.createElement(ui.Surfaces, { envelopes, onProblem: p => problems.push(p), ...props }));
  await React.act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return { ...m, problems };
}

test('a surface on a catalog the app does not name is refused; the basic catalog always draws', async () => {
  const { container, problems } = await page([
    ...surface('a', 'agentspaces-widgets', [{ id: 't', component: 'Text', text: 'widgets surface' }]),
    ...surface('b', BASIC, [{ id: 't2', component: 'Text', text: 'basic surface' }]),
  ], { allowedCatalogs: ['agentspaces-viz'] });
  assert.doesNotMatch(container.textContent, /widgets surface/);
  assert.match(container.textContent, /basic surface/);
  assert.ok(problems.some(p => /agentspaces-widgets, which this app does not name/.test(p)), problems.join(' | '));
});

test('a catalog this renderer does not hold loads on demand; what it declares without code here is left out', async () => {
  const asked = [];
  const doc = { catalogId: 'https://example.com/ext/catalog.json', components: { Gauge: { type: 'object', properties: { component: { const: 'Gauge' }, value: { type: 'number' } }, required: ['component'] } }, functions: {} };
  const { container, problems } = await page(surface('x', doc.catalogId, [{ id: 't', component: 'Text', text: 'drawn after the load' }, { id: 'g', component: 'Gauge', value: 3 }]),
    { loadCatalog: async id => { asked.push(id); return doc; } });
  assert.deepEqual(asked, [doc.catalogId]);
  assert.match(container.textContent, /drawn after the load/);
  assert.ok(problems.some(p => /unknown component Gauge/.test(p)), problems.join(' | '));
});

test('a catalog that does not load leaves its surface undrawn, and says why', async () => {
  const { container, problems } = await page(surface('y', 'https://example.com/missing.json', [{ id: 't', component: 'Text', text: 'never drawn' }]),
    { loadCatalog: async () => undefined });
  assert.doesNotMatch(container.textContent, /never drawn/);
  assert.ok(problems.some(p => /did not load/.test(p)), problems.join(' | '));
});
