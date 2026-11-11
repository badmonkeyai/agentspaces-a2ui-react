// Notification draws an item field as a second line
// (detail) and names its route button (routeLabel), with labelled actions; props {items, ackAction} alone draw as before.
// Notice takes its status word from a path (statusPath), so a page colours the box from the record it binds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { click, draw, envelope } from './setup.mjs';

const items = [
  { id: 'a-1', severity: 'serious', title: 'Device A (Unknown) was heard at 4 of your places over 52 minutes', detail: 'Heard at 4 places. Recurrence is an indicator.', at: '2026-11-03T14:57:00Z' },
  { id: 'a-2', severity: 'warning', title: 'Device B may be yours', detail: 'Heard at every stop.', at: '2026-11-03T15:00:00Z', acknowledged: true },
];

test('Notification draws the detail line and the route label, and labels its buttons', async () => {
  const { container, text, actions, problems, unmount } = await draw(envelope('alerts',
    [{ id: 'box', component: 'Notification', items: '/alerts', ackAction: 'acknowledge', routeAction: 'send', detail: 'detail', routeLabel: 'Send', groupBy: 'none' }],
    { alerts: items }));
  assert.deepEqual(problems, []);
  assert.ok(text().includes('Heard at 4 places. Recurrence is an indicator.'), text());
  const send = [...container.querySelectorAll('button')].filter(b => b.textContent === 'Send');
  assert.equal(send.length, 2, 'one Send per item');
  assert.match(send[0].getAttribute('aria-label'), /^Send: Device A/);
  const ack = [...container.querySelectorAll('button')].filter(b => b.textContent === 'Acknowledge');
  assert.equal(ack.length, 1, 'an acknowledged item has no Acknowledge');
  assert.match(ack[0].getAttribute('aria-label'), /^Acknowledge: Device A/);
  await click(send[0]);
  assert.ok(actions.some(a => JSON.stringify(a).includes('send') && JSON.stringify(a).includes('a-1')), JSON.stringify(actions));
  await unmount();
});

test('Notification with items and ackAction alone draws as before: no detail line, the route button says Route', async () => {
  const { container, text, unmount } = await draw(envelope('plain',
    [{ id: 'box', component: 'Notification', items: '/alerts', ackAction: 'acknowledge', routeAction: 'route' }],
    { alerts: items }));
  assert.ok(!text().includes('Recurrence is an indicator'), 'no detail unless the design names the field');
  assert.ok([...container.querySelectorAll('button')].some(b => b.textContent === 'Route'));
  await unmount();
});

test('Notice takes its status from a path, and keeps the literal when the path holds no status word', async () => {
  const comps = [{ id: 'n', component: 'Notice', title: 'The analysis', status: 'info', statusPath: '/analysis/status', text: '/analysis/text' }];
  let d = await draw(envelope('n1', comps, { analysis: { status: 'warning', text: 'Analysis paused: 2 peers claim wireless-patterns.' } }));
  assert.ok(d.container.querySelector('.bma-notice.bma-status-warning'), d.container.innerHTML);
  assert.ok(d.text().includes('Analysis paused'));
  await d.unmount();
  d = await draw(envelope('n2', comps, { analysis: { status: 'pink', text: 'Ready.' } }));
  assert.ok(d.container.querySelector('.bma-notice.bma-status-info'), 'not a status word: the literal holds');
  await d.unmount();
});
