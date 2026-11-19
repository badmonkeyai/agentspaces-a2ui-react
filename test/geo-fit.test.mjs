// The GeoLayout fits the viewport (srad/agentspaces-geo.md §3.3), measured in headless Chrome since happy-dom lays
// nothing out: the page never scrolls with tall windows open (a script's scrollIntoView neither), the bar stays at the
// top and the map fills the stage to its foot, every window sits inside the stage and scrolls its own content, the
// docked windows cover none of each other (the map's details window in the right column too), a window holding a table
// opens wide enough for it and tall enough for its rows, and a free window kept at a place off this screen is drawn
// inside it. The map's details window is no taller than its content, the layer chips keep clear of every docked window,
// the draw control's name form opens below its button and over none of the time strip, and a watchbox row's fly-to
// lands its pin in the part of the map the docked windows leave visible. Without Chrome the test says so and is skipped,
// as the gallery's accessibility check is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = existsSync(CHROME) ? false : 'no Chrome at ' + CHROME;
const root = fileURLToPath(new URL('..', import.meta.url));

/** Builds the fixture page, serves it, and opens it in headless Chrome; returns evaluate, open and close. */
async function browser() {
  const dir = mkdtempSync(join(tmpdir(), 'as-geo-fit-'));
  await build({ entryPoints: [join(root, 'test/fixtures/geo-fit.jsx')], outfile: join(dir, 'page.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error', nodePaths: [join(root, 'node_modules')] });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="style.css">'
    + '<style>body{margin:0}.bma-page{min-height:100vh}</style></head><body><div id="root"></div><script type="module" src="page.js"></script></body></html>');
  writeFileSync(join(dir, 'style.css'), readFileSync(join(root, 'dist/a2ui-react.css')));
  const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
  const server = createServer((req, res) => {
    const name = (req.url || '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
    const path = join(dir, name);
    if (name.includes('..') || !existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[name.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(path));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const debug = 9700 + Math.floor(Math.random() * 250);
  const profile = join(dir, 'profile');
  const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--window-size=1600,1000', '--remote-debugging-port=' + debug, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${debug}/json`)).json(); break; } catch (e) { if (i >= 75) throw e; await new Promise(r => setTimeout(r, 200)); } }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const pending = new Map(), thrown = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') thrown.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  const open = async (query, width, height) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html${query}` });
    for (let i = 0; i < 100; i++) { if (await ev(`document.querySelectorAll('.as-geo-window:not([hidden])').length >= 6 && !!document.querySelector('.as-geomap')`).catch(() => false)) break; await new Promise(r => setTimeout(r, 100)); }
    // the windows measure their tables and the stage its size a frame or two after the first draw
    await new Promise(r => setTimeout(r, 700));
  };
  const close = async () => {
    ws.close(); server.close();
    await new Promise(r => { if (chrome.exitCode !== null) r(); else { chrome.once('exit', r); chrome.kill(); } });
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { ev, open, close, thrown };
}

/** What the page shows: the page's scroll, the layout's, bar's, stage's and map's boxes, and each open window's. */
const MEASURE = `(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const se = document.scrollingElement, layout = document.querySelector('.as-geo-layout'), stage = document.querySelector('.as-geo-stage');
  const legend = document.querySelector('.as-geomap .legend');
  const content = (w, b) => { let bottom = 0; for (const c of b.children) { if (c.offsetHeight > 0) bottom = Math.max(bottom, c.offsetTop + c.offsetHeight + (parseFloat(getComputedStyle(c).marginBottom) || 0)); }
    return Math.ceil(bottom + (parseFloat(getComputedStyle(b).paddingBottom) || 0) + w.offsetHeight - w.clientHeight); };
  const at = sel => { const el = document.querySelector(sel); return el && el.offsetParent !== null ? box(el) : null; };
  const inset = side => parseFloat(stage.style.getPropertyValue('--as-dock-' + side)) || 0;
  return {
    insets: { left: inset('left'), right: inset('right'), bottom: inset('bottom') },
    time: at('.as-geomap .time'), drawButton: at('.as-geomap-draw .draw-toggle'), drawForm: at('.as-geomap-draw form'),
    view: { w: innerWidth, h: innerHeight },
    page: { scrollTop: se.scrollTop, scrollLeft: se.scrollLeft, scrollHeight: se.scrollHeight, scrollWidth: se.scrollWidth },
    scrolled: [...document.querySelectorAll('.as-geo-layout, .as-geo-layout *')].filter(e => !e.matches('.as-geo-window-body, .as-geo-window-body *') && (e.scrollTop || e.scrollLeft)).map(e => e.className || e.tagName),
    layout: box(layout), bar: box(document.querySelector('.as-geo-bar')), stage: box(stage), map: box(document.querySelector('.as-geomap')),
    legend: legend ? box(legend) : null, mapState: document.querySelector('.as-geomap').dataset.state,
    windows: [...document.querySelectorAll('.as-geo-window:not([hidden])')].map(w => { const b = w.querySelector('.as-geo-window-body');
      return { id: w.dataset.window, dock: w.dataset.dock, ...box(w), scrolls: b.scrollHeight > b.clientHeight + 1, wideOver: b.scrollWidth - b.clientWidth,
        natural: w.offsetHeight - b.clientHeight + b.scrollHeight, content: content(w, b),
        tableOver: [...w.querySelectorAll('table')].reduce((n, t) => Math.max(n, t.offsetWidth - t.parentElement.clientWidth), 0) }; }),
  };
})()`;

const ui_MIN_H = 160;
const inside = (r, s) => r.x >= s.x - 0.5 && r.y >= s.y - 0.5 && r.right <= s.right + 0.5 && r.bottom <= s.bottom + 0.5;
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));

function fits(m, label) {
  assert.ok(m.page.scrollHeight <= m.view.h && m.page.scrollWidth <= m.view.w, `${label}: the page does not overflow the viewport: ${JSON.stringify(m.page)} in ${JSON.stringify(m.view)}`);
  assert.equal(m.page.scrollTop, 0, `${label}: the page is not scrolled`);
  assert.deepEqual(m.scrolled, [], `${label}: nothing in the layout but a window's body is scrolled`);
  assert.deepEqual([m.layout.x, m.layout.y, m.layout.w, m.layout.h], [0, 0, m.view.w, m.view.h], `${label}: the layout is the viewport`);
  assert.equal(m.bar.y, 0, `${label}: the bar is at the top`);
  assert.equal(m.stage.bottom, m.view.h, `${label}: the stage runs to the viewport's foot`);
  assert.deepEqual([m.map.x, m.map.y, m.map.w, m.map.h], [m.stage.x, m.stage.y, m.stage.w, m.stage.h], `${label}: the map fills the stage exactly`);
  if (m.legend && m.mapState === 'map') assert.ok(m.legend.bottom <= m.stage.bottom - 4, `${label}: the layer chips sit above the foot: ${m.legend.bottom} in ${m.stage.bottom}`);
  for (const w of m.windows) assert.ok(inside(w, m.stage), `${label}: ${w.id} is inside the stage: ${JSON.stringify(w)} in ${JSON.stringify(m.stage)}`);
  const docked = m.windows.filter(w => w.dock !== 'free');
  for (let i = 0; i < docked.length; i++) for (let j = i + 1; j < docked.length; j++) {
    assert.equal(overlap(docked[i], docked[j]), 0, `${label}: ${docked[i].id} and ${docked[j].id} do not cover each other: ${JSON.stringify([docked[i], docked[j]])}`);
  }
  // the layer chips keep clear of every docked window, a clear gap above one docked at the foot
  if (m.legend && m.mapState === 'map') {
    for (const w of docked) {
      assert.equal(overlap(m.legend, w), 0, `${label}: the chips cover none of ${w.id}: ${JSON.stringify([m.legend, w])}`);
      if (w.dock === 'bottom' && m.legend.right > w.x && m.legend.x < w.right) assert.ok(w.y - m.legend.bottom >= 12, `${label}: the chips sit clear above ${w.id}: ${m.legend.bottom} to ${w.y}`);
    }
  }
}

/** Where a longitude and latitude falls on the map, in page px, from the map's view (centre and zoom; 512 px tiles). */
function project([lon, lat], view, m) {
  const scale = 512 * 2 ** view.zoom;
  const x = l => ((l + 180) / 360) * scale;
  const y = p => { const r = (p * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale; };
  return { x: m.stage.x + m.stage.w / 2 + x(lon) - x(view.center[0]), y: m.stage.y + m.stage.h / 2 + y(lat) - y(view.center[1]) };
}

test('the GeoLayout fills the viewport exactly, and its windows fit the stage, scroll inside themselves and cover none of each other', { skip, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    for (const [width, height] of [[1600, 1000], [1280, 720]]) {
      const label = `${width} by ${height}`;
      await b.open('', width, height);
      const m = await b.ev(MEASURE);
      fits(m, label);
      const win = id => m.windows.find(w => w.id === id);
      assert.deepEqual(m.windows.map(w => w.id).sort(), ['alerts', 'ask', 'data', 'files', 'patterns', 'places'], label);
      for (const id of ['alerts', 'places', 'ask', 'patterns']) assert.ok(win(id).scrolls, `${label}: ${id}'s tall list scrolls inside the window`);
      assert.ok(win('data').w >= Math.min(640, m.stage.w - 16), `${label}: the window holding a table opens wide enough for one: ${win('data').w}`);
      // and tall enough for its rows: its content's height, up to 55% of the stage and to what leaves each window in the
      // right column (which stops above it) its least height, never the 32% it opened at
      const rightKeep = m.windows.filter(w => w.dock === 'right').reduce(n => n + ui_MIN_H + 8, 8);
      const data = win('data'), cap = Math.min(Math.round(m.stage.h * 0.55), Math.max(ui_MIN_H, m.stage.h - rightKeep - 16));
      assert.ok(data.h >= Math.min(data.natural, cap) - 2, `${label}: the window holding a table is tall enough for its rows: ${data.h} for ${data.natural} (cap ${cap})`);
      assert.ok(data.h > Math.round(m.stage.h * 0.32), `${label}: taller than a plain window at the foot: ${data.h}`);
      if (width >= 1600) assert.ok(win('data').tableOver <= 1, `${label}: and its table fits it: ${win('data').tableOver} px over`);
      // a script's scrollIntoView (a test driver's, a link's) on what sits deep in a window, or at the map's foot,
      // scrolls that window's body and nothing else: the bar and the chips stay where they are
      await b.ev(`(() => { for (const el of [...document.querySelectorAll('[data-list] li:last-child'), document.querySelector('[data-last]'), document.querySelector('[data-basis]'), document.querySelector('.as-geomap .legend')]) el && el.scrollIntoView({ block: 'center', inline: 'center' }); return true; })()`);
      fits(await b.ev(MEASURE), label + ', after scrollIntoView');
    }
    // a watchbox row flies the map to its pin: it lands in the part of the map the docked windows leave visible (the
    // details window it opens on the right included), never under a window
    await b.open('', 1600, 1000);
    if ((await b.ev(MEASURE)).mapState === 'map') {
      const viewOf = `(() => { const k = Object.keys(localStorage).find(k => k.startsWith('agentspaces-geo:view:') && k.endsWith(':watch')); return k ? JSON.parse(localStorage.getItem(k)) : null; })()`;
      await b.ev(`(document.querySelector('[data-window="files"] [data-feature="p3"] .as-watchbox-pick').click(), true)`);
      let view = null, last = '';
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 150));
        const v = await b.ev(viewOf);
        const k = JSON.stringify(v);
        if (v && v.zoom >= 14 && k === last) { view = v; break; }
        last = k;
      }
      assert.ok(view, 'the map flew and settled: ' + last);
      const f = await b.ev(MEASURE);
      assert.ok(f.windows.find(w => w.id === 'details'), 'the row opened the details window');
      const p = project([-3.03, 53.43], view, f);
      const free = { x: f.stage.x + f.insets.left, right: f.stage.right - f.insets.right, y: f.stage.y + 56, bottom: f.stage.bottom - f.insets.bottom - 44 };
      assert.ok(p.x >= free.x && p.x <= free.right && p.y >= free.y && p.y <= free.bottom, `the pin lands in the visible part: ${JSON.stringify(p)} in ${JSON.stringify(free)}`);
      for (const w of f.windows.filter(w => w.dock !== 'free')) assert.ok(!(p.x >= w.x && p.x <= w.right && p.y >= w.y && p.y <= w.bottom), `the pin is under no window: ${w.id}`);
      assert.ok(Math.abs(p.x - (free.x + free.right) / 2) < 48 && Math.abs(p.y - (free.y + free.bottom) / 2) < 48,
        `near the visible part's middle (the stage's own middle sits ${Math.round(f.stage.y + f.stage.h / 2 - (free.y + free.bottom) / 2)} px lower): ${JSON.stringify(p)} in ${JSON.stringify(free)}`);
    }
    // the draw control's name form opens below its button, over none of the time strip beside it
    await b.open('', 1600, 1000);
    const d0 = await b.ev(MEASURE);
    if (d0.mapState === 'map' && d0.drawButton) {
      assert.ok(d0.time, 'the time strip shows');
      assert.equal(overlap(d0.drawButton, d0.time), 0, 'the button and the strip sit side by side');
      await b.ev(`(document.querySelector('.as-geomap-draw .draw-toggle').click(), true)`);
      await new Promise(r => setTimeout(r, 100));
      await b.ev(`([...document.querySelectorAll('.as-geomap-draw button')].find(x => x.textContent.includes('centre')).click(), true)`);
      await new Promise(r => setTimeout(r, 150));
      const d = await b.ev(MEASURE);
      assert.ok(d.drawForm && d.drawButton, 'the name form opened, and the button stayed');
      assert.ok(d.drawForm.y >= d.drawButton.bottom, `the form opens below the button: ${JSON.stringify([d.drawButton, d.drawForm])}`);
      assert.equal(overlap(d.drawForm, d.time), 0, `the form covers none of the time strip: ${JSON.stringify([d.drawForm, d.time])}`);
      fits(d, 'while naming a drawn area');
    }
    // the map opens its details window: it docks in the right column, with the right windows above it, over none of them
    await b.open('?details=1', 1600, 1000);
    for (let i = 0; i < 30 && !(await b.ev(`!!document.querySelector('.as-geo-details [data-window="details"]')`)); i++) await new Promise(r => setTimeout(r, 100));
    const m = await b.ev(MEASURE);
    fits(m, 'with the details window');
    const details = m.windows.find(w => w.id === 'details');
    assert.ok(details, 'the details window opened');
    for (const id of ['ask', 'patterns']) assert.ok(m.windows.find(w => w.id === id).bottom <= details.y, `${id} sits above the details window`);
    assert.ok(details.h <= Math.max(ui_MIN_H, details.content) + 1, `the details window is no taller than its content: ${JSON.stringify(details)}`);
    // one window on the right and the details under it (a pattern chart and a selected alert): the details window takes
    // its content's height and the window above it the rest of the column, so the details covers none of it
    for (const label of ['Ask', 'Data']) await b.ev(`([...document.querySelectorAll('.as-geo-menu-item')].find(x => x.textContent.includes(${JSON.stringify(label)})).click(), true)`);
    await new Promise(r => setTimeout(r, 400));
    const two = await b.ev(MEASURE);
    fits(two, 'one right window and the details');
    const d2 = two.windows.find(w => w.id === 'details'), patterns = two.windows.find(w => w.id === 'patterns');
    assert.ok(!d2.scrolls && Math.abs(d2.h - Math.max(ui_MIN_H, d2.content)) <= 1, `the details window fits its content: ${JSON.stringify(d2)}`);
    assert.ok(patterns.bottom <= d2.y && Math.abs(patterns.h + d2.h + 8 - (two.stage.h - 16)) <= 2, `patterns takes the rest of the column: ${JSON.stringify([patterns, d2, two.stage])}`);
    assert.deepEqual(b.thrown, [], 'the page threw nothing');
  } finally {
    await b.close();
  }
});

test('the window chips sit in a row of their own below the kicker, labels under icons, clear of the map and its top controls', { skip, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    for (const [width, height] of [[1280, 800], [1024, 768]]) {
      const label = `${width} by ${height}`;
      await b.open('', width, height);
      const m = await b.ev(`(() => { const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
        const one = sel => { const el = document.querySelector(sel); return el && el.offsetParent !== null ? box(el) : null; };
        return { kicker: one('.as-geo-bar .as-kicker'), menu: one('.as-geo-menu'), bar: one('.as-geo-bar'), stage: one('.as-geo-stage'), time: one('.as-geomap .time'),
          draw: one('.as-geomap-draw .draw-toggle'), controls: one('.as-geomap .controls'), mapState: document.querySelector('.as-geomap').dataset.state,
          chips: [...document.querySelectorAll('.as-geo-menu-item')].map(c => ({ chip: box(c), icon: box(c.querySelector('svg')), label: box(c.querySelector('.as-geo-menu-label')),
            labelShown: getComputedStyle(c.querySelector('.as-geo-menu-label')).display !== 'none' && c.querySelector('.as-geo-menu-label').getBoundingClientRect().width > 0 })) }; })()`);
      assert.ok(m.kicker && m.menu, `${label}: a kicker and a chip row`);
      assert.ok(m.menu.y >= m.kicker.bottom, `${label}: the chips sit below the kicker: ${JSON.stringify([m.kicker, m.menu])}`);
      assert.ok(m.menu.bottom <= m.bar.bottom && m.bar.bottom <= m.stage.y + 0.5, `${label}: the chip row is the bar's, above the map: ${JSON.stringify([m.menu, m.bar, m.stage])}`);
      assert.equal(m.chips.length, 6, label);
      for (const c of m.chips) {
        assert.ok(c.labelShown, `${label}: each chip shows its label`);
        assert.ok(c.label.y >= c.icon.bottom - 0.5, `${label}: the label is under its icon: ${JSON.stringify(c)}`);
        assert.ok(c.chip.right <= width && c.chip.bottom <= m.bar.bottom, `${label}: the chip is inside the bar`);
      }
      for (const [what, r] of [['the draw control', m.draw], ['the time strip', m.time], ['the zoom controls', m.controls]]) {
        if (r) assert.ok(r.y >= m.stage.y, `${label}: ${what} sits on the map, below the chips: ${JSON.stringify([r, m.stage])}`);
      }
      if (m.mapState === 'map') assert.ok(m.time && m.draw, `${label}: the time strip and the draw control show over a drawn map`);
      if (m.time && m.draw) assert.equal(overlap(m.time, m.draw), 0, `${label}: the time strip keeps clear of the draw control: ${JSON.stringify([m.time, m.draw])}`);
    }
    // narrower, the bar wraps and the chips with it, still below the kicker and above the map
    await b.open('', 880, 700);
    const n = await b.ev(`(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { kicker: r('.as-kicker').bottom, menu: r('.as-geo-menu').top, bar: r('.as-geo-bar').bottom, stage: r('.as-geo-stage').top }; })()`);
    assert.ok(n.menu >= n.kicker && n.bar <= n.stage + 0.5, `880 by 700: ${JSON.stringify(n)}`);
    assert.deepEqual(b.thrown, [], 'the page threw nothing');
  } finally {
    await b.close();
  }
});
