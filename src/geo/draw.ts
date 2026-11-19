/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/GeoMap's draw control (srad/agentspaces-geo.md GEO-F-21), the part with no DOM and no map library:
// the design's draw option read with its defaults, the drawing's state machine, the geodesic circle, and the context the
// design's action carries. The control (./DrawControl) feeds the machine the map's pointer events in longitude and
// latitude, and draws what it says; the tests drive the machine and the geometry directly where no WebGL runs.

export type DrawShape = 'circle' | 'polygon';
export type LonLat = [number, number];

/** The design's draw option, read with the catalog's defaults. */
export interface DrawSpec { action: string; shapes: DrawShape[]; label: string; maxVertices: number }

export const DRAW_LABEL = 'Draw an area';
export const DRAW_MIN_VERTICES = 3;
export const DRAW_MAX_VERTICES = 200;
export const DRAW_DEFAULT_VERTICES = 100;
/** The vertices of a circle's ring, the closing point aside. */
export const CIRCLE_VERTICES = 64;
/** A name's length, after trimming. */
export const NAME_MAX = 80;
/** A circle's radius in metres: under the least, 64 vertices rounded to 6 decimals could meet; past the most, a ring folds over a pole. */
export const RADIUS_MIN_M = 10;
export const RADIUS_MAX_M = 2_000_000;
/** The earth's mean radius in metres (IUGG), the sphere the circle is drawn on. */
const EARTH_M = 6_371_008.8;

/** Reads the design's draw option; nothing when it has no action, so the map shows no control. */
export function drawSpec(v: unknown): DrawSpec | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.action !== 'string' || !o.action.trim()) return undefined;
  const named = Array.isArray(o.shapes) ? (['circle', 'polygon'] as const).filter(s => (o.shapes as unknown[]).includes(s)) : [];
  const shapes: DrawShape[] = named.length ? [...named] : ['circle', 'polygon'];
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, NAME_MAX) : DRAW_LABEL;
  const m = o.maxVertices;
  const maxVertices = typeof m === 'number' && Number.isInteger(m) ? Math.min(DRAW_MAX_VERTICES, Math.max(DRAW_MIN_VERTICES, m)) : DRAW_DEFAULT_VERTICES;
  return { action: o.action, shapes, label, maxVertices };
}

/** A coordinate to 6 decimals (about 0.1 m), never -0. */
export const round6 = (x: number) => { const r = Math.round(x * 1e6) / 1e6; return r === 0 ? 0 : r; };
/** A longitude brought into -180..180. */
export const wrapLon = (lon: number) => { const w = ((((lon + 180) % 360) + 360) % 360) - 180; return w === -180 && lon > 0 ? 180 : w; };
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
export const roundPoint = (p: LonLat): LonLat => [round6(wrapLon(p[0])), round6(Math.max(-90, Math.min(90, p[1])))];

/** The great-circle distance between two points in metres. */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const [l1, p1] = [toRad(a[0]), toRad(a[1])];
  const [l2, p2] = [toRad(b[0]), toRad(b[1])];
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point a distance away on a bearing (degrees clockwise from north), on the sphere. */
export function destination(from: LonLat, meters: number, bearing: number): LonLat {
  const d = meters / EARTH_M;
  const t = toRad(bearing);
  const [l1, p1] = [toRad(from[0]), toRad(from[1])];
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(l2), toDeg(p2)];
}

/**
 * A geodesic circle as a closed ring of {@link CIRCLE_VERTICES} vertices (65 positions), counter-clockwise as GeoJSON's
 * right-hand rule asks, each rounded to 6 decimals.
 */
export function circleRing(center: LonLat, meters: number, n = CIRCLE_VERTICES): LonLat[] {
  const ring: LonLat[] = [];
  for (let i = 0; i < n; i++) ring.push(roundPoint(destination(center, meters, (360 - (i * 360) / n) % 360)));
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/** Twice a ring's signed area in degrees (positive counter-clockwise), enough to tell its turn. */
function turn(ring: readonly LonLat[]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s;
}

/**
 * A polygon's corners as a closed ring: rounded to 6 decimals, a corner that rounds onto the one before it dropped,
 * counter-clockwise. Nothing when fewer than three distinct corners remain.
 */
export function polygonRing(corners: readonly LonLat[]): LonLat[] | undefined {
  const pts: LonLat[] = [];
  for (const c of corners.map(roundPoint)) if (!pts.length || pts[pts.length - 1][0] !== c[0] || pts[pts.length - 1][1] !== c[1]) pts.push(c);
  while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 3) return undefined;
  const ring = [...pts, [pts[0][0], pts[0][1]] as LonLat];
  return turn(ring) < 0 ? ring.reverse() : ring;
}

/** A radius in words: metres under a kilometre, else kilometres. */
export function radiusText(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : m < 100_000 ? 1 : 0)} km`;
}

/** A name as the person typed it, trimmed and with control characters taken out; nothing when empty or too long. */
export function nameOf(raw: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const t = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return t && t.length <= NAME_MAX ? t : undefined;
}

/** What the design's action carries on Save (the draw contract). */
export interface DrawContext {
  shape: DrawShape;
  name: string;
  geometry: { type: 'Polygon'; coordinates: LonLat[][] };
  center?: LonLat;
  radiusMeters?: number;
}

// --- the state machine -------------------------------------------------------------------------------------------------

export type DrawState =
  | { phase: 'idle' }
  /** placing a circle: no centre yet, a centre being dragged from, or a centre waiting for a second click */
  | { phase: 'circle'; center?: LonLat; radius: number; dragging: boolean }
  /** placing a polygon's corners; hover is where the pointer is, for the line to it */
  | { phase: 'polygon'; corners: LonLat[]; hover?: LonLat }
  /** the shape is drawn and waits for its name; a circle from the keyboard also takes its radius here */
  | { phase: 'name'; shape: 'circle'; center: LonLat; radius: number; keyboard: boolean }
  | { phase: 'name'; shape: 'polygon'; corners: LonLat[] };

export type DrawEvent =
  | { type: 'start'; shape: DrawShape }
  /** the keyboard's way: a circle at the map's centre, its radius in a field */
  | { type: 'atCentre'; center: LonLat; radius: number }
  | { type: 'down'; at: LonLat }
  | { type: 'move'; at: LonLat }
  /** a press ends: moved says the pointer travelled (a drag), nearFirst and nearLast that it is on the first or last corner */
  | { type: 'up'; at: LonLat; moved: boolean; nearFirst?: boolean; nearLast?: boolean }
  /** Enter or a double-click: close the polygon */
  | { type: 'close' }
  /** Backspace: the last corner goes */
  | { type: 'undo' }
  | { type: 'radius'; meters: number }
  /** Escape or Cancel, at any point */
  | { type: 'cancel' };

export interface DrawStep { state: DrawState; say?: string }

export const IDLE: DrawState = { phase: 'idle' };
const clampRadius = (m: number) => Math.min(RADIUS_MAX_M, m);

/** The next state of a drawing, and what a screen reader hears of it. */
export function drawStep(s: DrawState, e: DrawEvent, maxVertices = DRAW_DEFAULT_VERTICES): DrawStep {
  if (e.type === 'cancel') return { state: IDLE, say: s.phase === 'idle' ? undefined : 'Drawing cancelled.' };
  if (e.type === 'start') {
    return e.shape === 'circle'
      ? { state: { phase: 'circle', radius: 0, dragging: false }, say: 'Drawing a circle: press at the centre, then drag or click a second point to set the radius. Escape cancels.' }
      : { state: { phase: 'polygon', corners: [] }, say: 'Drawing a polygon: click each corner; double-click, Enter or a click on the first corner closes it. Backspace removes the last corner, Escape cancels.' };
  }
  if (e.type === 'atCentre') {
    const radius = Math.max(RADIUS_MIN_M, clampRadius(e.radius));
    return { state: { phase: 'name', shape: 'circle', center: e.center, radius, keyboard: true }, say: `A circle at the map's centre, radius ${radiusText(radius)}. Set the radius and a name, then Save.` };
  }
  if (s.phase === 'circle') {
    if (e.type === 'down' && !s.center) return { state: { phase: 'circle', center: e.at, radius: 0, dragging: true } };
    if (e.type === 'move' && s.center) return { state: { ...s, radius: clampRadius(distanceMeters(s.center, e.at)) } };
    if (e.type === 'up' && s.center) {
      // a press with no drag sets the centre and waits for a second click; the second click, or the drag's end, the radius
      if (s.dragging && !e.moved) return { state: { ...s, radius: 0, dragging: false }, say: 'Centre set. Click a second point for the radius.' };
      const radius = clampRadius(distanceMeters(s.center, e.at));
      if (radius < RADIUS_MIN_M) return { state: { ...s, radius: 0, dragging: false }, say: `Too small: a radius of at least ${RADIUS_MIN_M} m. Click a point farther from the centre.` };
      return { state: { phase: 'name', shape: 'circle', center: s.center, radius, keyboard: false }, say: `A circle of radius ${radiusText(radius)}. Name it, then Save.` };
    }
    return { state: s };
  }
  if (s.phase === 'polygon') {
    if (e.type === 'move') return { state: { ...s, hover: e.at } };
    if (e.type === 'undo') {
      if (!s.corners.length) return { state: s, say: 'No corner to remove.' };
      const corners = s.corners.slice(0, -1);
      return { state: { ...s, corners }, say: `Corner removed: ${corners.length} corner${corners.length === 1 ? '' : 's'}.` };
    }
    const close = (): DrawStep => {
      if (!polygonRing(s.corners)) return { state: s, say: `A polygon needs at least ${DRAW_MIN_VERTICES} corners: ${s.corners.length} so far.` };
      return { state: { phase: 'name', shape: 'polygon', corners: s.corners }, say: `A polygon of ${s.corners.length} corners. Name it, then Save.` };
    };
    if (e.type === 'close') return close();
    if (e.type === 'up') {
      if (e.moved) return { state: s };
      if (e.nearFirst && s.corners.length >= DRAW_MIN_VERTICES) return close();
      if (e.nearLast && s.corners.length) return { state: s };   // a double-click's second click, or a click on the corner just placed
      if (s.corners.length >= maxVertices) return { state: s, say: `At most ${maxVertices} corners. Press Enter or double-click to close the polygon.` };
      const corners = [...s.corners, e.at];
      return { state: { ...s, corners }, say: `Corner ${corners.length}${corners.length === maxVertices ? `, the last of ${maxVertices}` : ''}.` };
    }
    return { state: s };
  }
  if (s.phase === 'name' && s.shape === 'circle' && e.type === 'radius') {
    return Number.isFinite(e.meters) && e.meters >= RADIUS_MIN_M ? { state: { ...s, radius: clampRadius(e.meters) } } : { state: s };
  }
  return { state: s };
}

/** The shape drawn so far as a GeoJSON geometry, for the overlay; nothing before there is one. */
export function sketchOf(s: DrawState): { geometry: { type: 'Polygon' | 'LineString'; coordinates: unknown }; corners: LonLat[] } | undefined {
  if ((s.phase === 'circle' || (s.phase === 'name' && s.shape === 'circle')) && s.center) {
    const corners = [s.center];
    return s.radius >= 1 ? { geometry: { type: 'Polygon', coordinates: [circleRing(s.center, s.radius)] }, corners } : { geometry: { type: 'LineString', coordinates: [s.center, s.center] }, corners };
  }
  if (s.phase === 'polygon' && s.corners.length) {
    const line = s.hover ? [...s.corners, s.hover] : s.corners;
    return { geometry: { type: 'LineString', coordinates: line.length > 1 ? line : [line[0], line[0]] }, corners: s.corners };
  }
  if (s.phase === 'name' && s.shape === 'polygon') {
    const ring = polygonRing(s.corners);
    return ring ? { geometry: { type: 'Polygon', coordinates: [ring] }, corners: s.corners } : undefined;
  }
  return undefined;
}

/** The action's context for a named shape (the draw contract); nothing when the name or the shape does not hold. */
export function drawContext(s: DrawState, rawName: string): DrawContext | undefined {
  if (s.phase !== 'name') return undefined;
  const name = nameOf(rawName);
  if (!name) return undefined;
  if (s.shape === 'circle') {
    if (!(s.radius >= RADIUS_MIN_M)) return undefined;
    // the ring is drawn from the centre and the radius the action carries, so an agent that checks one against the other agrees
    const radiusMeters = Math.round(clampRadius(s.radius) * 10) / 10;
    const center = roundPoint(s.center);
    return { shape: 'circle', name, geometry: { type: 'Polygon', coordinates: [circleRing(center, radiusMeters)] }, center, radiusMeters };
  }
  const ring = polygonRing(s.corners);
  return ring ? { shape: 'polygon', name, geometry: { type: 'Polygon', coordinates: [ring] } } : undefined;
}
