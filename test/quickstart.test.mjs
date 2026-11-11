// The README's quick start, run as written: a page that draws a title bar over a split of two panes from envelopes,
// and hears the title bar's button back as an action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, click, React, ui } from './setup.mjs';

test('the quick start draws a title bar over a split and hears the button', async () => {
  // ---- the README's code, from here
  const { Surfaces, CommandPalette } = ui;
  const envelopes = [
    { version: 'v0.9.1', createSurface: { surfaceId: 'desk', catalogId: 'agentspaces-viz' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'desk', components: [
      { id: 'root', component: 'Column', children: ['bar', 'main'] },
      { id: 'bar', component: 'TitleBar', title: 'Refund desk', status: { from: '/working' },
        actions: [{ id: 'refresh', label: 'Refresh', action: { name: 'refresh' } }] },
      { id: 'main', component: 'Split', persist: 'desk', panes: [
        { id: 'left', child: 'open', size: 0.4, label: 'Open' }, { id: 'right', child: 'note', size: 0.6, collapsible: true, label: 'Note' }] },
      { id: 'open', component: 'Stat', label: 'Open refunds', value: '/open' },
      { id: 'note', component: 'Prose', text: '/note' },
    ] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'desk', path: '/', value: { open: 3, note: 'Three refunds **wait** for you.', working: [] } } },
  ];
  const actions = [];
  const page = React.createElement(React.Fragment, null,
    React.createElement(Surfaces, { envelopes, onAction: a => actions.push(a) }),
    React.createElement(CommandPalette));
  // ---- to here
  const { container, text, unmount } = await mount(page);
  assert.ok(text().includes('Refund desk') && text().includes('Ready') && text().includes('Open refunds') && text().includes('3'));
  assert.ok(container.querySelector('agentspaces-split'));
  await click([...container.querySelectorAll('button')].find(b => b.textContent.includes('Refresh')));
  assert.equal(actions[0].name, 'refresh');
  assert.equal(actions[0].sourceComponentId, 'bar');
  await unmount();
});
