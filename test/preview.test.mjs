// The preview draws a file by its media type and never runs its code: text as text,
// Markdown through the safe renderer, CSV as a table of its first rows, PNG and JPEG as an image, PDF in a frame with no
// permission, HTML and SVG as their text; above maxBytes it says the file is too large and offers Download.
import test from 'node:test';
import assert from 'node:assert/strict';
import { React, mount, ui } from './setup.mjs';

const file = (id, name, mediaType, bytes = 100) => ({ id, name, mediaType, bytes, root: 'r-' + id, path: name });
const TEXTS = {
  'r-t': 'plain words\nsecond line',
  'r-m': '# Overspend\n\nTravel ran **18 percent** over.\n\n<img src=x onerror=alert(1)>',
  'r-c': 'category,spent,budget\ntravel,"1,180",1000\nfood,300,400\nrent,900,900',
  'r-h': '<script>alert(1)</script><b>bold</b>',
  'r-s': '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>',
};
const files = [file('t', 'notes.txt', 'text/plain'), file('m', 'overspend.md', 'text/markdown'), file('c', 'q3.csv', 'text/csv'), file('p', 'chart.png', 'image/png'),
  file('j', 'photo.jpeg', 'image/jpeg'), file('d', 'report.pdf', 'application/pdf'), file('h', 'page.html', 'text/html'), file('s', 'logo.svg', 'image/svg+xml'),
  file('z', 'data.zip', 'application/zip'), file('big', 'huge.csv', 'text/csv', 3 * 1024 * 1024)];

async function preview(id, props = {}) {
  ui.fileSources.set('pv', { url: (f, view) => `https://feed.example/files/app/${f.root}${view ? '?view=1' : ''}`, text: async f => TEXTS[f.root] ?? '' });
  const env = [
    { version: 'v0.9.1', createSurface: { surfaceId: 'pv', catalogId: 'agentspaces-widgets' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'pv', components: [{ id: 'root', component: 'Column', children: ['preview'] }, { id: 'preview', component: 'FilePreview', file: id, files: '/files', csvRows: 2, ...props }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'pv', path: '/', value: { files } } },
  ];
  const m = await mount(React.createElement(ui.Surfaces, { envelopes: env }));
  await React.act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return { ...m, body: () => m.container.querySelector('[data-component="FilePreview"]') };
}

test('text and Markdown draw as text and safe Markdown; CSV as a table of its first rows', async () => {
  let p = await preview('t');
  assert.equal(p.body().querySelector('pre.as-preview-text').textContent, 'plain words\nsecond line');
  await p.unmount();
  p = await preview('m');
  assert.equal(p.body().querySelector('h1').textContent, 'Overspend');
  assert.equal(p.body().querySelector('strong').textContent, '18 percent');
  assert.equal(p.body().querySelector('img'), null, 'raw HTML in Markdown draws as nothing that runs');
  await p.unmount();
  p = await preview('c');
  assert.deepEqual([...p.body().querySelectorAll('th')].map(t => t.textContent), ['category', 'spent', 'budget']);
  assert.deepEqual([...p.body().querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), [['travel', '1,180', '1000'], ['food', '300', '400']]);
  assert.ok(p.text().includes('the first 2 drawn'));
  await p.unmount();
});

test('an image draws as an image and a PDF in a frame with no permission, from the view address', async () => {
  let p = await preview('p');
  const img = p.body().querySelector('img.as-preview-image');
  assert.equal(img.getAttribute('src'), 'https://feed.example/files/app/r-p?view=1');
  assert.equal(img.getAttribute('alt'), 'chart.png');
  await p.unmount();
  p = await preview('d');
  const frame = p.body().querySelector('iframe');
  assert.equal(frame.getAttribute('sandbox'), '', 'sandboxed with no permission');
  assert.equal(frame.getAttribute('src'), 'https://feed.example/files/app/r-d?view=1');
  await p.unmount();
});

test('HTML and SVG draw as their text and never as a document', async () => {
  for (const [id, words] of [['h', '<script>alert(1)</script><b>bold</b>'], ['s', 'onload="alert(1)"']]) {
    const p = await preview(id);
    assert.equal(p.body().querySelector('script'), null);
    assert.equal(p.body().querySelector('svg'), null);
    assert.equal(p.body().querySelector('iframe'), null);
    assert.ok(p.body().querySelector('pre.as-preview-text').textContent.includes(words), id + ' as text');
    await p.unmount();
  }
  assert.equal(ui.previewKind('text/html'), 'source');
  assert.equal(ui.previewKind('image/svg+xml'), 'source');
  assert.equal(ui.previewKind('application/xhtml+xml'), 'source');
});

test('a file too large or of no previewed type offers Download; a missing file says so', async () => {
  let p = await preview('big');
  assert.ok(p.text().includes('Too large to preview (3 MiB; the preview draws up to 2 MiB)'));
  assert.equal(p.body().querySelector('a.bma-btn').getAttribute('href'), 'https://feed.example/files/app/r-big');
  assert.equal(p.body().querySelector('a.bma-btn').getAttribute('download'), 'huge.csv');
  await p.unmount();
  p = await preview('z');
  assert.ok(p.text().includes('No preview for application/zip'));
  await p.unmount();
  p = await preview('gone');
  assert.ok(p.text().includes('Unavailable: no shared file has the id gone'));
  await p.unmount();
  p = await preview('c', { kinds: ['text/plain'] });
  assert.ok(p.body().querySelector('pre.as-preview-text'), 'a type left out of kinds draws as its text');
  await p.unmount();
  ui.fileSources.delete('pv');
});
