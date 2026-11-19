// Empty states and times: a list says it is loading only until the page's data
// first arrives; a path the data then lacks (no binding: a FileShare used as a drop target) shows the empty words, as an
// empty answer does, in FileTree, Watchbox, DataTable, Notification and a map's layers; a Notification's time reads to the
// minute in UTC, never a raw instant with its nanoseconds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope } from './setup.mjs';

test('FileTree and FileShare say Loading only until the data arrives; then a path with no binding shows the empty words', async () => {
  const tree = { id: 'tree', component: 'FileTree', reads: '/files', label: 'Files' };
  const loading = await draw(envelope('ft1', [tree], undefined, 'agentspaces-widgets'));
  assert.ok(loading.text().includes('Loading files'), 'no data yet: loading');
  await loading.unmount();
  const unbound = await draw(envelope('ft2', [tree, { id: 'note', component: 'Text', text: '/note' }], { note: 'the page\'s other data' }, 'agentspaces-widgets'));
  assert.ok(!unbound.text().includes('Loading files'), unbound.text());
  assert.ok(unbound.text().includes('No file yet'));
  assert.equal(unbound.container.querySelector('[aria-busy="true"]'), null, 'no busy list');
  await unbound.unmount();
  const share = await draw(envelope('fs', [{ id: 'drop', component: 'FileShare', label: 'Drop a file', accept: ['.csv'] }], { datasets: [] }, 'agentspaces-widgets'));
  assert.ok(!share.text().includes('Loading files'), 'a drop target on a page whose data has come');
  await share.unmount();
  const empty = await draw(envelope('ft3', [tree], { files: [] }, 'agentspaces-widgets'));
  assert.ok(empty.text().includes('No file yet'));
  await empty.unmount();
});

test('a Watchbox and a map\'s layer on a path the arrived data lacks are quiet, not loading; DataTable and Notification say their empty words', async () => {
  const box = await draw(envelope('wb', [{ id: 'w', component: 'Watchbox', path: '/incidents', label: 'incidents' }], { other: [] }, 'agentspaces-geo'));
  assert.ok(box.text().includes('All quiet') && !box.text().includes('Loading'), box.text());
  await box.unmount();
  const waiting = await draw(envelope('wb2', [{ id: 'w', component: 'Watchbox', path: '/incidents', label: 'incidents' }], undefined, 'agentspaces-geo'));
  assert.ok(waiting.text().includes('Loading incidents'));
  await waiting.unmount();
  const map = await draw(envelope('gm', [{ id: 'm', component: 'GeoMap', layers: [{ path: '/ships', label: 'Ships' }] }], { other: 1 }, 'agentspaces-geo'));
  assert.ok(map.text().includes('No feature yet') && !map.text().includes('Loading the features'), map.text());
  await map.unmount();
  const table = await draw(envelope('dt', [{ id: 't', component: 'DataTable', columns: [{ key: 'a' }], rows: '/rows' }], { rows: [] }));
  assert.ok(table.text().includes('No row yet.') && !table.container.querySelector('[aria-busy="true"]'));
  await table.unmount();
  const n = await draw(envelope('nt', [{ id: 'n', component: 'Notification', items: '/alerts', ackAction: 'ack' }], { alerts: [] }));
  assert.ok(n.text().includes('Nothing to acknowledge.'));
  await n.unmount();
});

test('a Notification\'s time reads to the minute in UTC, with its date when it is not today, and keeps the instant in its time element', async () => {
  const today = new Date(); today.setUTCHours(14, 2, 40, 307);
  const at = today.toISOString().replace('Z', '242590Z');   // nanoseconds, as a Java instant writes them
  const p = await draw(envelope('nw', [{ id: 'n', component: 'Notification', items: '/alerts', ackAction: 'ack', groupBy: 'none' }],
    { alerts: [{ id: 'a', severity: 'warning', title: 'Today', at }, { id: 'b', severity: 'info', title: 'Before', at: '2026-01-02T09:17:40.307242590Z' }] }));
  const times = [...p.container.querySelectorAll('.when time')];
  assert.deepEqual(times.map(t => t.textContent), ['14:02 UTC', '2026-01-02 09:17 UTC']);
  assert.equal(times[1].getAttribute('datetime'), '2026-01-02T09:17:40.307242590Z');
  assert.ok(!p.text().includes('307242590'), 'no nanoseconds on the page');
  await p.unmount();
});
