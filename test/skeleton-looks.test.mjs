// A component may declare a skeleton (A2UI 1.0 @metadata, extension "skeleton"): it shows, busy, until the surface's
// data arrives, then the component draws. One surface draws in several looks at once, each its own, from the same
// messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, React, ui } from './setup.mjs';

const create = { version: '1.0', createSurface: { surfaceId: 'k', catalogId: 'agentspaces-viz' } };
const comps = { version: '1.0', updateComponents: { surfaceId: 'k', components: [
  { id: 'root', component: 'Column', children: ['open'] },
  { id: 'open', component: 'Stat', label: 'Open orders', value: '/open', '@metadata': { extensions: { skeleton: 'card' } } },
] } };
const data = { version: '1.0', updateDataModel: { surfaceId: 'k', path: '/', value: { open: 7 } } };

test('a declared skeleton shows, busy and named, until the data arrives; then the component draws', async () => {
  let set;
  function Host() { const [env, s] = React.useState([create, comps]); set = s; return React.createElement(ui.Surfaces, { envelopes: env }); }
  const { container } = await mount(React.createElement(Host));
  const sk = container.querySelector('.as-skeleton');
  assert.ok(sk, 'the skeleton is drawn: ' + container.innerHTML.slice(0, 300));
  assert.equal(sk.getAttribute('aria-busy'), 'true');
  assert.equal(sk.dataset.skeleton, 'card');
  assert.match(sk.textContent, /Loading/);
  assert.equal(container.querySelector('.bma-stat'), null);
  await React.act(async () => { set(e => [...e, data]); });
  assert.equal(container.querySelector('.as-skeleton'), null);
  assert.match(container.querySelector('.bma-stat').textContent, /7/);
  assert.equal(ui.skeletonOf({ extensions: { skeleton: 'rows' } }), 'rows');
  assert.equal(ui.skeletonOf(undefined), undefined);
});

test('one surface in two looks at once, each named, from the same messages', async () => {
  const { container } = await mount(React.createElement(ui.SurfacesInLooks, { envelopes: [create, comps, data],
    looks: [{ label: 'Day', look: ui.DEFAULT_LOOK, mode: 'light' }, { label: 'Night', look: ui.DEFAULT_LOOK, mode: 'dark' }] }));
  const group = container.querySelector('[role=group].as-looks');
  assert.ok(group);
  assert.deepEqual([...group.querySelectorAll('figcaption')].map(f => f.textContent), ['Day', 'Night']);
  const stats = [...group.querySelectorAll('.bma-stat')];
  assert.equal(stats.length, 2);
  assert.ok(stats.every(s => /7/.test(s.textContent)));
  assert.deepEqual([...group.querySelectorAll('.bma-look')].map(l => l.dataset.mode), ['light', 'dark']);
});
