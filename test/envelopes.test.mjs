// The envelope log a page keeps (spiral 6's shared build, 2026-11-11: the FIT's soak held the geo page open an hour and
// its heap grew from 8.8 to 16.7 MiB, 2,369 data writes of the same paths kept in React state). A data write replaces
// the earlier writes it covers in the log, so a page open for a day holds what it draws, not every write it was sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, envelope } from './setup.mjs';

const { appendEnvelope, SUPERSEDED } = await import('../dist/index.js');
const data = (surfaceId, path, value) => ({ version: 'v0.9.1', updateDataModel: { surfaceId, path, value } });
const shape = log => log.map(e => (e === SUPERSEDED ? '-' : e.updateDataModel ? `${e.updateDataModel.surfaceId}${e.updateDataModel.path ?? ''}` : Object.keys(e)[1]));
const append = (log, ...envelopes) => envelopes.reduce(appendEnvelope, log);

test('a data write replaces the earlier writes at its path and below it, of its own surface, and nothing else', () => {
  const log = append([], { version: 'v0.9.1', createSurface: { surfaceId: 'm', catalogId: 'agentspaces-viz' } },
    data('m', '/units', [1]), data('m', '/units/0/lat', 5), data('m', '/unitsAll', 1), data('m', '/title', 'a'), data('n', '/units', [9]),
    data('m', '/units', [2]));
  assert.deepEqual(shape(log), ['createSurface', '-', '-', 'm/unitsAll', 'm/title', 'n/units', 'm/units']);
  // a write below an earlier one leaves the earlier one, which still draws its other parts
  assert.deepEqual(shape(appendEnvelope(log, data('m', '/units/1', 3))).slice(-2), ['m/units', 'm/units/1']);
  // the whole model, by '/' or by no path, replaces every earlier data write of the surface
  assert.deepEqual(shape(appendEnvelope(log, data('m', '/', {}))), ['createSurface', '-', '-', '-', '-', 'n/units', '-', 'm/']);
  assert.deepEqual(shape(appendEnvelope(log, data('m', undefined, {}))).filter(x => x !== '-'), ['createSurface', 'n/units', 'm']);
  // the log it was given is left as it was
  assert.equal(log.length, 7);
});

test('a thousand writes of one path keep one of them, and the log grows by one slot each', () => {
  let log = [{ version: 'v0.9.1', createSurface: { surfaceId: 'geo', catalogId: 'agentspaces-viz' } }];
  for (let i = 0; i < 1000; i++) log = appendEnvelope(log, data('geo', '/units', Array.from({ length: 12 }, (_, u) => ({ unit: `truck-${u}`, lat: i, lon: u }))));
  assert.equal(log.length, 1001);
  assert.equal(log.filter(e => e !== SUPERSEDED).length, 2);
  assert.equal(log[1000].updateDataModel.value[0].lat, 999);
});

test('the renderer passes over a replaced write and draws the one that replaced it, with no problem', async () => {
  const [create, components] = envelope('s', [{ id: 't', component: 'Text', text: { path: '/title' } }]);
  const log = append([], create, components, data('s', '/title', 'first'), data('s', '/title', 'second'));
  assert.equal(log[2], SUPERSEDED);
  const r = await draw(log);
  assert.match(r.text(), /second/);
  assert.doesNotMatch(r.text(), /first/);
  assert.deepEqual(r.problems, []);
  await r.unmount();
});
