// The split over the WAI-ARIA Window Splitter pattern, by keyboard alone: a separator
// with its role, orientation, value and name; the arrows, Shift, Home and End move it; Enter collapses a pane to its
// rail and the rail opens it; the sizes stay in the browser under the persist key and come back on the next draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { React, ui, mount, draw, envelope, key, click } from './setup.mjs';

const panes = [{ id: 'left', child: 'a', size: 0.25, collapsible: true, label: 'Files' }, { id: 'mid', child: 'b', size: 0.45, label: 'Preview' }, { id: 'right', child: 'c', size: 0.3, collapsible: true, label: 'Chat' }];
const surface = (persist, orientation = 'horizontal') => envelope('s', [{ id: 'main', component: 'Split', orientation, persist, panes },
  { id: 'a', component: 'Text', text: 'tree', inner: true }, { id: 'b', component: 'Text', text: 'preview', inner: true }, { id: 'c', component: 'Text', text: 'chat', inner: true }]);
const parts = container => { const el = container.querySelector('agentspaces-split'); return { el, seps: [...el.shadowRoot.querySelectorAll('[role="separator"]')], rails: [...el.shadowRoot.querySelectorAll('.rail')] }; };

test('each separator is a focusable separator with its value and its name', async () => {
  localStorage.clear();
  const { container, unmount } = await draw(surface(''));
  const { seps } = parts(container);
  assert.equal(seps.length, 2, 'three panes, two separators');
  assert.equal(seps[0].getAttribute('tabindex'), '0');
  assert.equal(seps[0].getAttribute('aria-orientation'), 'vertical', 'side by side panes: a vertical separator');
  assert.equal(seps[0].getAttribute('aria-valuenow'), String(Math.round(0.25 / 0.7 * 100)));
  assert.match(seps[0].getAttribute('aria-label'), /Files and Preview/);
  assert.equal(container.querySelectorAll('[slot^="pane-"]').length, 3, 'the panes are the light DOM children');
  await unmount();
});

test('the arrows, Shift, Home and End move a separator, and Enter collapses a pane to its rail', async () => {
  localStorage.clear();
  const { container, unmount } = await draw(surface('desk'));
  const { el, seps, rails } = parts(container);
  const before = el.paneSizes[0];
  await key(seps[0], 'ArrowRight');
  assert.ok(Math.abs(el.paneSizes[0] - before - 0.05) < 1e-9, 'five percent');
  await key(seps[0], 'ArrowLeft', { shiftKey: true });
  assert.ok(Math.abs(el.paneSizes[0] - before - 0.04) < 1e-9, 'one percent with Shift');
  await key(seps[0], 'Home');
  assert.ok(el.paneSizes[0] < 0.1, 'Home to its floor');
  await key(seps[0], 'End');
  assert.ok(el.paneSizes[1] < 0.1, 'End leaves the next pane its floor');
  assert.ok(Math.abs(el.paneSizes.reduce((a, b) => a + b) - 1) < 1e-9, 'the shares still make the whole');
  await key(seps[0], 'Enter');
  assert.deepEqual(el.paneCollapsed, [true, false, false], 'Enter collapses the pane before it');
  assert.equal(rails[0].getAttribute('aria-expanded'), 'false');
  assert.match(rails[0].getAttribute('aria-label'), /Open Files/);
  await click(rails[0]);
  assert.deepEqual(el.paneCollapsed, [false, false, false], 'the rail opens it');
  await key(seps[1], 'Enter');
  assert.deepEqual(el.paneCollapsed, [false, false, true], 'a pane that does not collapse passes Enter to the one after');
  await unmount();
});

test('the sizes and the collapsed panes stay in the browser and come back', async () => {
  localStorage.clear();
  const first = await draw(surface('kept'));
  const a = parts(first.container);
  await key(a.seps[0], 'ArrowRight');
  await key(a.seps[1], 'Enter');
  const sizes = a.el.paneSizes;
  const stored = JSON.parse(localStorage.getItem('agentspaces-split:s/kept'));
  assert.deepEqual(stored.collapsed, [false, false, true], 'kept under the surface and the persist key');
  await first.unmount();
  const second = await draw(surface('kept'));
  const b = parts(second.container);
  assert.deepEqual(b.el.paneCollapsed, [false, false, true]);
  assert.ok(Math.abs(b.el.paneSizes[0] - sizes[0]) < 1e-3, 'the same share');
  await second.unmount();
  const none = await draw(surface(''));
  assert.deepEqual(parts(none.container).el.paneCollapsed, [false, false, false], 'no persist key keeps nothing');
  await none.unmount();
});

test('kept sizes that are not shares are ignored, so a damaged store never draws a broken split', async () => {
  for (const bad of [{ sizes: [null, 'a', 0.3], collapsed: [false, false, false] }, { sizes: [-1, 0.5, 0.5], collapsed: [false, false, false] }, { sizes: [0, 0, 0], collapsed: [true, true, true] }]) {
    localStorage.clear();
    localStorage.setItem('agentspaces-split:s/damaged', JSON.stringify(bad));
    const { container, unmount } = await draw(surface('damaged'));
    const { el, seps } = parts(container);
    assert.ok(el.paneSizes.every(v => Number.isFinite(v) && v > 0), 'the spec\'s shares: ' + JSON.stringify(el.paneSizes));
    assert.ok(Math.abs(el.paneSizes[0] - 0.25) < 1e-6);
    assert.ok(!seps[0].getAttribute('aria-valuenow').includes('NaN'));
    await unmount();
  }
});

test('a vertical split moves with the up and down arrows', async () => {
  localStorage.clear();
  const { container, unmount } = await draw(surface('', 'vertical'));
  const { el, seps } = parts(container);
  assert.equal(seps[0].getAttribute('aria-orientation'), 'horizontal');
  const before = el.paneSizes[0];
  await key(seps[0], 'ArrowRight');
  assert.equal(el.paneSizes[0], before, 'the side arrows do nothing');
  await key(seps[0], 'ArrowDown');
  assert.ok(el.paneSizes[0] > before);
  await unmount();
});

test('the panes stack below their width', async () => {
  localStorage.clear();
  const { AgentSpacesSplit } = await import('../dist/elements.js');
  const el = document.createElement('agentspaces-split');
  assert.ok(el instanceof HTMLElement);
  el.setAttribute('panes', JSON.stringify(panes.slice(0, 2)));
  el.setAttribute('stack-below', '720');
  el.getBoundingClientRect = () => ({ width: 500, height: 400, top: 0, left: 0, right: 500, bottom: 400 });
  document.body.appendChild(el);
  assert.ok(el.hasAttribute('stacked'), 'narrower than 720: stacked');
  el.getBoundingClientRect = () => ({ width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 });
  el.connectedCallback();
  assert.ok(!el.hasAttribute('stacked'));
  el.remove();
  assert.equal(typeof AgentSpacesSplit, 'function', 'the element alone, for a page without React');
});

// A split whose stack-below arrives after it is connected (a framework that sets attributes after the append) is judged
// at once: no resize may follow to make its ResizeObserver do it.
test('a stack-below set on a connected split stacks it at once', async () => {
  localStorage.clear();
  await import('../dist/elements.js');
  const el = document.createElement('agentspaces-split');
  el.setAttribute('panes', JSON.stringify(panes.slice(0, 2)));
  el.getBoundingClientRect = () => ({ width: 500, height: 400, top: 0, left: 0, right: 500, bottom: 400 });
  document.body.appendChild(el);
  assert.ok(!el.hasAttribute('stacked'), 'no threshold yet: side by side');
  el.setAttribute('stack-below', '720');
  assert.ok(el.hasAttribute('stacked'), 'narrower than the new threshold: stacked without a resize');
  el.setAttribute('stack-below', '0');
  assert.ok(!el.hasAttribute('stacked'), 'a threshold of 0 never stacks');
  el.remove();
});

// The workbench's panes ask 180 + 320 + 300 px side by side, more than the 600 px a narrowed split has. Stacked, each pane
// takes the whole width, so the minimums from the wide layout are cleared, and set again when the split widens.
test('stacking clears the panes\' minimums and widening sets them again', async () => {
  localStorage.clear();
  await import('../dist/elements.js');
  const withMins = [{ id: 'l', size: 0.25, min: 180, collapsible: true, label: 'Files' }, { id: 'm', size: 0.45, min: 320, label: 'Preview' }, { id: 'r', size: 0.3, min: 300, collapsible: true, label: 'Chat' }];
  const el = document.createElement('agentspaces-split');
  el.setAttribute('panes', JSON.stringify(withMins));
  el.setAttribute('stack-below', '720');
  let width = 1200;
  el.getBoundingClientRect = () => ({ width, height: 400, top: 0, left: 0, right: width, bottom: 400 });
  document.body.appendChild(el);
  const mins = () => [...el.shadowRoot.querySelectorAll('.pane')].map(p => p.style.minWidth);
  assert.deepEqual(mins(), ['180px', '320px', '300px'], 'side by side: each pane keeps its minimum');
  width = 600;
  el.stack();   // what the element's ResizeObserver calls when the browser lays the new width out; happy-dom lays nothing out
  assert.ok(el.hasAttribute('stacked'));
  assert.deepEqual(mins(), ['', '', ''], 'stacked: no minimum from the wide layout');
  el.setAttribute('persist', 'other');   // a rebuild while stacked keeps them cleared
  assert.deepEqual(mins(), ['', '', '']);
  width = 1200;
  el.stack();
  assert.ok(!el.hasAttribute('stacked'));
  assert.deepEqual(mins(), ['180px', '320px', '300px'], 'side by side again: the minimums are back');
  el.remove();
});

test('dragging a separator moves it once per frame and keeps the result', async () => {
  localStorage.clear();
  const { container, unmount } = await draw(surface('drag'));
  const { el, seps } = parts(container);
  el.getBoundingClientRect = () => ({ width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 });
  const before = el.paneSizes[0];
  seps[0].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 250, pointerId: 1, bubbles: true }));
  seps[0].dispatchEvent(new PointerEvent('pointermove', { clientX: 350, pointerId: 1, bubbles: true }));
  seps[0].dispatchEvent(new PointerEvent('pointerup', { clientX: 350, pointerId: 1, bubbles: true }));
  assert.ok(Math.abs(el.paneSizes[0] - before - 0.1) < 1e-9, 'a hundred pixels of a thousand');
  assert.ok(localStorage.getItem('agentspaces-split:s/drag'), 'kept on release');
  await unmount();
});

// A host may hand Surfaces the same surface again (createSurface, updateComponents, the model as first drawn) whenever
// one path moves. The split a person narrowed must stay the element it was, with its inline width and the 'stacked' its
// ResizeObserver set: a page check that reads the split again would otherwise meet a new, wide one.
test('the surface sent again leaves the split element, its width and its stacked state alone', async () => {
  localStorage.clear();
  const components = [
    { id: 'root', component: 'Column', children: ['split'] },
    { id: 'split', component: 'Split', persist: 'desk', stackBelow: 720, panes: [{ id: 'l', child: 'tree', size: 0.25, min: 180, collapsible: true, label: 'Files' }, { id: 'm', child: 'preview', size: 0.45, min: 320, label: 'Preview' }, { id: 'r', child: 'chat', size: 0.3, min: 300, collapsible: true, label: 'Chat' }] },
    { id: 'tree', component: 'FileTree', reads: '/files', label: 'Files', preview: 'preview', chat: 'chat', actions: ['ask', 'rename'] },
    { id: 'preview', component: 'FilePreview', file: { '@path': '/selected/file' }, files: '/files' },
    { id: 'chat', component: 'Chat', agent: 'desk', key: 'main', reads: '/conversations', progress: '/progress', files: '/files', attach: true },
  ];
  const page = [
    { version: '1.0', createSurface: { surfaceId: 'desk', catalogId: 'agentspaces-widgets' } },
    { version: '1.0', updateComponents: { surfaceId: 'desk', components } },
    { version: '1.0', updateDataModel: { surfaceId: 'desk', path: '/', value: { files: [], progress: [], conversations: [] } } },
  ];
  const file = i => ({ id: 'f' + i, name: `n${i}.txt`, mediaType: 'text/plain', bytes: 10, root: 'r' + i, by: 'ana', sha256: 'sha256:0' + i });
  let set;
  function Host() { const [env, setEnv] = React.useState(page); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env }); }
  const { container, unmount } = await mount(React.createElement(Host));
  const el = container.querySelector('agentspaces-split');
  const shadow = el.shadowRoot.firstElementChild;
  el.toggle(0);
  el.style.width = '600px';
  el.setAttribute('stacked', '');   // what its ResizeObserver sets in a browser at 600 px; happy-dom lays nothing out
  const written = [];
  new MutationObserver(l => l.forEach(m => written.push(m.attributeName))).observe(el, { attributes: true });
  for (let i = 0; i < 3; i++) {
    await React.act(async () => { set(e => [...e, ...page, { version: '1.0', updateDataModel: { surfaceId: 'desk', path: '/files', value: [file(1), file(i + 2)] } }]); });
    await React.act(async () => { await new Promise(r => setTimeout(r, 10)); });
  }
  const now = container.querySelector('agentspaces-split');
  assert.equal(now, el, 'the same element');
  assert.equal(now.style.width, '600px', 'its inline width kept');
  assert.ok(now.hasAttribute('stacked'), 'still stacked');
  assert.equal(now.shadowRoot.firstElementChild, shadow, 'its panes not built again');
  assert.deepEqual(written, [], 'no attribute written on it');
  assert.deepEqual(now.paneCollapsed, [true, false, false], 'the pane the person folded stays folded');
  assert.equal(container.querySelectorAll('[role="treeitem"]').length, 2, 'the moved path drew');
  await unmount();
});
