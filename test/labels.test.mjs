// What a person reads on a button and what it sends: a DataTable's row button reads rowActionLabel and is named with its
// row's first column (AF-14); a basic TextField bound to a path feeds a Button's action context, so a URL
// typed in a box reaches the agent with the press (AF-17).
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, click, React } from './setup.mjs';

const BASIC = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
const surf = (surfaceId, components, value, catalogId = 'agentspaces-viz') => [
  { version: '1.0', createSurface: { surfaceId, catalogId } },
  { version: '1.0', updateComponents: { surfaceId, components: [{ id: 'root', component: 'Column', children: components.filter(c => !c.inner).map(c => c.id) }, ...components.map(({ inner, ...c }) => c)] } },
  { version: '1.0', updateDataModel: { surfaceId, path: '/', value } },
];
const pages = [{ title: 'Claims handbook', site: 'docs.example.com' }, { title: 'Receipts policy', site: 'docs.example.com' }];
const columns = [{ key: 'title', title: 'Page' }, { key: 'site', title: 'Site' }];

test('a row button reads its label, is named with the row\'s first column, and dispatches its action with the row', async () => {
  const p = await draw(surf('t', [{ id: 'pages', component: 'DataTable', columns, rows: '/pages', rowAction: 'pages.add', rowActionLabel: 'Add the page' }], { pages }));
  assert.deepEqual(p.problems, [], 'the catalog takes rowActionLabel');
  const buttons = [...p.container.querySelectorAll('[data-component="DataTable"] tbody button')];
  assert.deepEqual(buttons.map(b => b.textContent), ['Add the page', 'Add the page'], 'the label, not the action\'s name');
  assert.deepEqual(buttons.map(b => b.getAttribute('aria-label')), ['Add the page Claims handbook', 'Add the page Receipts policy'],
    'a screen reader tells the rows\' buttons apart, and the name starts with the words on the button');
  await click(buttons[1]);
  assert.deepEqual([p.actions.at(-1).name, p.actions.at(-1).context], ['pages.add', { row: pages[1] }], 'the action and its payload as before');
  await p.unmount();
});

test('a DataTable\'s scrolling wrapper is a focusable region named for the table (D-F11)', async () => {
  const p = await draw(surf('t4', [{ id: 'pages', component: 'DataTable', columns, rows: '/pages' }], { pages }));
  const wrap = p.container.querySelector('[data-component="DataTable"] .bma-table-wrap');
  assert.equal(wrap.getAttribute('tabindex'), '0', 'a keyboard reaches it to scroll');
  assert.equal(wrap.getAttribute('role'), 'region');
  assert.equal(wrap.getAttribute('aria-label'), 'Table of Page, Site', 'named by its columns');
  await p.unmount();
});

test('with no label the row button reads the action\'s name, as before, and is named with its row too', async () => {
  const p = await draw(surf('t2', [{ id: 'pages', component: 'DataTable', columns, rows: '/pages', rowAction: 'open' }], { pages }));
  const buttons = [...p.container.querySelectorAll('[data-component="DataTable"] tbody button')];
  assert.deepEqual(buttons.map(b => b.textContent), ['open', 'open']);
  assert.deepEqual(buttons.map(b => b.getAttribute('aria-label')), ['open Claims handbook', 'open Receipts policy']);
  await p.unmount();
  const blank = await draw(surf('t3', [{ id: 'pages', component: 'DataTable', columns, rows: '/pages', rowAction: 'open', rowActionLabel: '  ' }], { pages: [{ title: '', site: 'x' }] }));
  const b = blank.container.querySelector('[data-component="DataTable"] tbody button');
  assert.equal(b.textContent, 'open', 'a blank label falls back to the name');
  assert.equal(b.getAttribute('aria-label'), 'open', 'an empty first column adds nothing');
  await blank.unmount();
});

/** A page-address box: a basic TextField bound to /form/url and a Button whose action context reads the same path. */
const box = [
  { id: 'url', component: 'TextField', label: 'Page address', value: { '@path': '/form/url' } },
  { id: 'add', component: 'Button', child: 'addText', action: { event: { name: 'pages.add-url', context: { url: { '@path': '/form/url' } } } } },
  { id: 'addText', component: 'Text', text: 'Add the page', inner: true },
];
const typeInto = async (input, value) => {
  await React.act(async () => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await React.act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

for (const catalogId of [BASIC, 'agentspaces-viz', 'agentspaces-widgets']) {
  test(`a typed URL in a TextField reaches the Button's dispatched context (${catalogId === BASIC ? 'basic' : catalogId})`, async () => {
    const p = await draw(surf('add' + catalogId.length, box, { form: { url: '' } }, catalogId));
    assert.deepEqual(p.problems, [], 'the basic components draw on the surface');
    const input = p.container.querySelector('a2ui-basic-textfield input');
    assert.ok(input, 'the box draws an input a keyboard reaches');
    const url = 'https://docs.example.com/support/troubleshooting/port-flap.html';
    await typeInto(input, url);
    await click(p.container.querySelector('a2ui-basic-button button'));
    await React.act(async () => { await new Promise(r => setTimeout(r, 0)); });
    assert.equal(p.actions.length, 1);
    assert.equal(p.actions[0].name, 'pages.add-url');
    assert.deepEqual(p.actions[0].context, { url }, 'the press carries what was typed, not the value at the start');
    await typeInto(input, 'https://docs.example.com/other.html');
    await click(p.container.querySelector('a2ui-basic-button button'));
    await React.act(async () => { await new Promise(r => setTimeout(r, 0)); });
    assert.deepEqual(p.actions.at(-1).context, { url: 'https://docs.example.com/other.html' }, 'and follows a change');
    await p.unmount();
  });
}
