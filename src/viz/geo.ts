/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The geometry and the bookkeeping of the Map component, with no drawing library in it,
// so they are tested in Node and the adapter stays the one place deck.gl and MapLibre are touched: rows to layers,
// a bearing between two positions, a polygon from a row, the icons as SVG data URLs, and the stable order of keys
// that lets deck.gl animate an icon from its previous position to its newest instead of redrawing it.

export type Row = Record<string, unknown>;

export type LayerKind = 'icons' | 'markers' | 'tracks' | 'areas' | 'heat' | 'geojson' | 'alerts';
export const LAYER_KINDS: readonly LayerKind[] = ['icons', 'markers', 'tracks', 'areas', 'heat', 'geojson', 'alerts'];

/** One layer as the catalog describes it. */
export interface LayerSpec {
  kind: string;
  path: string;
  key?: string;
  label?: string;
  icon?: string;
  size?: number;
  heading?: string;
  timeField?: string;
  trail?: number;
  color?: string;
}

/** One layer with its rows and its resolved hue, what the adapter draws. */
export interface MapLayer extends LayerSpec {
  kind: LayerKind;
  index: number;
  color: string;
  rows: Row[];
  geojson?: object;
}

export const ICON_NAMES = ['dot', 'pin', 'truck', 'van', 'car', 'plane', 'ship', 'person', 'arrow'] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** The icons, as SVG paths on a 24 by 24 grid pointing north where a direction makes sense; drawn white and masked by the layer's hue. */
const PATHS: Record<IconName, string> = {
  dot: 'M12 4a8 8 0 1 1 0 16a8 8 0 0 1 0-16z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5a2.5 2.5 0 0 1 0 5z',
  truck: 'M7 2h10a1 1 0 0 1 1 1v6h-1V4H7v5H6V3a1 1 0 0 1 1-1zm-2 8h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H10a2 2 0 0 1-4 0H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
  van: 'M8 2h8a2 2 0 0 1 2 2v3H6V4a2 2 0 0 1 2-2zm-2 7h12v10a2 2 0 0 1-2 2h-1a1.5 1.5 0 0 1-3 0h-2a1.5 1.5 0 0 1-3 0H8a2 2 0 0 1-2-2V9z',
  car: 'M9 3h6l2 5h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1a1.5 1.5 0 0 1-3 0h-4a1.5 1.5 0 0 1-3 0H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h1l2-5zm0 2l-1 3h8l-1-3H9z',
  plane: 'M12 1l2 7h8l-1 3h-7l-1 6l3 2v2l-4-1l-4 1v-2l3-2l-1-6H3L2 8h8l2-7z',
  ship: 'M11 2h2v3h4l1 3h-12l1-3h4V2zM4 10h16l-2 7a6 6 0 0 1-12 0l-2-7zm0 9h16v2H4v-2z',
  person: 'M12 2a3 3 0 1 1 0 6a3 3 0 0 1 0-6zm-5 9a5 5 0 0 1 10 0v9H7v-9z',
  arrow: 'M12 2l8 18l-8-4l-8 4l8-18z',
};

/** The icon's name, or dot for a name the catalog does not list. */
export function iconName(v: unknown): IconName {
  return typeof v === 'string' && (ICON_NAMES as readonly string[]).includes(v) ? (v as IconName) : 'dot';
}

/** The icon as a data URL deck.gl loads once per name; white, so a mask paints it the layer's hue. */
export function iconUrl(name: IconName): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><path fill="#fff" d="${PATHS[name]}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function number(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}

/** The rows at a value: an array, an object's values, or nothing (a GeoJSON object is not rows). */
export function rowsOf(v: unknown): Row[] {
  if (Array.isArray(v)) return v.filter(r => r && typeof r === 'object') as Row[];
  if (v && typeof v === 'object' && !('type' in (v as Row))) return Object.values(v as Record<string, Row>).filter(r => r && typeof r === 'object');
  return [];
}

/** A row with a latitude and a longitude. */
export function positioned(r: Row): boolean {
  return number(r.lat) !== undefined && number(r.lon) !== undefined;
}

/** The bearing from one position to another in degrees clockwise from north, 0 when they are the same place. */
export function bearing(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const rad = Math.PI / 180;
  const dLon = (toLon - fromLon) * rad;
  const y = Math.sin(dLon) * Math.cos(toLat * rad);
  const x = Math.cos(fromLat * rad) * Math.sin(toLat * rad) - Math.sin(fromLat * rad) * Math.cos(toLat * rad) * Math.cos(dLon);
  if (x === 0 && y === 0) return 0;
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

/** The heading of a row: its heading field when it has one, else the bearing from the previous position, else 0. */
export function headingOf(row: Row, previous: Row | undefined, headingField?: string): number {
  const h = headingField ? number(row[headingField]) : undefined;
  if (h !== undefined) return ((h % 360) + 360) % 360;
  if (previous && positioned(previous) && positioned(row)) return bearing(number(previous.lat)!, number(previous.lon)!, number(row.lat)!, number(row.lon)!);
  return 0;
}

/**
 * A polygon from a row as a ring of [lon, lat]: {@code polygon} as [[lat, lon], ...] (the agent's order), or a GeoJSON
 * {@code geometry} of type Polygon (the first ring), or nothing.
 */
export function polygonOf(r: Row): [number, number][] | undefined {
  const p = r.polygon;
  if (Array.isArray(p) && p.length >= 3) {
    const ring = p.map(pt => (Array.isArray(pt) && pt.length >= 2 ? [number(pt[1]), number(pt[0])] : [undefined, undefined]));
    if (ring.every(([lon, lat]) => lon !== undefined && lat !== undefined)) return ring as [number, number][];
    return undefined;
  }
  const g = r.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (g && g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0])) {
    const ring = (g.coordinates[0] as unknown[]).map(pt => (Array.isArray(pt) && pt.length >= 2 ? [number(pt[0]), number(pt[1])] : [undefined, undefined]));
    if (ring.length >= 3 && ring.every(([lon, lat]) => lon !== undefined && lat !== undefined)) return ring as [number, number][];
  }
  return undefined;
}

/** Whether a position is inside a ring (ray casting; a point on the edge counts as inside). */
export function inside(lat: number, lon: number, ring: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The stable order of keys: the first time a key is seen it takes the next index and keeps it, so the row of a key
 * stays at the same index of the layer's data from one update to the next, and deck.gl's transition moves that icon
 * instead of redrawing the layer. A key that leaves keeps its index for the day; a layer rarely has thousands of keys.
 */
export class KeyOrder {
  private readonly index = new Map<string, number>();
  private readonly previous = new Map<string, Row>();

  /** The rows of a key field in their stable order (one per key, the last row of a key winning), with the previous row of each key beside it. */
  order(rows: Row[], keyField: string | undefined): Array<{ key: string; row: Row; previous?: Row }> {
    const latest = new Map<string, Row>();
    rows.forEach((r, i) => { const k = keyField ? String(r[keyField] ?? i) : String(i); latest.set(k, r); if (!this.index.has(k)) this.index.set(k, this.index.size); });
    const out = [...latest.entries()].map(([key, row]) => ({ key, row, previous: this.previous.get(key) })).sort((a, b) => this.index.get(a.key)! - this.index.get(b.key)!);
    out.forEach(o => this.previous.set(o.key, o.row));
    return out;
  }
}

/**
 * The trails a map keeps for itself: the last positions of each key, appended as the key's newest
 * position changes, so a tracks layer over the positions path draws a trail without the agent sending every point
 * every second (a trail of forty points for twelve units was 480 rows a second replicated to every member).
 */
export class TrailBook {
  private readonly trails = new Map<string, [number, number][]>();

  /** Appends a key's position when it moved; keeps at most {@code max} points. */
  push(key: string, lon: number, lat: number, max: number): void {
    let t = this.trails.get(key);
    if (!t) { t = []; this.trails.set(key, t); }
    const last = t[t.length - 1];
    if (last && last[0] === lon && last[1] === lat) return;
    t.push([lon, lat]);
    while (t.length > Math.max(2, max)) t.shift();
  }

  /** The keys with their paths, oldest first; a key with one point has no path yet. */
  paths(): Array<{ key: string; path: [number, number][] }> {
    return [...this.trails.entries()].filter(([, p]) => p.length >= 2).map(([key, path]) => ({ key, path: path.slice() }));
  }

  size(): number { return this.trails.size; }
}

/** The track of each key: its last {@code trail} positioned rows in time order (the time field, else the rows' order). */
export function trailOf(rows: Row[], keyField: string | undefined, timeField: string | undefined, trail: number): Map<string, Row[]> {
  const byKey = new Map<string, Row[]>();
  rows.filter(positioned).forEach((r, i) => { const k = keyField ? String(r[keyField] ?? '') : String(i); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(r); });
  const t = timeField || 'at';
  byKey.forEach((list, k) => {
    const sorted = list.every(r => r[t] !== undefined) ? [...list].sort((a, b) => String(a[t]).localeCompare(String(b[t]))) : list;
    byKey.set(k, sorted.slice(Math.max(0, sorted.length - Math.max(2, trail))));
  });
  return byKey;
}

/** The hue of a layer: an index into the look's categorical set (as a number or a numeral), a hex colour, or the layer's turn. */
export function hueOf(spec: LayerSpec, index: number, hues: string[]): string {
  const c = spec.color;
  if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  const n = number(c);
  if (n !== undefined && hues.length) return hues[Math.abs(Math.trunc(n)) % hues.length];
  return hues.length ? hues[index % hues.length] : '#4477aa';
}

/** The layers of a Map from its specs and the data at each path. */
export function layersOf(specs: LayerSpec[], dataAt: (path: string) => unknown, hues: string[]): MapLayer[] {
  return specs.map((s, i) => {
    const kind = (LAYER_KINDS as readonly string[]).includes(s.kind) ? (s.kind as LayerKind) : 'markers';
    const v = dataAt(s.path);
    return { ...s, kind, index: i, color: hueOf(s, i, hues), rows: kind === 'geojson' ? [] : rowsOf(v), geojson: kind === 'geojson' && v && typeof v === 'object' ? (v as object) : undefined };
  });
}

/** The bounds of every positioned row and polygon vertex of the layers, as [[west, south], [east, north]], or nothing. */
export function boundsOf(layers: MapLayer[]): [[number, number], [number, number]] | undefined {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity, any = false;
  const take = (lon: number, lat: number) => { west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat); any = true; };
  for (const l of layers) {
    if (l.kind === 'alerts') continue;
    for (const r of l.rows) {
      if (l.kind === 'areas') { polygonOf(r)?.forEach(([lon, lat]) => take(lon, lat)); continue; }
      if (positioned(r)) take(number(r.lon)!, number(r.lat)!);
    }
  }
  return any ? [[west, south], [east, north]] : undefined;
}

export const SEVERITIES = ['info', 'warning', 'serious', 'critical'] as const;
export function severityOf(v: unknown): (typeof SEVERITIES)[number] {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v) ? (v as (typeof SEVERITIES)[number]) : 'warning';
}

/** The label of a row for a layer: its label field, else its key field, else nothing. */
export function labelOf(l: LayerSpec, r: Row): string {
  if (l.label && r[l.label] !== undefined && r[l.label] !== null) return String(r[l.label]);
  if (l.key && r[l.key] !== undefined && r[l.key] !== null) return String(r[l.key]);
  return '';
}

/** What the legend says of a layer: its label field or key or the last segment of its path, and its kind. */
export function legendName(l: LayerSpec): string {
  const seg = l.path.split('/').filter(Boolean).pop() ?? l.path;
  return seg || l.kind;
}
