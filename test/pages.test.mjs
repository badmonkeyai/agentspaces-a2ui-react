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

test('a conversation: one bar with the title and the areas, the chat on the left, the current area on the right', async () => {
  // the standard page of the advanced apps (2026-11-11)
  history.replaceState(null, '', '#page=graph');
  const layout = { kind: 'conversation', chat: 'chat', size: 0.4, areas: [{ page: 'documents', label: 'Documents', icon: 'list' }, { page: 'graph', label: 'Graph' }] };
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['documents', 'chat', 'graph', 'extra'], render, layout, title: 'Graph RAG desk', lede: 'Drop a document.' }));
  const bar = container.querySelector('.as-conversation-bar');
  assert.ok(bar, 'the top bar');
  assert.match(bar.textContent, /Graph RAG desk/);
  assert.match(bar.textContent, /Drop a document\./, 'the lede rides in the bar');
  const body = container.querySelector('.as-conversation-body');
  assert.equal(body.children[0].dataset.page, 'chat', 'the chat is the left half');
  assert.ok(body.children[0].querySelector('[data-surface="chat"]'));
  assert.equal(container.querySelector('.as-conversation').style.getPropertyValue('--as-chat-size'), '40%');
  const tabs = [...bar.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map(t => t.textContent), ['Documents', 'Graph'], 'the areas are menu items in the bar');
  assert.deepEqual(tabs.map(t => t.getAttribute('aria-selected')), ['false', 'true'], 'the fragment chose the area');
  assert.equal(container.querySelector('[data-page="documents"]').hidden, true);
  assert.ok(container.querySelector('[data-surface="documents"]'), 'a hidden area stays mounted');
  await key(tabs[1], 'ArrowRight');
  assert.equal(location.hash, '#page=documents', 'the arrows move between the areas and set the fragment');
  assert.equal(container.querySelector('[data-page="documents"]').hidden, false);
  assert.ok(container.querySelector('.as-conversation-chat [data-surface="chat"]'), 'the chat stays across areas');
  assert.ok(container.querySelector('.as-conversation-area [data-surface="extra"]'), 'a surface no area names stays on the right, below');
  await unmount();
});

test('a conversation with one area draws no tabs, and a size out of range falls back to 40%', async () => {
  history.replaceState(null, '', '#');
  const { container, unmount } = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk',
    layout: { kind: 'conversation', chat: 'chat', size: 0.9, areas: [{ page: 'desk', label: 'Desk' }] } }));
  assert.equal(container.querySelector('[role="tab"]'), null);
  assert.equal(container.querySelector('.as-conversation').style.getPropertyValue('--as-chat-size'), '40%');
  assert.equal(container.querySelector('[data-page="desk"]').hidden, false);
  await unmount();
});

test('a conversation draws its kicker above the title in the bar, and nothing without one', async () => {
  history.replaceState(null, '', '#');
  const layout = { kind: 'conversation', chat: 'chat', kicker: 'Operations', areas: [{ page: 'desk', label: 'Desk' }] };
  const withKicker = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk', layout }));
  const title = withKicker.container.querySelector('.as-conversation-title');
  const kicker = title.querySelector('small.as-kicker');
  assert.equal(kicker?.textContent, 'Operations');
  assert.equal(kicker.nextElementSibling.tagName, 'H1', 'right above the title');
  assert.equal(title.querySelector('h1').textContent, 'Desk', 'the title is as it was, the page\'s h1 (D-F11)');
  assert.equal(withKicker.container.querySelectorAll('h1').length, 1, 'one h1');
  await withKicker.unmount();
  for (const k of [undefined, '  ']) {
    const plain = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk', layout: { ...layout, kicker: k } }));
    assert.equal(plain.container.querySelector('.as-kicker'), null, `no kicker for ${JSON.stringify(k)}`);
    await plain.unmount();
  }
});

test('a conversation draws its banner at the very top and the very foot, read once, and nothing without one', async () => {
  // AF-18: one line of plain text above the bar and under the body; the foot copy is hidden from a
  // screen reader so the words are read once, at the top, as a note
  history.replaceState(null, '', '#');
  const layout = { kind: 'conversation', chat: 'chat', kicker: 'Operations', banner: 'Internal use only | Do not forward', areas: [{ page: 'desk', label: 'Desk' }] };
  const page = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk', layout }));
  const root = page.container.querySelector('.as-conversation');
  const banners = [...root.querySelectorAll('.as-banner')];
  assert.equal(banners.length, 2, 'at the top and at the foot');
  assert.equal(root.firstElementChild, banners[0], 'the very top, above the bar');
  assert.equal(banners[0].nextElementSibling.tagName, 'HEADER');
  assert.equal(root.lastElementChild, banners[1], 'the very foot, under the chat and the areas');
  assert.deepEqual(banners.map(b => b.textContent), ['Internal use only | Do not forward', 'Internal use only | Do not forward']);
  assert.equal(banners[0].getAttribute('role'), 'note', 'a screen reader reads the top one as a note');
  assert.equal(banners[0].getAttribute('aria-hidden'), null);
  assert.equal(banners[1].getAttribute('aria-hidden'), 'true', 'and not the foot copy');
  assert.equal(banners[1].getAttribute('role'), null);
  assert.equal(root.querySelector('.as-kicker').textContent, 'Operations', 'the kicker is as it was');
  await page.unmount();
  for (const banner of [undefined, '', '   ', 42]) {
    const plain = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk', layout: { ...layout, banner } }));
    assert.equal(plain.container.querySelector('.as-banner'), null, `nothing for ${JSON.stringify(banner)}`);
    await plain.unmount();
  }
  // plain text, one line: markup is text, a line break is a space, and a line past 120 characters is cut
  const odd = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk',
    layout: { ...layout, banner: '<b>Internal</b>\nuse only' } }));
  assert.equal(odd.container.querySelector('.as-banner b'), null, 'no markup');
  assert.equal(odd.container.querySelector('.as-banner').textContent, '<b>Internal</b> use only');
  await odd.unmount();
  const controls = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk',
    layout: { ...layout, banner: 'Internal\u0085use\u0007only\u2028here' } }));
  assert.equal(controls.container.querySelector('.as-banner').textContent, 'Internal use only here', 'a NEL, a bell and a line separator are spaces');
  await controls.unmount();
  const long = await mount(React.createElement(ui.Pages, { surfaces: ['chat', 'desk'], render, title: 'Desk', layout: { ...layout, banner: 'x'.repeat(130) } }));
  assert.equal(long.container.querySelector('.as-banner').textContent.length, ui.BANNER_MAX);
  assert.ok(long.container.querySelector('.as-banner').textContent.endsWith('…'));
  await long.unmount();
});
