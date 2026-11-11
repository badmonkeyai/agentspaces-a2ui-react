// Every golden surface the open renderer draws is accepted, shows the text a person must find, and is
// drawn as its component (an alias as the component it draws through); a frame or an application component has its
// four states; the open package draws agentspaces-viz and agentspaces-widgets, with the two widgets a host still draws
// named in HOSTED.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, ui } from './setup.mjs';

const hosted = new Set(Object.values(ui.HOSTED).flat());
/** The catalog aliases, each drawn by the component it names. */
const DRAWN_AS = { Conversation: 'Chat', ChatInput: 'Chat', FileShare: 'FileTree' };

test('the goldens cover every drawn component, and each frame component in four states', () => {
  const names = new Set(ui.GOLDENS.map(g => g.name));
  for (const c of ui.OPEN_CATALOGS['agentspaces-viz']) assert.ok(names.has(c), `a golden for agentspaces-viz/${c}`);
  for (const c of ['Chat', 'FileTree', 'FilePreview']) assert.ok(names.has(c), `a golden for agentspaces-widgets/${c}`);
  for (const frame of ['TitleBar', 'Menu', 'Split', 'Chat', 'FileTree', 'FilePreview']) {
    assert.deepEqual(ui.GOLDENS.filter(g => g.name === frame).map(g => g.state), ['full', 'empty', 'loading', 'error'], frame);
  }
  assert.deepEqual([...hosted].sort(), ['ApprovalCard', 'TimelineStrip']);
});

for (const g of ui.GOLDENS.filter(g => !hosted.has(g.name))) {
  test(`golden ${ui.goldenTitle(g)} draws with its text`, async () => {
    const { container, problems, text, unmount } = await draw(g.envelopes);
    assert.deepEqual(problems, [], `${g.name} is accepted`);
    for (const expected of g.expectText) assert.ok(text().includes(expected), `${ui.goldenTitle(g)} shows "${expected}" (text: ${text().slice(0, 240)})`);
    if (g.name !== 'Text') assert.ok(container.querySelector(`[data-component="${DRAWN_AS[g.name] ?? g.name}"]`), `${g.name} is drawn as its component`);
    await unmount();
  });
}

test('a component this package does not draw is refused, and the rest still draws', async () => {
  const { problems, text, unmount } = await draw([
    { version: 'v0.9.1', createSurface: { surfaceId: 'h', catalogId: 'agentspaces-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'h', components: [{ id: 'root', component: 'Column', children: ['a', 't'] }, { id: 'a', component: 'ApprovalCard' }, { id: 't', component: 'Text', text: 'still here' }] } },
  ]);
  assert.ok(problems.some(p => /unknown component ApprovalCard/.test(p)), 'a host registers it: ' + JSON.stringify(problems));
  assert.ok(text().includes('still here'));
  await unmount();
});

test('the aliases draw through Chat and FileTree', async () => {
  const { container, unmount } = await draw([
    { version: 'v0.9.1', createSurface: { surfaceId: 'al', catalogId: 'agentspaces-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'al', components: [{ id: 'root', component: 'Column', children: ['c', 'f'] }, { id: 'c', component: 'ChatInput', key: 'main' }, { id: 'f', component: 'FileShare' }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'al', path: '/', value: { conversations: [], files: [] } } },
  ]);
  assert.ok(container.querySelector('[data-component="Chat"]'), 'ChatInput draws as Chat');
  assert.ok(container.querySelector('[data-component="FileTree"]'), 'FileShare draws as FileTree');
  await unmount();
});

test('a host registers its own catalog and an alias', async () => {
  const { React } = await import('./setup.mjs');
  ui.registerComponents('acme-widgets', { Banner: ui.define('Banner', ({ props }) => React.createElement('b', { 'data-component': 'Banner' }, String(props.text))) });
  ui.registerAlias('acme-widgets', ['agentspaces-viz']);
  assert.ok(ui.declares('acme-widgets', 'Banner'));
  assert.ok(ui.declares('acme-widgets', 'Stat'), 'the alias draws the open components');
  assert.ok(ui.declares('acme-widgets', 'Text'), 'and the basic ones');
  assert.ok(!ui.declares('agentspaces-viz', 'Banner'));
  const { text, problems, unmount } = await draw([
    { version: 'v0.9.1', createSurface: { surfaceId: 'a', catalogId: 'acme-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'a', components: [{ id: 'root', component: 'Column', children: ['b', 's'] }, { id: 'b', component: 'Banner', text: 'Hello' }, { id: 's', component: 'Stat', label: 'Open', value: '7' }] } },
  ]);
  assert.deepEqual(problems, []);
  assert.ok(text().includes('Hello') && text().includes('Open'));
  await unmount();
});

test('a widgets surface draws the open frame around its components', async () => {
  const { container, problems, unmount } = await draw([
    { version: 'v0.9.1', createSurface: { surfaceId: 'wb', catalogId: 'agentspaces-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'wb', components: [{ id: 'root', component: 'Column', children: ['bar', 'split'] },
      { id: 'bar', component: 'TitleBar', title: 'Workbench' },
      { id: 'split', component: 'Split', panes: [{ id: 'l', child: 'tree', size: 0.4 }, { id: 'r', child: 'chat', size: 0.6 }] },
      { id: 'tree', component: 'FileTree', reads: '/files' }, { id: 'chat', component: 'Chat', key: 'main' }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'wb', path: '/', value: { files: [], conversations: [] } } },
  ]);
  assert.deepEqual(problems, []);
  for (const c of ['TitleBar', 'Split', 'FileTree', 'Chat']) assert.ok(container.querySelector(`[data-component="${c}"]`), c);
  assert.ok(ui.declares('agentspaces-widgets', 'TitleBar'));
  assert.ok(!ui.declares('agentspaces-viz', 'Chat'), 'the frame does not take the widgets');
  await unmount();
});

