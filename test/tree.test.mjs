// The file tree over the WAI-ARIA Tree View pattern, by keyboard
// alone; folders from SharedFile paths; the badges (an agent working, written by an agent, new, changed) with the marks
// kept in the browser; a file opened in the preview; the context menu's five actions; an upload into the folder it was
// dropped on; two thousand files drawn as a window of rows; and FileShare drawn through it as a flat list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { React, mount, ui, key, click } from './setup.mjs';

const q3 = { id: 'f-q3', name: 'q3-expenses.csv', mediaType: 'text/csv', bytes: 1840, root: 'r-q3', path: 'data/q3-expenses.csv', by: 'ana', sha256: 'sha256:01' };
const q2 = { id: 'f-q2', name: 'q2-expenses.csv', mediaType: 'text/csv', bytes: 1200, root: 'r-q2', path: 'data/q2-expenses.csv', by: 'ana', sha256: 'sha256:02' };
const note = { id: 'f-note', name: 'overspend.md', mediaType: 'text/markdown', bytes: 420, root: 'r-note', path: 'notes/overspend.md', by: 'workbench', sha256: 'sha256:03' };
const readme = { id: 'f-readme', name: 'README.md', mediaType: 'text/markdown', bytes: 90, root: 'r-readme', by: 'ana', sha256: 'sha256:04' };
const holding = { id: 'working-workbench-main', agent: 'workbench', key: 'main', files: ['data/q3-expenses.csv'], task: 'reading q3-expenses.csv', state: 'working', since: '2026-11-10T09:00:31Z' };

async function page(initial, tree = {}, extra = []) {
  const actions = [];
  let set;
  const components = [{ id: 'tree', component: 'FileTree', reads: '/files', working: '/working', upload: true, preview: 'preview', chat: 'chat', actions: ['ask', 'download', 'share', 'rename', 'remove'], ...tree },
    { id: 'preview', component: 'FilePreview', file: { path: '/selected/file' } }, ...extra];
  const base = [
    { version: 'v0.9.1', createSurface: { surfaceId: 'wb', catalogId: 'agentspaces-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'wb', components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'wb', path: '/', value: initial } },
  ];
  function Host() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }); }
  const m = await mount(React.createElement(Host));
  const push = async value => { await React.act(async () => { set(e => [...e, { version: 'v0.9.1', updateDataModel: { surfaceId: 'wb', path: '/', value } }]); }); };
  const tree$ = () => m.container.querySelector('[role="tree"]');
  const rows = () => [...m.container.querySelectorAll('[role="treeitem"]')];
  const label = r => r.querySelector('.as-tree-name').textContent;
  const active = () => m.container.querySelector('#' + CSS.escape(tree$().getAttribute('aria-activedescendant') || 'none'));
  return { ...m, actions, push, tree: tree$, rows, label, active };
}

test('folders come from the paths, before files and by name, as a tree a keyboard walks', async () => {
  localStorage.clear();
  const p = await page({ files: [note, q3, readme, q2], working: [] });
  assert.deepEqual(p.rows().map(r => [p.label(r), r.getAttribute('aria-level')]), [['data', '1'], ['q2-expenses.csv', '2'], ['q3-expenses.csv', '2'], ['notes', '1'], ['overspend.md', '2'], ['README.md', '1']]);
  assert.equal(p.tree().getAttribute('aria-label'), 'Files');
  assert.equal(p.rows()[0].getAttribute('aria-expanded'), 'true');
  await React.act(async () => { p.tree().focus(); });
  assert.equal(p.label(p.active()), 'data', 'the focus lands on the first row');
  await key(p.tree(), 'ArrowLeft');
  assert.equal(p.rows()[0].getAttribute('aria-expanded'), 'false', 'Left closes an open folder');
  assert.deepEqual(p.rows().map(p.label), ['data', 'notes', 'overspend.md', 'README.md']);
  await key(p.tree(), 'ArrowRight');
  assert.equal(p.rows()[0].getAttribute('aria-expanded'), 'true', 'Right opens it');
  await key(p.tree(), 'ArrowRight');
  assert.equal(p.label(p.active()), 'q2-expenses.csv', 'Right again moves into it');
  await key(p.tree(), 'ArrowDown');
  assert.equal(p.label(p.active()), 'q3-expenses.csv');
  await key(p.tree(), 'ArrowLeft');
  assert.equal(p.label(p.active()), 'data', 'Left on a file goes to its folder');
  await key(p.tree(), 'End');
  assert.equal(p.label(p.active()), 'README.md');
  await key(p.tree(), 'Home');
  await key(p.tree(), 'o');
  assert.equal(p.label(p.active()), 'overspend.md', 'a letter moves to the next row that starts with it');
  assert.equal(JSON.parse(localStorage.getItem('agentspaces-tree-open:wb/tree')).data, true, 'the open folders stay in the browser');
  await p.unmount();
});

test('a file carries its badges: an agent holding it, written by an agent, new or changed since this person looked', async () => {
  localStorage.clear();
  const p = await page({ files: [q3, readme], working: [holding] });
  const badges = name => [...p.rows().find(r => p.label(r) === name).querySelectorAll('.as-tree-badge')].map(b => b.textContent);
  assert.deepEqual(badges('q3-expenses.csv'), ['working: workbench'], 'the first look marks what is there as seen');
  await p.push({ files: [q3, readme, note], working: [] });
  assert.deepEqual(badges('overspend.md'), ['by workbench', 'new'], 'the agent\'s note arrives new');
  assert.deepEqual(badges('q3-expenses.csv'), [], 'the agent let go');
  await p.push({ files: [q3, { ...readme, sha256: 'sha256:99' }, note], working: [] });
  assert.deepEqual(badges('README.md'), ['changed']);
  await click(p.rows().find(r => p.label(r) === 'overspend.md'));
  assert.deepEqual(badges('overspend.md'), ['by workbench'], 'opened: seen');
  assert.ok(p.container.querySelector('.as-preview-name').textContent === 'overspend.md', 'and drawn in the preview');
  assert.equal(p.rows().find(r => p.label(r) === 'overspend.md').getAttribute('aria-selected'), 'true');
  assert.equal(JSON.parse(localStorage.getItem('agentspaces-tree-seen:wb/tree'))['f-note'], 'sha256:03');
  await p.unmount();
});

test('the context menu opens from the keyboard and runs Ask about, Share, Rename and Remove', async () => {
  localStorage.clear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => undefined }, configurable: true });
  const p = await page({ files: [q3, readme], working: [], conversations: [] }, {}, [{ id: 'chat', component: 'Chat', key: 'main' }]);
  ui.fileSources.set('wb', { url: (f, view) => `http://feed/files/app/${f.root}${view ? '?view=1' : ''}` });
  await React.act(async () => { p.tree().focus(); });
  await key(p.tree(), 'ArrowDown');
  await key(p.tree(), 'F10', { shiftKey: true });
  const items = () => [...p.container.querySelectorAll('[role="menu"] [role="menuitem"]')];
  assert.deepEqual(items().map(i => i.textContent.trim()), ['Ask about this file', 'Download', 'Share', 'Rename', 'Remove']);
  await click(items()[0]);
  assert.ok(p.container.querySelector('.as-chat-pending').textContent.includes('q3-expenses.csv'), 'Ask about attaches the file to the chat');
  await key(p.tree(), 'ContextMenu');
  await click(items()[2]);
  assert.deepEqual([p.actions.at(-1).name, p.actions.at(-1).context], ['file.share', { file: 'f-q3' }]);
  await key(p.tree(), 'ContextMenu');
  await click(items()[3]);
  const box = p.container.querySelector('[role="dialog"] input[aria-label="New name"]');
  await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value').set.call(box, 'q3-final.csv'); box.dispatchEvent(new Event('input', { bubbles: true })); });
  await React.act(async () => { p.container.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual([p.actions.at(-1).name, p.actions.at(-1).context], ['file.rename', { file: 'f-q3', name: 'q3-final.csv' }]);
  await key(p.tree(), 'ContextMenu');
  await click(items()[4]);
  assert.ok(p.container.querySelector('[role="dialog"]').textContent.includes('Remove q3-expenses.csv for everyone'));
  await React.act(async () => { p.container.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual([p.actions.at(-1).name, p.actions.at(-1).context], ['file.remove', { file: 'f-q3' }]);
  ui.fileSources.delete('wb');
  await p.unmount();
});

test('a file dropped on a folder lands under its path; one too large is refused on the page', async () => {
  localStorage.clear();
  const calls = [];
  ui.uploaders.set('wb', async (file, opts) => { calls.push([file.name, opts.path]); return { status: 202, body: JSON.stringify({ id: 'f-x' }) }; });
  const p = await page({ files: [q3], working: [] }, { maxBytes: 10 });
  const drop = async (target, files) => React.act(async () => {
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { files, types: ['Files'] } });
    target.dispatchEvent(e);
    await new Promise(r => setTimeout(r, 0));
  });
  await drop(p.rows()[0], [new window.File(['a,b'], 'q4.csv', { type: 'text/csv' })]);
  assert.deepEqual(calls, [['q4.csv', 'data/q4.csv']], 'into the folder it was dropped on');
  await drop(p.rows()[0], [new window.File(['x'.repeat(50)], 'big.csv', { type: 'text/csv' })]);
  assert.ok(p.container.querySelector('.as-filetree-states').textContent.includes('big.csv refused: larger than 10 bytes'));
  assert.equal(calls.length, 1);
  ui.uploaders.delete('wb');
  await p.unmount();
});

test('two thousand files draw in under 200 ms as a window of rows', async () => {
  localStorage.clear();
  const files = Array.from({ length: 2000 }, (_, i) => ({ id: 'f-' + i, name: `file-${String(i).padStart(4, '0')}.txt`, mediaType: 'text/plain', bytes: 10, root: 'r-' + i,
    path: `folder-${i % 20}/file-${String(i).padStart(4, '0')}.txt`, by: 'ana', sha256: 'sha256:' + i }));
  const started = performance.now();
  const p = await page({ files, working: [] });
  const took = performance.now() - started;
  assert.ok(took < 200, `drawn in ${took.toFixed(0)} ms`);
  const drawn = p.rows().length;
  assert.ok(drawn > 0 && drawn < 80, `only the rows in view are in the DOM (${drawn})`);
  assert.equal(p.container.querySelector('.as-tree-inner').style.height, (2020 * ui.ROW_HEIGHT) + 'px', 'the scroll length tells every row');
  await React.act(async () => { p.tree().focus(); });
  await key(p.tree(), 'End');
  assert.equal(p.label(p.active()), 'file-1989.txt', 'End reaches the last row (folder-9 sorts last), drawn on demand');
  await p.unmount();
});

test('FileShare draws through the tree as a flat list with its notice and its attestation', async () => {
  localStorage.clear();
  const calls = [];
  ui.uploaders.set('wb', async (file, opts) => { calls.push([file.name, opts.attest]); return { status: 202, body: '{}' }; });
  const actions = [];
  const env = [
    { version: 'v0.9.1', createSurface: { surfaceId: 'wb', catalogId: 'agentspaces-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'wb', components: [{ id: 'root', component: 'Column', children: ['share'] },
      { id: 'share', component: 'FileShare', notice: 'Files are kept a week.', attest: 'I have the right to share this' }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'wb', path: '/', value: { files: [note, q3] } } },
  ];
  const m = await mount(React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }));
  assert.deepEqual([...m.container.querySelectorAll('[role="treeitem"] .as-tree-name')].map(n => n.textContent), ['overspend.md', 'q3-expenses.csv'], 'a flat list by name');
  assert.ok(m.text().includes('Files are kept a week.'));
  const drop = async () => React.act(async () => {
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { files: [new window.File(['x'], 'a.txt')], types: ['Files'] } });
    m.container.querySelector('[role="tree"]').dispatchEvent(e);
    await new Promise(r => setTimeout(r, 0));
  });
  await drop();
  assert.ok(m.text().includes('refused: tick the box first'), 'the box first');
  await click(m.container.querySelector('.as-filetree-attest input'));
  await drop();
  assert.deepEqual(calls, [['a.txt', 'I have the right to share this']], 'the basis travels with the upload');
  ui.uploaders.delete('wb');
  await m.unmount();
});

test('a renamed file shows once, as its newest version, and a removed one goes', async () => {
  localStorage.clear();
  const renamed = { ...note, id: 'f-note-2', name: 'travel.md', path: 'notes/travel.md', replaces: 'f-note', sha256: 'sha256:03' };
  const p = await page({ files: [q3, note, renamed], working: [] });
  assert.deepEqual(p.rows().map(p.label), ['data', 'q3-expenses.csv', 'notes', 'travel.md'], 'the version it replaces is not drawn');
  await p.push({ files: [renamed], working: [] });
  assert.deepEqual(p.rows().map(p.label), ['notes', 'travel.md']);
  await p.unmount();
});

