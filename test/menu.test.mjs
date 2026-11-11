// The Menu over the WAI-ARIA Menu Button and Menu patterns, by keyboard alone, and each item's
// action in the spec's shape: open from the trigger, move with the arrows, Home, End and a first letter, run with
// Enter, leave with Escape (focus back on the trigger), one level of submenu, groups apart, checked and disabled
// items, shortcuts, and a context menu that opens on its row from the keyboard as well as the pointer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope, key, click, React } from './setup.mjs';

const items = [
  { id: 'new-chat', label: 'New chat', shortcut: 'Ctrl+Shift+O', action: { name: 'chat.new' } },
  { id: 'dark', label: 'Dark mode', checked: { path: '/view/dark' }, action: { name: 'view.dark' } },
  { id: 'export', label: 'Export', disabled: true, action: { name: 'export' } },
  { id: 'share', label: 'Share', items: [{ id: 'copy-link', label: 'Copy link', action: { name: 'share.link' } }, { id: 'email', label: 'Email', action: { name: 'share.email' } }] },
  { id: 'help', label: 'Help', group: 'about', action: { name: 'help' } },
];
const menu = (trigger = { kind: 'button', label: 'Actions' }) => envelope('s', [{ id: 'menu', component: 'Menu', trigger, items }], { view: { dark: false } });
const focused = () => document.activeElement;

test('the trigger opens the menu and the arrows, Home, End and a letter move the focus', async () => {
  const { container, unmount } = await draw(menu());
  const button = container.querySelector('button[aria-haspopup="menu"]');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  await key(button, 'ArrowDown');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  const list = container.querySelector('[role="menu"]');
  assert.equal(button.getAttribute('aria-controls'), list.id, 'the trigger controls the menu');
  assert.equal(focused().textContent.includes('New chat'), true, 'the first item');
  await key(focused(), 'ArrowUp');
  assert.ok(focused().textContent.includes('Help'), 'ArrowUp wraps to the last');
  await key(focused(), 'Home');
  assert.ok(focused().textContent.includes('New chat'));
  await key(focused(), 'End');
  assert.ok(focused().textContent.includes('Help'));
  await key(focused(), 's');
  assert.ok(focused().textContent.includes('Share'), 'a first letter');
  await key(focused(), 'Escape');
  assert.equal(container.querySelector('[role="menu"]'), null, 'Escape closes');
  assert.equal(focused(), button, 'and returns the focus to the trigger');
  await key(button, 'ArrowUp');
  assert.ok(focused().textContent.includes('Help'), 'ArrowUp on the trigger opens on the last');
  await unmount();
});

test('the items have their roles, the groups a separator, the shortcut its keys', async () => {
  const { container, unmount } = await draw(menu());
  await click(container.querySelector('button[aria-haspopup="menu"]'));
  const roles = [...container.querySelectorAll('[role="menu"] > li')].map(li => li.getAttribute('role'));
  assert.deepEqual(roles, ['menuitem', 'menuitemcheckbox', 'menuitem', 'menuitem', 'separator', 'menuitem'], 'the about group after a separator');
  const dark = container.querySelector('[role="menuitemcheckbox"]');
  assert.equal(dark.getAttribute('aria-checked'), 'false', 'checked from the data model');
  assert.equal(container.querySelector('[aria-disabled="true"]').textContent.includes('Export'), true);
  assert.equal(container.querySelector('[aria-keyshortcuts]').getAttribute('aria-keyshortcuts'), 'Control+Shift+O');
  assert.equal(container.querySelector('[aria-haspopup="menu"][role="menuitem"]').textContent.includes('Share'), true);
  await unmount();
});

test('Enter runs an item with its id, a checked item says what it turns to, a disabled one does nothing', async () => {
  const { container, actions, unmount } = await draw(menu());
  const button = container.querySelector('button[aria-haspopup="menu"]');
  await key(button, 'ArrowDown');
  await key(focused(), 'Enter');
  assert.equal(actions.at(-1).name, 'chat.new');
  assert.deepEqual(actions.at(-1).context, { id: 'new-chat' });
  assert.equal(actions.at(-1).sourceComponentId, 'menu');
  assert.equal(container.querySelector('[role="menu"]'), null, 'running an item closes the menu');
  assert.equal(focused(), button);
  await key(button, 'ArrowDown');
  await key(focused(), 'ArrowDown');
  await key(focused(), ' ');
  assert.deepEqual(actions.at(-1).context, { id: 'dark', checked: true });
  await key(button, 'ArrowDown');
  await key(focused(), 'ArrowDown');
  await key(focused(), 'ArrowDown');
  const count = actions.length;
  await key(focused(), 'Enter');
  assert.equal(actions.length, count, 'Export is disabled');
  await key(focused(), 'Escape');
  await key(button, 'ArrowDown');
  await key(focused(), 'o', { ctrlKey: true, shiftKey: true });
  assert.equal(actions.at(-1).name, 'chat.new', 'the shortcut runs its item while the menu is open');
  await unmount();
});

test('one level of submenu opens with ArrowRight and closes with ArrowLeft', async () => {
  const { container, actions, unmount } = await draw(menu());
  await key(container.querySelector('button[aria-haspopup="menu"]'), 'ArrowDown');
  await key(focused(), 's');
  await key(focused(), 'ArrowRight');
  assert.ok(focused().textContent.includes('Copy link'), 'the submenu has the focus');
  assert.equal(container.querySelectorAll('[role="menu"]').length, 2);
  await key(focused(), 'Escape');
  assert.equal(container.querySelectorAll('[role="menu"]').length, 1, 'Escape closes the submenu alone');
  assert.ok(focused().textContent.includes('Share'), 'the focus is on its item again');
  await key(focused(), 'ArrowRight');
  await key(focused(), 'ArrowLeft');
  assert.equal(container.querySelectorAll('[role="menu"]').length, 1, 'ArrowLeft closes the submenu');
  assert.ok(focused().textContent.includes('Share'));
  await key(focused(), 'ArrowLeft');
  assert.equal(container.querySelectorAll('[role="menu"]').length, 1, 'ArrowLeft in the top menu keeps it open');
  await key(focused(), 'Enter');
  await key(focused(), 'ArrowDown');
  await key(focused(), 'Enter');
  assert.equal(actions.at(-1).name, 'share.email');
  assert.equal(container.querySelector('[role="menu"]'), null, 'running a submenu item closes the whole menu');
  assert.equal(focused(), container.querySelector('button[aria-haspopup="menu"]'), 'and returns the focus to the trigger');
  await unmount();
});

test('an overflow has an accessible name, and a context menu opens on its row by pointer or by keyboard', async () => {
  const overflow = await draw(menu({ kind: 'overflow', label: 'More' }));
  const b = overflow.container.querySelector('button[aria-haspopup="menu"]');
  assert.equal(b.getAttribute('aria-label'), 'More');
  await overflow.unmount();
  const ctx = await draw(menu({ kind: 'context', label: 'File actions' }));
  const row = ctx.container.querySelector('.as-menu').parentElement;
  await React.act(async () => { row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 })); });
  assert.ok(ctx.container.querySelector('[role="menu"]'), 'a right press on the row');
  await key(focused(), 'Escape');
  await key(row, 'F10', { shiftKey: true });
  assert.ok(ctx.container.querySelector('[role="menu"]'), 'Shift+F10 on the row');
  await ctx.unmount();
});
