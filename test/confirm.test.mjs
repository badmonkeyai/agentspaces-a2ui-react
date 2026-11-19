// A Toolbar action with confirm asks first: a modal dialog with its title, its question
// (literal, or from a data model path as Notice's text takes), the no button focused; Escape and no dispatch nothing and
// hand the focus back to the action's button; yes dispatches the action with its context. An action without confirm
// dispatches at once, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope, key, click } from './setup.mjs';

const bar = confirm => envelope('tb', [{ id: 'bar', component: 'Toolbar', title: 'Desk', actions: [{ label: 'Refresh', action: 'refresh' },
  { label: 'Clear the list', action: 'list.clear', context: { all: true }, confirm }] }], { prompt: 'Clear all 19 rows? A new upload brings them back.' });
const button = (c, words) => [...c.querySelectorAll('button')].find(b => b.textContent === words);

test('a confirm opens a modal with the no button focused; Escape and Cancel dispatch nothing and give the focus back', async () => {
  const p = await draw(bar({ title: 'Clear the list', text: 'Clear every row of the list?', yes: 'Clear', no: 'Cancel' }));
  await click(button(p.container, 'Refresh'));
  assert.equal(p.actions.at(-1).name, 'refresh', 'an action without confirm dispatches at once');
  const ask = button(p.container, 'Clear the list');
  assert.equal(ask.getAttribute('aria-haspopup'), 'dialog');
  await click(ask);
  const dialog = p.container.querySelector('[role="dialog"]');
  assert.ok(dialog, 'the dialog opened');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  const title = [...dialog.querySelectorAll('[id]')].find(e => e.id === dialog.getAttribute('aria-labelledby'));
  assert.equal(title?.textContent, 'Clear the list', 'the dialog is named by its title');
  assert.ok(dialog.textContent.includes('Clear every row of the list?'));
  assert.equal(document.activeElement, button(dialog, 'Cancel'), 'Cancel takes the focus');
  await key(dialog, 'Escape');
  assert.equal(p.container.querySelector('[role="dialog"]'), null, 'Escape closed it');
  assert.equal(p.actions.length, 1, 'and dispatched nothing');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(document.activeElement, ask, 'the focus is back on the action');
  await click(ask);
  await click(button(p.container.querySelector('[role="dialog"]'), 'Cancel'));
  assert.equal(p.actions.length, 1, 'Cancel dispatched nothing');
  await click(ask);
  await click(button(p.container.querySelector('[role="dialog"]'), 'Clear'));
  assert.equal(p.actions.length, 2);
  assert.equal(p.actions.at(-1).name, 'list.clear');
  assert.deepEqual(p.actions.at(-1).context, { all: true });
  assert.equal(p.container.querySelector('[role="dialog"]'), null);
  await p.unmount();
});

test('a confirm reads its question from a data path, and Tab stays inside the dialog', async () => {
  const p = await draw(bar({ title: 'Clear the list', text: '/prompt' }));
  await click(button(p.container, 'Clear the list'));
  const dialog = p.container.querySelector('[role="dialog"]');
  assert.ok(dialog.textContent.includes('Clear all 19 rows? A new upload brings them back.'), dialog.textContent);
  assert.deepEqual([...dialog.querySelectorAll('button')].map(b => b.textContent), ['Cancel', 'Yes'], 'the default words');
  await key(dialog, 'Tab');
  assert.equal(document.activeElement, button(dialog, 'Yes'));
  await key(dialog, 'Tab');
  assert.equal(document.activeElement, button(dialog, 'Cancel'), 'Tab wraps inside the dialog');
  await key(dialog, 'Tab', { shiftKey: true });
  assert.equal(document.activeElement, button(dialog, 'Yes'));
  await p.unmount();
});
