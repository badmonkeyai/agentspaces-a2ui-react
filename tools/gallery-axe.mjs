#!/usr/bin/env node
/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The accessibility check of the gallery: serves dist/ on a free port, opens dist/gallery.html in headless Chrome over
// the DevTools protocol in light and in dark mode, waits for every golden to draw, runs axe-core over the page twice
// (as drawn, then with every menu open), and fails on any serious or critical violation. It writes what it found to
// dist/axe.json. Without Chrome it says so and stops, as the platform's gallery shot does.
//   node tools/gallery-axe.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.log('gallery-axe: skipped (no Chrome at ' + CHROME + ')'); process.exit(0); }
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = join('dist', decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'gallery.html');
  if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const debug = 9100 + Math.floor(Math.random() * 300);
const profile = '/tmp/as_axe_' + debug;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--window-size=1280,1600', '--remote-debugging-port=' + debug, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
let targets;
for (let attempt = 0; ; attempt++) { try { targets = await (await fetch(`http://127.0.0.1:${debug}/json`)).json(); break; } catch (e) { if (attempt >= 50) throw e; await new Promise(r => setTimeout(r, 200)); } }
const ws = new WebSocket((targets.find(t => t.type === 'page') || targets[0]).webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = {}; const errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');

const report = {};
let failed = 0;
try {
  for (const mode of ['light', 'dark']) {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/gallery.html?mode=${mode}` });
    for (let i = 0; i < 50; i++) { if ((await evaluate(`document.querySelectorAll('[data-golden]').length`)) >= 20) break; await new Promise(r => setTimeout(r, 200)); }
    await new Promise(r => setTimeout(r, 800));
    await evaluate(AXE);
    for (const pass of ['drawn', 'menus open']) {
      if (pass === 'menus open') await evaluate(`[...document.querySelectorAll('[data-component="Menu"] > button:not([disabled])')].forEach(b => b.click()); true`);
      await new Promise(r => setTimeout(r, 300));
      const found = JSON.parse(await evaluate(`axe.run(document, { resultTypes: ['violations'] }).then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map(n => n.target.join(' ')) }))))`, true));
      const serious = found.filter(v => v.impact === 'serious' || v.impact === 'critical');
      report[`${mode}, ${pass}`] = found;
      failed += serious.length;
      console.log(`gallery-axe: ${mode} mode, ${pass}: ${found.length} violation(s), ${serious.length} serious or critical`);
      for (const v of serious) console.log(`  ${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.join('\n    ')}`);
    }
  }
} finally {
  ws.close(); server.close();
  await new Promise(r => { chrome.once('exit', r); chrome.kill(); });
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
writeFileSync('dist/axe.json', JSON.stringify({ report, errors }, null, 2) + '\n');
if (errors.length) { console.log('gallery-axe: the page threw:\n  ' + errors.join('\n  ')); process.exit(1); }
if (failed) { console.log(`gallery-axe: FAILED, ${failed} serious or critical violation(s)`); process.exit(1); }
console.log('gallery-axe: no serious or critical violation in either mode');
