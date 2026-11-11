// The TitleBar's status in the A2A words, its actions, its menu; the page's one bar;
// the command palette over the bar's actions and the page's menus; the Window's header actions and the Toolbar's menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope, key, click, mount, React, ui } from './setup.mjs';

const bar = (rows, labels) => envelope('s', [
  { id: 'bar', component: 'TitleBar', title: 'Workbench', subtitle: 'Claims desk', icon: 'briefcase', status: { from: '/working', labels }, menu: 'bar-menu',
    actions: [{ id: 'share', label: 'Share', icon: 'share', action: { name: 'share' } }] },
  { id: 'bar-menu', component: 'Menu', trigger: { kind: 'overflow', label: 'More' }, items: [{ id: 'help', label: 'Help', action: { name: 'help' } }], inner: true },
], { working: rows });

test('the status reads the WorkingOn rows in the A2A words', () => {
  assert.equal(ui.statusOf([]), 'idle');
  assert.equal(ui.statusOf([{ state: 'completed' }, { state: 'working' }]), 'working');
  assert.equal(ui.statusOf([{ state: 'submitted' }]), 'working');
  assert.equal(ui.statusOf([{ state: 'failed' }, { state: 'input-required' }]), 'failed');
  assert.equal(ui.statusOf([{ state: 'input-required' }]), 'input');
  assert.equal(ui.statusOf([{ state: 'canceled' }]), 'idle');
});

test('the bar names the app, says its status politely, runs its actions, and draws its menu', async () => {
  const { container, actions, text, unmount } = await draw(bar([{ agent: 'w', state: 'input-required' }]));
  assert.ok(text().includes('Workbench') && text().includes('Claims desk'));
  const status = container.querySelector('[role="status"]');
  assert.equal(status.textContent, 'Needs your input', 'the default label');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(container.querySelector('[role="heading"]').getAttribute('aria-level'), '1');
  await click([...container.querySelectorAll('button')].find(b => b.textContent.includes('Share')));
  assert.equal(actions.at(-1).name, 'share');
  assert.deepEqual(actions.at(-1).context, { id: 'share' });
  assert.ok(container.querySelector('.as-titlebar [data-component="Menu"]'), 'the menu as its overflow');
  await unmount();
  const own = await draw(bar([{ state: 'working' }], { working: 'Agent working' }));
  assert.equal(own.container.querySelector('[role="status"]').textContent, 'Agent working', 'the design\'s label');
  await own.unmount();
});

test('the first bar on a page claims the page\'s bar and shows the page\'s tools', async () => {
  let claimed;
  function Page() {
    const tools = React.createElement('button', { type: 'button', id: 'sign-out' }, 'Sign out');
    const f = ui.useFrameProvider(tools);
    claimed = f.claimed;
    return React.createElement(ui.FrameContext.Provider, { value: f.frame },
      f.claimed ? null : React.createElement('header', { id: 'chrome' }, 'Page title'),
      React.createElement(ui.Surfaces, { envelopes: [...bar([]), { version: 'v0.9.1', createSurface: { surfaceId: 't', catalogId: 'agentspaces-viz' } },
        { version: 'v0.9.1', updateComponents: { surfaceId: 't', components: [{ id: 'root', component: 'Column', children: ['b2'] }, { id: 'b2', component: 'TitleBar', title: 'Second' }] } }] }));
  }
  const { container, unmount } = await mount(React.createElement(Page));
  assert.equal(claimed, true);
  assert.equal(container.querySelector('#chrome'), null, 'the page draws no bar of its own');
  assert.equal(container.querySelectorAll('#sign-out').length, 1, 'the tools sit in one bar');
  assert.ok(container.querySelector('[data-holds-page-bar] #sign-out'), 'in the first TitleBar');
  await unmount();
});

test('Ctrl+K opens the palette over the bar\'s actions and the menus; Enter runs one; Escape leaves', async () => {
  const { container, actions, unmount } = await draw(bar([]), { wrap: s => React.createElement(React.Fragment, null, s, React.createElement(ui.CommandPalette)) });
  assert.equal(ui.opensPalette({ key: 'k', ctrlKey: true, metaKey: false, altKey: false }), true);
  assert.equal(ui.opensPalette({ key: 'k', ctrlKey: false, metaKey: true, altKey: false }), true, 'Cmd on a Mac');
  assert.deepEqual(ui.commands().map(c => c.label).sort(), ['Help', 'Share']);
  await key(document.body, 'k', { ctrlKey: true });
  const dialog = container.querySelector('[role="dialog"]');
  assert.ok(dialog, 'the palette');
  const input = dialog.querySelector('[role="combobox"]');
  assert.equal(document.activeElement, input);
  await React.act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'hel'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepEqual([...dialog.querySelectorAll('[role="option"]')].map(o => o.textContent.split(' ')[0]), ['Help']);
  await key(input, 'Enter');
  assert.equal(actions.at(-1).name, 'help');
  assert.equal(container.querySelector('[role="dialog"]'), null);
  await key(document.body, 'K', { metaKey: true });
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  await React.act(async () => { container.querySelector('[role="combobox"]').dispatchEvent(tab); });
  assert.equal(tab.defaultPrevented, true, 'Tab stays inside the modal dialog');
  assert.equal(document.activeElement, container.querySelector('[role="combobox"]'));
  await key(container.querySelector('[role="combobox"]'), 'Escape');
  assert.equal(container.querySelector('[role="dialog"]'), null, 'Escape closes');
  assert.deepEqual(ui.filterCommands([{ id: 'a', label: 'New chat', where: 'More', run() {} }], 'chat more').length, 1);
  await unmount();
  assert.deepEqual(ui.commands(), [], 'a component that leaves takes its commands with it');
});

test('a window has its actions in its header and a toolbar its menu', async () => {
  const { container, actions, unmount } = await draw(envelope('s', [
    { id: 'box', component: 'Window', title: 'truck-7 left Depot North', child: 'note', actions: [{ id: 'ack', label: 'Acknowledge', action: { name: 'acknowledge', context: { alert: 'a-1' } } }] },
    { id: 'note', component: 'Text', text: 'Outside its area', inner: true },
    { id: 'tools', component: 'Toolbar', title: 'Desk', actions: [{ label: 'Refresh', action: 'refresh' }], menu: 'tools-menu' },
    { id: 'tools-menu', component: 'Menu', trigger: { kind: 'overflow', label: 'More tools' }, items: [{ id: 'x', label: 'Export', action: { name: 'export' } }], inner: true },
  ]));
  const head = container.querySelector('.bma-window .head');
  const ack = [...head.querySelectorAll('button')].find(b => b.textContent === 'Acknowledge');
  assert.ok(ack, 'in the header');
  await click(ack);
  assert.deepEqual(actions.at(-1).context, { id: 'ack', alert: 'a-1' });
  assert.ok(container.querySelector('[role="toolbar"] [data-component="Menu"]'));
  await unmount();
});
