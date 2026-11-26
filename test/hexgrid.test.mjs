// The pure hex grid in TypeScript (srad/agentspaces-geo.md GEO-M-13): it passes every line of the vectors the Java
// HexGrid writes and passes (agentspaces-a2ui-geo/src/test/resources/vectors/hexgrid.json), to the bit: the 400 ids,
// centres and boundaries at both sizes, and the 8 refusals by the rule each names. Then what the vectors do not hold: the
// antimeridian as one line, canonical ids only, the neighbours and the distance, and the closed GeoJSON ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ui } from './setup.mjs';

const vectors = JSON.parse(readFileSync(new URL('../../agentspaces-a2ui-geo/src/test/resources/vectors/hexgrid.json', import.meta.url), 'utf8'));

test('every vector: the id, the centre and the six corners match the Java grid to the bit', () => {
  assert.equal(vectors.radius, ui.HEX_RADIUS);
  assert.equal(vectors.maxLat, ui.HEX_MAX_LAT);
  assert.deepEqual(vectors.sizes, [ui.HEX_R9, ui.HEX_R8]);
  assert.equal(vectors.points.length, 200);
  let checked = 0;
  for (const p of vectors.points) {
    for (const h of p.hexes) {
      assert.equal(ui.hexOf(p.lat, p.lon, h.size), h.id, `${p.lat}, ${p.lon} at ${h.size}`);
      assert.deepEqual(ui.hexCenter(h.id), h.center, `${h.id}'s centre`);
      assert.deepEqual(ui.hexBoundary(h.id), h.boundary, `${h.id}'s corners`);
      checked++;
    }
  }
  assert.equal(checked, 400);
});

test('every refusal of the vectors is refused, naming its rule', () => {
  assert.equal(vectors.refused.length, 8);
  for (const r of vectors.refused) {
    // the Java message writes a double as 90.0 where JavaScript writes 90: the rule's words are the same
    const words = r.error.split(' ')[0] === 'hex' ? /^hex size \d+ is outside 1 to 1000000/ : new RegExp('^' + r.error.split(' ')[0] + ' -?[\\d.]+ ' + r.error.split(' ').slice(2).join(' '));
    assert.throws(() => ui.hexOf(r.lat, r.lon, r.size), e => words.test(e.message), JSON.stringify(r));
  }
  assert.throws(() => ui.hexOf(Number.NaN, 0, 225), /latitude is not a finite number/);
  assert.throws(() => ui.hexOf(0, Infinity, 225), /longitude is not a finite number/);
  assert.throws(() => ui.hexOf(0, 0, 22.5), /hex size 22.5 is outside/);
});

test('the antimeridian is one line, ids are canonical, and a ring is closed in GeoJSON order', () => {
  assert.equal(ui.hexOf(10, 180, 600), ui.hexOf(10, -180, 600));
  const id = ui.hexOf(39.7392, -104.9903, ui.HEX_R9);
  assert.deepEqual(ui.parseHex(id), { size: 225, ...(([q, r]) => ({ q, r }))(id.split(':')[2].split(',').map(Number)) });
  for (const bad of ['hx:225:01,2', 'hx:0:1,1', 'hx:225:1', 'h3:9:abc', 'hx:225:1,2,3', 'hx:+225:1,2', 'hx:1000001:0,0', 'hx:225:2147483648,0', 42, null]) {
    assert.equal(ui.tryParseHex(bad), undefined, String(bad));
  }
  assert.throws(() => ui.parseHex('hx:225:01,2'), /not a hex id/);
  const ring = ui.hexRing(id);
  assert.equal(ring.length, 7);
  assert.deepEqual(ring[0], ring[6]);
  const [lat, lon] = ui.hexBoundary(id)[0];
  assert.deepEqual(ring[0], [lon, lat], 'a ring is [longitude, latitude]');
});

test('six neighbours at one step, each sharing two corners; the distance counts steps and refuses two sizes', () => {
  const id = ui.hexOf(39.7392, -104.9903, ui.HEX_R9);
  const ns = ui.hexNeighbours(id);
  assert.equal(new Set(ns).size, 6);
  const corners = new Set(ui.hexBoundary(id).map(c => c.join()));
  for (const n of ns) {
    assert.equal(ui.hexDistance(id, n), 1);
    assert.equal(ui.hexBoundary(n).filter(c => corners.has(c.join())).length, 2, `${n} shares an edge`);
  }
  const c = ui.parseHex(id);
  assert.equal(ui.hexDistance(id, ui.hexId({ size: c.size, q: c.q + 3, r: c.r - 1 })), 3);
  assert.equal(ui.hexDistance(id, id), 0);
  assert.throws(() => ui.hexDistance(id, ui.hexOf(39.7392, -104.9903, ui.HEX_R8)), /two sizes/);
});
