// The surfaces of one app as pages: tabs or a rail with the current page in the URL fragment, the
// arrows between them, every page still mounted; or whole surfaces in the panes of a split; or stacked, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, key, click, React, ui } from './setup.mjs';

const render = id => React.createElement('p', { 'data-surface': id }, 'surface ' + id);
const pages = [{ page: 'claims', title: 'Claims', icon: 'list' }, { page: 'chat', title: 'Ask' }];

test('tabs draw one page at a time, keep every page mounted, and ride the fragment', async () => {
  history.replaceState(null, '', '#page=chat');
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['claims', 'chat', 'extra'], render, navigation: { kind: 'tabs', pages } }));
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map(t => t.getAttribute('aria-selected')), ['false', 'true'], 'the fragment chose the page');
  assert.equal(container.querySelector('[data-page="claims"]').hidden, true);
  assert.equal(container.querySelector('[data-page="chat"]').hidden, false);
  assert.ok(container.querySelector('[data-surface="claims"]'), 'a hidden page stays mounted');
  assert.ok(container.querySelector('[data-surface="extra"]'), 'a surface no page names stays below');
  await key(tabs[1], 'ArrowRight');
  assert.equal(location.hash, '#page=claims', 'the arrows wrap and set the fragment');
  assert.equal(document.activeElement, container.querySelectorAll('[role="tab"]')[0]);
  assert.equal(container.querySelector('[role="tabpanel"]:not([hidden])').dataset.page, 'claims');
  await key(document.activeElement, 'End');
  assert.equal(location.hash, '#page=chat');
  await unmount();
});

test('a rail marks the current page and moves with the up and down arrows', async () => {
  history.replaceState(null, '', '#');
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['claims', 'chat'], render, navigation: { kind: 'rail', pages } }));
  const links = [...container.querySelectorAll('nav a')];
  assert.equal(links[0].getAttribute('aria-current'), 'page', 'the first page without a fragment');
  await click(links[1]);
  assert.equal(container.querySelectorAll('nav a')[1].getAttribute('aria-current'), 'page');
  await key(container.querySelectorAll('nav a')[1], 'ArrowDown');
  assert.equal(location.hash, '#page=claims');
  assert.equal(ui.currentPage(pages, 'nothing'), 'claims');
  await unmount();
});

test('a layout places whole surfaces in the panes of a split; with neither key they stack', async () => {
  const split = await mount(React.createElement(ui.Pages, { surfaces: ['claims', 'chat'], render, persist: 'desk',
    layout: { kind: 'split', panes: [{ page: 'claims', size: 0.7, min: 400 }, { page: 'chat', size: 0.3, collapsible: true }] }, navigation: { kind: 'tabs', pages } }));
  const el = split.container.querySelector('agentspaces-split');
  assert.ok(el, 'the layout takes the page when both are set');
  assert.equal(split.container.querySelectorAll('[slot^="pane-"] [data-surface]').length, 2);
  assert.equal(split.container.querySelector('[role="tab"]'), null);
  await split.unmount();
  const stacked = await mount(React.createElement(ui.Pages, { surfaces: ['claims', 'chat'], render }));
  assert.equal(stacked.container.querySelectorAll('.as-page-stacked').length, 2);
  await stacked.unmount();
});
