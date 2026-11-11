// The split over the WAI-ARIA Window Splitter pattern, by keyboard alone: a separator
// with its role, orientation, value and name; the arrows, Shift, Home and End move it; Enter collapses a pane to its
// rail and the rail opens it; the sizes stay in the browser under the persist key and come back on the next draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope, key, click } from './setup.mjs';

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
