/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The pure hex grid for map overlays (srad/agentspaces-geo.md GEO-M-13): pointy-top axial hexes on Web
// Mercator (EPSG:3857) metres, anchored at the projection's origin, so a hex has the same id wherever it is computed. The
// twin of agentspaces-a2ui-geo's HexGrid.java, step for step, and both pass the shared vectors of
// agentspaces-a2ui-geo/src/test/resources/vectors/hexgrid.json (test/hexgrid.test.mjs). The steps (HexGrid's javadoc):
//   1. refuse a latitude or longitude that is not finite, a latitude beyond MAX_LAT either way, a longitude outside -180
//      to 180, a size outside 1 to 1,000,000;
//   2. project: a longitude of exactly 180 is -180; x = R * (lon * D2R), y = R * log(tan(PI / 4 + (lat * D2R) / 2));
//   3. fractional axial: qf = (sqrt(3) / 3 * x - y / 3) / size, rf = (2 / 3 * y) / size;
//   4. round to the nearest of the four candidates (floor(qf), floor(rf)), (floor(qf), floor(rf) + 1),
//      (floor(qf) + 1, floor(rf)), (floor(qf) + 1, floor(rf) + 1), by dq * dq + dq * dr + dr * dr, the first on a tie;
//   5. corners from the north one clockwise, back to degrees, each rounded to 6 decimals (ties toward +infinity), never
//      wrapped at the antimeridian.
// V8's Math.log, tan, atan and exp are fdlibm's, as Java's StrictMath, so both languages give the same bits.

/** The id's grid name: an id reads hx:<size>:<q>,<r>. */
export const HEX_PREFIX = 'hx';
/** The fine size: a 225 m Web Mercator edge (about 173 m on the ground at 39.74 degrees). */
export const HEX_R9 = 225;
/** The overview size: a 600 m Web Mercator edge (about 461 m on the ground at 39.74 degrees). */
export const HEX_R8 = 600;
/** Web Mercator's sphere, the WGS 84 semi-major axis. */
export const HEX_RADIUS = 6378137.0;
/** Web Mercator's latitude limit in degrees: no hex past it. */
export const HEX_MAX_LAT = 85.05112877980659;
/** The largest size an id may carry. */
export const HEX_MAX_SIZE = 1_000_000;

const R = HEX_RADIUS;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const QUARTER_PI = Math.PI / 4;
const HALF_PI = Math.PI / 2;
const SQRT3 = Math.sqrt(3.0);
const THIRD_SQRT3 = SQRT3 / 3.0;
const TWO_THIRDS = 2.0 / 3.0;
const INT_MIN = -2147483648, INT_MAX = 2147483647;

/** One hex: its size and its axial coordinates. */
export interface HexCell { size: number; q: number; r: number }

function checkSize(size: number): void {
  if (!Number.isInteger(size) || size < 1 || size > HEX_MAX_SIZE) throw new RangeError(`hex size ${size} is outside 1 to ${HEX_MAX_SIZE}`);
}

/** A hex's id, hx:<size>:<q>,<r>. */
export function hexId(c: HexCell): string {
  return `${HEX_PREFIX}:${c.size}:${c.q},${c.r}`;
}

/** The hex of a size that holds a WGS 84 point; refused, by name, as step 1 says. */
export function hexCell(lat: number, lon: number, size: number): HexCell {
  checkSize(size);
  if (!Number.isFinite(lat)) throw new RangeError(`latitude is not a finite number: ${lat}`);
  if (!Number.isFinite(lon)) throw new RangeError(`longitude is not a finite number: ${lon}`);
  if (lat > HEX_MAX_LAT || lat < -HEX_MAX_LAT) throw new RangeError(`latitude ${lat} is beyond Web Mercator's ${HEX_MAX_LAT} either way (the poles have no hex)`);
  if (lon > 180 || lon < -180) throw new RangeError(`longitude ${lon} is outside -180 to 180`);
  const l = lon === 180 ? -180 : lon;
  const x = R * (l * D2R);
  const y = R * Math.log(Math.tan(QUARTER_PI + (lat * D2R) / 2));
  const qf = (THIRD_SQRT3 * x - y / 3.0) / size;
  const rf = (TWO_THIRDS * y) / size;
  const [q, r] = roundAxial(qf, rf);
  return { size, q, r };
}

/** The id of the hex of a size that holds a WGS 84 point. */
export function hexOf(lat: number, lon: number, size: number): string {
  return hexId(hexCell(lat, lon, size));
}

/** The nearest axial centre to a fractional one, ties toward the smaller q, then the smaller r (step 4). */
export function roundAxial(qf: number, rf: number): [number, number] {
  const q0 = Math.floor(qf), r0 = Math.floor(rf);
  let best: [number, number] = [q0, r0];
  let least = Infinity;
  for (const c of [[q0, r0], [q0, r0 + 1], [q0 + 1, r0], [q0 + 1, r0 + 1]] as Array<[number, number]>) {
    const dq = qf - c[0], dr = rf - c[1];
    const d = dq * dq + dq * dr + dr * dr;
    if (d < least) { least = d; best = c; }
  }
  return best;
}

/** An integer written as Java's Integer.toString writes it, so one hex has one id; undefined otherwise. */
function canonicalInt(s: string): number | undefined {
  if (!/^-?\d+$/.test(s)) return undefined;
  const v = Number(s);
  if (!Number.isSafeInteger(v) || v < INT_MIN || v > INT_MAX || String(v) !== s) return undefined;
  return v;
}

/** Reads an id; a malformed one is refused, by name. */
export function parseHex(id: string): HexCell {
  const cell = tryParseHex(id);
  if (!cell) throw new RangeError(`not a hex id (hx:<size>:<q>,<r>): ${id}`);
  return cell;
}

/** Reads an id, or undefined when it is not a canonical hex id of a size from 1 to 1,000,000. */
export function tryParseHex(id: unknown): HexCell | undefined {
  if (typeof id !== 'string' || !id.startsWith(HEX_PREFIX + ':')) return undefined;
  const parts = id.split(':');
  if (parts.length !== 3) return undefined;
  const qr = parts[2].split(',');
  if (qr.length !== 2) return undefined;
  const size = canonicalInt(parts[1]), q = canonicalInt(qr[0]), r = canonicalInt(qr[1]);
  if (size === undefined || q === undefined || r === undefined || size < 1 || size > HEX_MAX_SIZE) return undefined;
  return { size, q, r };
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function latLon(x: number, y: number): [number, number] {
  const lon = (x / R) * R2D;
  const lat = (2 * Math.atan(Math.exp(y / R)) - HALF_PI) * R2D;
  return [round6(lat), round6(lon)];
}

/** The centre in Web Mercator metres (step 5). */
function centreXY(c: HexCell): [number, number] {
  return [c.size * SQRT3 * (c.q + c.r / 2.0), c.size * 1.5 * c.r];
}

/** The centre of a hex as [lat, lon], rounded to 6 decimals. */
export function hexCenter(id: string): [number, number] {
  const [x, y] = centreXY(parseHex(id));
  return latLon(x, y);
}

/** The six corners of a hex, each [lat, lon] rounded to 6 decimals, from the north corner clockwise (step 5). */
export function hexBoundary(id: string): Array<[number, number]> {
  const c = parseHex(id);
  const [cx, cy] = centreXY(c);
  const size = c.size;
  const w = (size * SQRT3) / 2.0;
  const h = size / 2.0;
  return [latLon(cx, cy + size), latLon(cx + w, cy + h), latLon(cx + w, cy - h), latLon(cx, cy - size), latLon(cx - w, cy - h), latLon(cx - w, cy + h)];
}

/** The boundary as a closed GeoJSON ring of [lon, lat], the north corner first and last. */
export function hexRing(id: string): Array<[number, number]> {
  const b = hexBoundary(id);
  const ring = b.map(([lat, lon]) => [lon, lat] as [number, number]);
  ring.push([b[0][1], b[0][0]]);
  return ring;
}

/** The six neighbours' ids, east first, then counter-clockwise: (+1,0), (+1,-1), (0,-1), (-1,0), (-1,+1), (0,+1). */
export function hexNeighbours(id: string): string[] {
  const c = parseHex(id);
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => hexId({ size: c.size, q: c.q + dq, r: c.r + dr }));
}

/** The number of hex steps between two hexes of one size; refused when the sizes differ. */
export function hexDistance(a: string, b: string): number {
  const x = parseHex(a), y = parseHex(b);
  if (x.size !== y.size) throw new RangeError(`hexes of two sizes have no distance: ${a}, ${b}`);
  const dq = x.q - y.q, dr = x.r - y.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
