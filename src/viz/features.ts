/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The GeoFeatures of agentspaces-geo (srad/agentspaces-geo.md §3.1, phase 2) as the map, the card, the search and the
// layer menu read them, with no map library: a layer's features from the data model (a row that is not a GeoFeature is
// left out, GEO-F-04), the kind filter, the colour of each feature (its style, else its kind's, else the layer's, else
// the look's categorical hue for the layer's turn, GEO-M-01), bounds, the grid clusters a layer draws below its zoom
// (GEO-M-04), the search over labels, ids and named properties (GEO-S-01), and the card's fields and age (GEO-S-03).
import { ICON_NAMES, type IconName } from './geo';
import { hexRing, hexCenter, tryParseHex } from '../geo/hexgrid';
import { rampColor, rampDomain, type RampDomain } from './ramp';
import { rowFilterOf, rowTest, type RowFilter } from './filter';

export type Position = number[];
export interface Geometry { type: string; coordinates: unknown }
export interface Style { color?: string; fill?: string; stroke?: string; opacity?: number; width?: number; size?: number; heading?: number; icon?: string }
export interface Feature {
  id: string; kind: string; label: string; geometry: Geometry; properties: Record<string, unknown>; style: Style; at: string;
  severity?: string; links?: Array<{ rel: string; id: string }>;
  /** A hex layer's hexagon (srad/agentspaces-geo.md GEO-M-11): its id, its centre as [longitude, latitude], and the row it draws. */
  hex?: { id: string; centre: [number, number]; row: Record<string, unknown> };
}
export interface FeatureKindRow { kind: string; label?: string; style?: Style; fields?: string[] }
/** How a hex layer reads its rows (the catalog's GeoMap layer hexes). */
export interface HexesSpec { id: string; value: string; size?: number; label?: string; card?: Array<{ key: string; title: string }> }
export interface FeatureLayerSpec { path: string; kind?: string; label?: string; style?: Style; cluster?: { below?: number }; pick?: unknown; hexes?: unknown; filter?: unknown; labels?: unknown; fitNew?: unknown }
export interface FeatureLayer extends FeatureLayerSpec {
  index: number;
  /** How the layer reads the pick set (the catalog's GeoMap layer pick), when it does. */
  picks?: PickSpec;
  /** The layer's own hue: its style's colour, else the look's categorical hue for its turn. */
  color: string;
  features: Feature[];
  /** How many matched before the binding's max (the sibling {name}Total), when the data says and this layer is the whole path. */
  total?: number;
  /**
   * When the binding was cut at its max and this layer draws only some kinds of its path: how many the path holds and how
   * many the binding matched. The layer's own total is then unknown (several layers may share one binding).
   */
  cut?: { held: number; total: number };
  /** The path holds nothing yet: the data has not arrived (a feed writes a list for every binding, an empty one too). */
  pending?: boolean;
  /** The path holds a value that is not a list or a map of rows, so no feature of it can be read. */
  broken?: boolean;
  /** A hex layer: how it reads its rows, and its ramp's domain over every row it holds (before the filter), with the ramp. */
  hexes?: HexesSpec;
  ramp?: { domain: RampDomain; steps: readonly string[] };
  /** The layer's filter (GEO-M-12), and, while it keeps fewer than it holds, how many it keeps of how many. */
  rowFilter?: RowFilter;
  filtered?: { kept: number; of: number };
  /**
   * The ids of the features whose labels the layer shows (its labels' filter), when it keeps them to some; nothing shows
   * every label. The selected and the hovered feature's label shows either way.
   */
  labelIds?: ReadonlySet<string>;
  /** The GeoLayout windows (pages) while any of which is open the layer shows no label but the selected and hovered one's. */
  hideLabelsWhileOpen?: readonly string[];
}

/**
 * The features a map's fitNew layers (the catalog's GeoMap layer fitNew) did not hold at the last drawing, and records what
 * they hold now in `held` (by layer index). A layer still to arrive is skipped, and a layer's first record fits nothing,
 * so a page that opens, or whose data arrives, keeps its view (kismet-life-patterns §10.13).
 */
export function freshFeatures(layers: readonly FeatureLayer[], held: Map<number, Set<string>>): Feature[] {
  const fresh: Feature[] = [];
  for (const l of layers) {
    if (l.fitNew !== true || l.pending) continue;
    const before = held.get(l.index);
    held.set(l.index, new Set(l.features.map(f => f.id)));
    if (before) fresh.push(...l.features.filter(f => !before.has(f.id)));
  }
  return fresh;
}

/** A layer's labels (the catalog's GeoMap layer labels): its filter and the windows that hide them, when it reads. */
export function labelsSpecOf(v: unknown): { filter?: RowFilter; hideWhileOpen: string[] } | undefined {
  const l = v as { filter?: unknown; hideWhileOpen?: unknown } | null | undefined;
  if (!l || typeof l !== 'object') return undefined;
  const filter = rowFilterOf(l.filter);
  const hideWhileOpen = Array.isArray(l.hideWhileOpen) ? l.hideWhileOpen.filter((p): p is string => typeof p === 'string' && p !== '') : [];
  return filter || hideWhileOpen.length ? { ...(filter ? { filter } : {}), hideWhileOpen } : undefined;
}

/** What a person sees of a map's features as a whole: them, none yet, none arrived yet, or a path that does not read. */
export type FeaturesState = 'full' | 'empty' | 'loading' | 'error';

/**
 * The state of a map's layers (GEO-Q-31) and the sentence that says it. A broken path is an error even beside layers that
 * draw, since a person must learn that some features cannot be shown; otherwise any feature is full, a layer still to
 * arrive is loading, and the rest is empty.
 */
export function featuresState(layers: readonly FeatureLayer[]): { state: FeaturesState; text: string } {
  const broken = layers.filter(l => l.broken).map(l => l.path);
  if (broken.length) return { state: 'error', text: `Unavailable: the features at ${broken.join(', ')} do not read as a list.` };
  if (layers.some(l => l.features.length)) return { state: 'full', text: '' };
  if (layers.some(l => l.pending)) return { state: 'loading', text: 'Loading the features…' };
  return { state: 'empty', text: 'No feature yet.' };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const GEOMETRIES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);

/** A row as a GeoFeature, or nothing when it is not one: the type, an id, a kind and a GeoJSON geometry it can draw. */
export function featureOf(row: unknown): Feature | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const r = row as Record<string, unknown>;
  const g = r.geometry as Geometry | undefined;
  if (r.type !== 'Feature' || typeof r.id !== 'string' || !r.id || typeof r.kind !== 'string' || !g || typeof g !== 'object' || !GEOMETRIES.has(String(g.type)) || !Array.isArray(g.coordinates)) return undefined;
  return {
    id: r.id, kind: r.kind, label: typeof r.label === 'string' ? r.label : '', geometry: g,
    properties: r.properties && typeof r.properties === 'object' ? (r.properties as Record<string, unknown>) : {},
    style: styleOf(r.style), at: typeof r.at === 'string' ? r.at : String(r._at ?? ''),
    severity: typeof r.severity === 'string' ? r.severity : undefined,
    links: Array.isArray(r.links) ? (r.links as Array<{ rel: string; id: string }>) : undefined,
  };
}

/** A style with only the values of the closed grammar (a colour that is not hex, a number out of range: left out). */
export function styleOf(v: unknown): Style {
  if (!v || typeof v !== 'object') return {};
  const s = v as Record<string, unknown>;
  const out: Style = {};
  for (const k of ['color', 'fill', 'stroke'] as const) if (typeof s[k] === 'string' && HEX.test(s[k] as string)) out[k] = s[k] as string;
  const num = (k: 'opacity' | 'width' | 'size' | 'heading', lo: number, hi: number) => { const n = s[k]; if (typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi) out[k] = n; };
  num('opacity', 0, 1); num('width', 1, 8); num('size', 1, 64); num('heading', 0, 360);
  if (typeof s.icon === 'string' && (ICON_NAMES as readonly string[]).includes(s.icon)) out.icon = s.icon;
  return out;
}

/** A binding's kind filter: a pattern ending in * takes every kind that starts with what comes before it. */
export function kindMatches(pattern: string | undefined, kind: string): boolean {
  if (!pattern) return true;
  return pattern.endsWith('*') ? kind.startsWith(pattern.slice(0, -1)) : pattern === kind;
}

/** The FeatureKind that covers a kind: the longest whose kind is it, or it followed by a dot and more. */
export function kindOf(kinds: readonly FeatureKindRow[], kind: string): FeatureKindRow | undefined {
  let best: FeatureKindRow | undefined;
  for (const k of kinds) {
    if (!k || typeof k.kind !== 'string') continue;
    if ((kind === k.kind || kind.startsWith(k.kind + '.')) && (!best || k.kind.length > best.kind.length)) best = k;
  }
  return best;
}

/** A hex layer's spec as the catalog gives it, or nothing when it does not read. */
export function hexesSpecOf(v: unknown): HexesSpec | undefined {
  const h = v as { id?: unknown; value?: unknown; size?: unknown; label?: unknown; card?: unknown } | null | undefined;
  if (!h || typeof h !== 'object' || typeof h.id !== 'string' || !h.id || typeof h.value !== 'string' || !h.value) return undefined;
  const card = Array.isArray(h.card) ? h.card.filter((c): c is { key: string; title: string } => Boolean(c) && typeof c.key === 'string' && c.key !== '' && typeof c.title === 'string' && c.title.trim() !== '') : [];
  return { id: h.id, value: h.value, ...(typeof h.size === 'number' && Number.isInteger(h.size) ? { size: h.size } : {}), ...(typeof h.label === 'string' && h.label ? { label: h.label } : {}),
    ...(card.length ? { card } : {}) };
}

/** A GeoFeature's column for a filter: its property, else its id, kind or label. */
const featureColumn = (f: Feature) => (c: string): unknown => (c in f.properties ? f.properties[c] : c === 'id' ? f.id : c === 'kind' ? f.kind : c === 'label' ? f.label : undefined);

/**
 * A hex layer's features (GEO-M-11): each row whose id column is a hex id of the layer's size (and whose kind column
 * matches the layer's kind) becomes its hexagon, coloured by its value on the ramp over every such row; the filter keeps
 * the rows whose columns equal the value at its path; rows that share a hex draw once, as the one of the greatest value.
 */
function hexFeatures(rows: readonly unknown[], spec: FeatureLayerSpec, h: HexesSpec, filter: RowFilter | undefined, filterValue: unknown, ramp: readonly string[]):
  { features: Feature[]; domain?: RampDomain; held: number; kept: number } {
  const own = styleOf(spec.style);
  const opacity = own.opacity ?? 0.6;
  const fixedKind = spec.kind && !spec.kind.endsWith('*') ? spec.kind : '';
  const held: Array<{ row: Record<string, unknown>; id: string; value: number; kind: string }> = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const cell = tryParseHex(row[h.id]);
    if (!cell || (h.size !== undefined && cell.size !== h.size)) continue;
    const kind = typeof row.kind === 'string' && row.kind ? row.kind : fixedKind || 'hex';
    if (!kindMatches(spec.kind, kind)) continue;
    const n = typeof row[h.value] === 'number' ? (row[h.value] as number) : Number(row[h.value]);
    held.push({ row, id: row[h.id] as string, value: Number.isFinite(n) ? n : 0, kind });
  }
  const domain = rampDomain(held.map(x => x.value));
  const test = filter ? rowTest(filterValue, filter.match) : undefined;
  const kept = test ? held.filter(x => test(c => x.row[c])) : held;
  const best = new Map<string, (typeof held)[number]>();
  for (const x of kept) { const b = best.get(x.id); if (!b || x.value > b.value) best.set(x.id, x); }
  const features: Feature[] = [...best.values()].map(x => {
    const color = domain ? rampColor(x.value, domain, ramp) : ramp[ramp.length - 1] ?? '#4477aa';
    const [lat, lon] = hexCenter(x.id);
    const label = h.label && typeof x.row[h.label] === 'string' && x.row[h.label] ? (x.row[h.label] as string) : x.id;
    // the card's columns under their titles, when the layer names them (§10.13); the selectAction's row keeps every column
    const properties = h.card ? Object.fromEntries(h.card.filter(c => x.row[c.key] !== undefined && x.row[c.key] !== null && x.row[c.key] !== '').map(c => [c.title.trim(), x.row[c.key]])) : { ...x.row };
    return { id: x.id, kind: x.kind, label, geometry: { type: 'Polygon', coordinates: [hexRing(x.id)] }, properties, style: { color, fill: color, stroke: color, opacity, width: own.width ?? 1 },
      at: typeof x.row.at === 'string' ? x.row.at : '', hex: { id: x.id, centre: [lon, lat], row: x.row } };
  });
  return { features, domain, held: held.length, kept: kept.length };
}

/**
 * The layers over the data: each layer's GeoFeatures of its kind (or a hex layer's hexagons), its hue, its total when the
 * data says, and its filter's count. dataAt reads a path of the data model, the filters' paths too; ramp is the look's
 * sequential ramp, which a hex layer colours by.
 */
export function featureLayers(specs: readonly FeatureLayerSpec[], dataAt: (path: string) => unknown, hues: readonly string[], ramp: readonly string[] = []): FeatureLayer[] {
  return specs.map((spec, index) => {
    const v = dataAt(spec.path);
    const rows = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>) : [];
    const pending = v === undefined;
    const broken = !pending && !Array.isArray(v) && !(v && typeof v === 'object');
    const filter = rowFilterOf(spec.filter);
    const filterValue = filter ? dataAt(filter.path) : undefined;
    const hexes = hexesSpecOf(spec.hexes);
    let features: Feature[];
    let whole: boolean;
    let extra: Partial<FeatureLayer> = {};
    if (hexes) {
      const steps = ramp.length ? ramp : ['#4477aa'];
      const made = hexFeatures(rows, spec, hexes, filter, filterValue, steps);
      features = made.features;
      whole = false;
      extra = { ...(made.domain ? { ramp: { domain: made.domain, steps } } : {}), ...(filter ? { rowFilter: filter } : {}), ...(made.kept < made.held ? { filtered: { kept: made.kept, of: made.held } } : {}) };
    } else {
      const all = rows.map(featureOf).filter((f): f is Feature => Boolean(f) && kindMatches(spec.kind, f!.kind));
      const test = filter ? rowTest(filterValue, filter.match) : undefined;
      features = test ? all.filter(f => test(featureColumn(f))) : all;
      whole = all.length === rows.length;
      extra = { ...(filter ? { rowFilter: filter } : {}), ...(features.length < all.length ? { filtered: { kept: features.length, of: all.length } } : {}) };
    }
    const t = dataAt(spec.path + 'Total');
    // the binding's total counts every kind it matched: it is this layer's own only when the layer took the whole path
    const total = typeof t === 'number' && whole && !extra.filtered ? t : undefined;
    const cut = typeof t === 'number' && !(whole && !extra.filtered) && t > rows.length ? { held: rows.length, total: t } : undefined;
    // the labels' filter (§10.13): the features whose columns equal the value at its path show their labels
    const labels = labelsSpecOf(spec.labels);
    const labelTest = labels?.filter ? rowTest(dataAt(labels.filter.path), labels.filter.match) : undefined;
    if (labelTest) extra = { ...extra, labelIds: new Set(features.filter(f => labelTest(featureColumn(f))).map(f => f.id)) };
    if (labels?.hideWhileOpen.length) extra = { ...extra, hideLabelsWhileOpen: labels.hideWhileOpen };
    const own = styleOf(spec.style);
    const picks = pickSpecOf(spec.pick);
    const color = own.color ?? own.stroke ?? (hexes && ramp.length ? ramp[ramp.length - 1] : undefined) ?? hues[index % Math.max(1, hues.length)] ?? '#4477aa';
    // the design's raw hexes give way to the read one, and a layer with none carries no hexes key
    const { hexes: _raw, ...rest } = spec;
    return { ...rest, style: own, index, ...(picks ? { picks } : {}), color, features, total, ...(cut ? { cut } : {}), ...(pending ? { pending } : {}), ...(broken ? { broken } : {}), ...extra, ...(hexes ? { hexes } : {}) };
  });
}

/** A feature's look: its style, else its kind's, else its layer's, with the colour for its severity when nothing names one. */
export function lookOf(f: Feature, layer: FeatureLayer, kinds: readonly FeatureKindRow[]): Required<Pick<Style, 'color' | 'fill' | 'stroke' | 'opacity' | 'width' | 'size'>> & { icon: IconName | ''; heading?: number } {
  const k = styleOf(kindOf(kinds, f.kind)?.style);
  const pick = <K extends keyof Style>(key: K): Style[K] => f.style[key] ?? k[key] ?? layer.style?.[key];
  const color = pick('color') ?? layer.color;
  const icon = pick('icon');
  return {
    color, fill: pick('fill') ?? color, stroke: pick('stroke') ?? color, opacity: pick('opacity') ?? 0.35, width: pick('width') ?? 2, size: pick('size') ?? 24,
    icon: (icon && (ICON_NAMES as readonly string[]).includes(icon) ? icon : '') as IconName | '', heading: pick('heading'),
  };
}

/** Every position of a geometry, as [longitude, latitude]. */
export function positionsOf(g: Geometry): Position[] {
  const out: Position[] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') out.push(c as Position);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g.coordinates);
  return out;
}

/** The bounds of features as [[west, south], [east, north]], or nothing when none has a position. */
export function featureBounds(features: readonly Feature[]): [[number, number], [number, number]] | undefined {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of features) for (const [lon, lat] of positionsOf(f.geometry)) { w = Math.min(w, lon); s = Math.min(s, lat); e = Math.max(e, lon); n = Math.max(n, lat); }
  return Number.isFinite(w) ? [[w, s], [e, n]] : undefined;
}

/** Where a feature sits for a ring, a label, or a fly-to: a point's position, else the middle of its bounds. */
export function anchorOf(f: Feature): [number, number] | undefined {
  if (f.geometry.type === 'Point') { const p = f.geometry.coordinates as number[]; return [p[0], p[1]]; }
  const b = featureBounds([f]);
  return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] : undefined;
}

export interface Cluster { position: [number, number]; count: number; ids: string[] }

/** One point the map draws: a Point feature, or one point of a MultiPoint, with the id of the feature it belongs to. */
export type PointItem = Feature & {
  /** The id of the feature the point belongs to: what a click selects and what its look is found by. */
  partOf: string;
  /** A key unique to the point within its layer, for the stable draw order. */
  key: string;
};

/**
 * The points of a layer's features: a Point as itself, a MultiPoint as each of its points. Each point carries its
 * feature's id apart from its key, because an id may hold any character (a '#' too), so no id can be split back out of a
 * key. The key is the id and the point's index as JSON, which no two points share.
 */
export function pointsOf(features: readonly Feature[]): PointItem[] {
  const out: PointItem[] = [];
  for (const f of features) {
    if (f.geometry.type === 'Point') out.push({ ...f, partOf: f.id, key: JSON.stringify([f.id, 0]) });
    else if (f.geometry.type === 'MultiPoint') (f.geometry.coordinates as number[][]).forEach((c, i) => out.push({ ...f, geometry: { type: 'Point', coordinates: c }, partOf: f.id, key: JSON.stringify([f.id, i]) }));
  }
  return out;
}

/**
 * The points of a layer gathered on a grid for a zoom: a cell is about cellPixels wide on screen, a cell of one point
 * stays a point (in points), a cell of more is one counted circle at the points' mean. Lines and polygons never cluster.
 */
export function clusterPoints<T extends Feature>(features: readonly T[], zoom: number, cellPixels = 60): { clusters: Cluster[]; points: T[] } {
  const degrees = (360 / (256 * Math.pow(2, Math.max(0, zoom)))) * cellPixels;
  const cells = new Map<string, T[]>();
  const points: T[] = [];
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates as number[];
    const key = Math.floor(lon / degrees) + ':' + Math.floor(lat / degrees);
    const list = cells.get(key);
    if (list) list.push(f); else cells.set(key, [f]);
  }
  const clusters: Cluster[] = [];
  cells.forEach(list => {
    if (list.length === 1) { points.push(list[0]); return; }
    let x = 0, y = 0;
    list.forEach(f => { const c = f.geometry.coordinates as number[]; x += c[0]; y += c[1]; });
    clusters.push({ position: [x / list.length, y / list.length], count: list.length, ids: list.map(f => f.id) });
  });
  return { clusters, points };
}

/** Text folded for a search: lower case, accents removed (é is e). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface SearchHit { feature: Feature; layer: number }

/**
 * The search of GEO-S-01: the features whose label, id or named properties hold every word of the query, folded, at most
 * {@code max}; the label that is the query first, then one that starts with it, then one with a word that starts with it,
 * then one that holds it, then the rest; among equals the shorter label first (the closer match: "MV Northgate" before
 * "MV Northgate bound for Seaforth"), then the layers' order.
 */
export function searchFeatures(layers: readonly FeatureLayer[], query: string, fields: readonly string[] = [], max = 10): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = fold(query.trim());
  const ranked: Array<{ hit: SearchHit; rank: number; size: number; order: number }> = [];
  const seen = new Set<string>();
  let order = 0;
  for (const l of layers) {
    for (const f of l.features) {
      if (seen.has(f.id)) continue;
      const label = fold(f.label);
      const hay = [label, fold(f.id), ...fields.map(k => fold(String(f.properties[k] ?? '')))].join(' ');
      if (!words.every(w => hay.includes(w))) continue;
      seen.add(f.id);
      const rank = label === q ? 0 : label.startsWith(q) ? 1 : label.split(/[\s\-_/.,:;()]+/).some(w => w.startsWith(q)) ? 2 : label.includes(q) ? 3 : 4;
      ranked.push({ hit: { feature: f, layer: l.index }, rank, size: label.length, order: order++ });
    }
  }
  return ranked.sort((a, b) => a.rank - b.rank || (a.rank < 4 ? a.size - b.size : 0) || a.order - b.order).slice(0, max).map(r => r.hit);
}

/** The card's properties in order: the fields its kind names (or the card's own), then the rest in the feature's order. */
export function cardFields(f: Feature, kinds: readonly FeatureKindRow[], fallback: readonly string[] = []): Array<[string, unknown]> {
  const first = kindOf(kinds, f.kind)?.fields ?? fallback;
  const out: Array<[string, unknown]> = [];
  for (const k of first) if (k in f.properties) out.push([k, f.properties[k]]);
  for (const [k, v] of Object.entries(f.properties)) if (!first.includes(k)) out.push([k, v]);
  return out;
}

/** How long ago an instant was, in words: "12 s ago", "4 min ago", "3 h ago", "2 d ago"; empty when it does not parse. */
export function ageOf(at: string, now = Date.now()): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** A property's value as text for the card: a list joined, an object as compact JSON, a number as it is. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(valueText).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** The data model paths of a map's shared state (the catalog's state rule). */
export const geoState = (map: string) => ({
  selected: `/_geo/${map}/selected`, focus: `/_geo/${map}/focus`, follow: `/_geo/${map}/follow`, hidden: `/_geo/${map}/hidden`,
  picked: `/_geo/${map}/picked`, pickedSaid: `/_geo/${map}/pickedSaid`,
});

// ---- the pick set (srad/agentspaces-geo.md GEO-M-09, M-10): the keys a person picked to show on the map, in the
// browser's memory only, each in the look's categorical hue at its place in the set

/** The most keys a pick set holds: the look fixes eight categorical hues, one per key. */
export const MAX_PICKED = 8;

/** How a layer reads the pick set: the property that holds a feature's key, which features it draws, and whether a change fits the view. */
export interface PickSpec { by: string; show: 'picked' | 'all'; fit: boolean }

/** A layer's pick as the catalog gives it, or nothing when it has none or it does not read. */
export function pickSpecOf(v: unknown): PickSpec | undefined {
  const p = v as { by?: unknown; show?: unknown; fit?: unknown } | null | undefined;
  if (!p || typeof p !== 'object' || typeof p.by !== 'string' || !p.by || (p.show !== 'picked' && p.show !== 'all')) return undefined;
  return { by: p.by, show: p.show, fit: p.fit === true };
}

/** A pick set as it is held: the strings of a list, each once, in order, at most max. */
export function cleanPicks(v: unknown, max = MAX_PICKED): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const k of v) if (typeof k === 'string' && k && !out.includes(k)) { out.push(k); if (out.length >= max) break; }
  return out;
}

/** The keys a value lists: a list's strings and numbers as text, or one string or number; nothing else. */
export function keysOf(v: unknown): string[] {
  const one = (x: unknown) => (typeof x === 'string' && x ? x : typeof x === 'number' && Number.isFinite(x) ? String(x) : undefined);
  const list = Array.isArray(v) ? v.map(one) : [one(v)];
  return list.filter((k, i, all): k is string => k !== undefined && all.indexOf(k) === i);
}

/** The hue of the key at a place in the pick set: the look's categorical hue there; the table's swatch and the map call the same. */
export function pickHue(index: number, hues: readonly string[]): string {
  return hues[index] ?? hues[index % Math.max(1, hues.length)] ?? '#4477aa';
}

/** A feature's pick key under a layer's pick: its property by, as text. */
export function pickKeyOf(f: Feature, by: string): string | undefined {
  const v = f.properties[by];
  return typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
}

/** A shape's family: a point, a line or an area, so a key's route and its stops are both drawn but no route twice. */
const familyOf = (g: Geometry) => (g.type === 'Point' || g.type === 'MultiPoint' ? 'point' : g.type === 'LineString' || g.type === 'MultiLineString' ? 'line' : 'area');

/** What the map draws of a pick set: the layers filtered, each picked feature's hue, one label chip per key, the layers drawn at half opacity, and the features a change fits. */
export interface PickView {
  layers: FeatureLayer[];
  /** A picked feature's id and its pick hue. */
  hue: Map<string, string>;
  /** One chip per picked key that is drawn: on its first line, else its first point. */
  chips: Array<{ key: string; feature: Feature; hue: string }>;
  /** The layers without pick, drawn at half opacity while a key is picked. */
  dimmed: Set<number>;
  /** The picked features of the layers whose pick fits. */
  fit: Feature[];
  /** The features a show-picked layer leaves out because their key is not picked, by id with their key. */
  hidden: Map<string, string>;
}

/**
 * The pick set over a map's layers (GEO-M-10), in one pass over the features (a Set lookup each): a show-picked layer keeps
 * the picked features alone, a show-all layer keeps every one; a picked key's shape of one family (point, line, area) is
 * drawn by one pick layer only, a show-all layer before a show-picked one, then the layers' order, so a key a follower's
 * route and a device's route both carry is drawn once. Layers without pick are dimmed while any key is picked.
 */
export function applyPicks(layers: readonly FeatureLayer[], picked: readonly string[], hues: readonly string[]): PickView {
  const at = new Map(picked.map((k, i) => [k, i] as const));
  const owner = new Map<string, number>();
  const pickLayers = layers.filter(l => l.picks).sort((a, b) => (a.picks!.show === 'all' ? 0 : 1) - (b.picks!.show === 'all' ? 0 : 1) || a.index - b.index);
  if (at.size) {
    for (const l of pickLayers) {
      for (const f of l.features) {
        const k = pickKeyOf(f, l.picks!.by);
        if (k === undefined || !at.has(k)) continue;
        const slot = k + '\u0000' + familyOf(f.geometry);
        if (!owner.has(slot)) owner.set(slot, l.index);
      }
    }
  }
  const hue = new Map<string, string>();
  const lines = new Map<string, Feature>(), points = new Map<string, Feature>();
  const dimmed = new Set<number>();
  const fit: Feature[] = [];
  const hidden = new Map<string, string>();
  const out = layers.map(l => {
    if (!l.picks) { if (at.size) dimmed.add(l.index); return l; }
    const { by, show } = l.picks;
    const kept: Feature[] = [];
    for (const f of l.features) {
      const k = pickKeyOf(f, by);
      const i = k === undefined ? undefined : at.get(k);
      if (i === undefined) {
        if (show === 'all') kept.push(f);
        else if (k !== undefined) hidden.set(f.id, k);
        continue;
      }
      const fam = familyOf(f.geometry);
      if (owner.get(k + '\u0000' + fam) !== l.index) continue;
      kept.push(f);
      hue.set(f.id, pickHue(i, hues));
      if (l.picks.fit) fit.push(f);
      if (fam === 'line') { if (!lines.has(k!)) lines.set(k!, f); } else if (!points.has(k!)) points.set(k!, f);
    }
    return kept.length === l.features.length ? l : { ...l, features: kept };
  });
  const chips = picked.flatMap(k => { const f = lines.get(k) ?? points.get(k); return f ? [{ key: k, feature: f, hue: pickHue(at.get(k)!, hues) }] : []; });
  return { layers: out, hue, chips, dimmed, fit, hidden };
}

/** The words after a change of the pick set: how many the map shows and which, or that it shows none picked. */
export function pickedWords(picked: readonly string[]): string {
  return picked.length ? `Showing ${picked.length} on the map: ${picked.join(', ')}.` : 'Nothing is picked; the map shows every layer.';
}

/** The features of every layer by id: the newest layer that holds an id wins, as a page draws it last. */
export function byId(layers: readonly FeatureLayer[]): Map<string, { feature: Feature; layer: FeatureLayer }> {
  const out = new Map<string, { feature: Feature; layer: FeatureLayer }>();
  for (const l of layers) for (const f of l.features) out.set(f.id, { feature: f, layer: l });
  return out;
}

/** Where the browser keeps a map's view: per page (the app's address), surface and map. */
export const viewKey = (surfaceId: string, mapId: string) => `agentspaces-geo:view:${typeof location === 'undefined' ? '' : location.pathname}:${surfaceId}:${mapId}`;
/**
 * Where the browser keeps whether a map's legend shows its layer entries (srad/agentspaces-geo.md GEO-M-14): per page,
 * surface and map, as the view is kept.
 */
export const legendKey = (surfaceId: string, mapId: string) => `agentspaces-geo:legend:${typeof location === 'undefined' ? '' : location.pathname}:${surfaceId}:${mapId}`;
/** The most characters a legend toggle's words take (the catalog's maxLength), and its words when a design gives none. */
export const LEGEND_TOGGLE_MAX = 24;
export const LEGEND_TOGGLE_LABEL = 'Layers';

/** A design's legend toggle: its words and whether the entries start hidden, or nothing (none, or a map with no legend). */
export function legendToggleOf(props: { legend?: unknown; legendToggle?: unknown }): { label: string; hidden: boolean } | undefined {
  const t = props.legendToggle as { label?: unknown; hidden?: unknown } | undefined;
  if (props.legend === false || !t || typeof t !== 'object' || Array.isArray(t)) return undefined;
  const words = typeof t.label === 'string' ? t.label.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  return { label: words ? Array.from(words).slice(0, LEGEND_TOGGLE_MAX).join('') : LEGEND_TOGGLE_LABEL, hidden: t.hidden === true };
}

/** A layer's count, with the binding's total when it holds fewer (GEO-F-05): "5,000 of 12,400". */
export function capped(l: FeatureLayer): string {
  const n = l.features.length;
  // a filter's count (GEO-M-12): the rows or features it keeps of those the layer holds
  // (a hex layer draws rows that share a hex once, so it may show fewer than the filter kept)
  if (l.filtered) return `${n === l.filtered.kept ? '' : `${n.toLocaleString('en')} shown, `}${l.filtered.kept.toLocaleString('en')} of ${l.filtered.of.toLocaleString('en')} kept by the filter`;
  if (typeof l.total === 'number' && l.total > n) return `${n.toLocaleString('en')} of ${l.total.toLocaleString('en')}`;
  // a layer of some kinds on a cut binding: its count among the newest the binding holds
  if (l.cut) return `${n.toLocaleString('en')}, from the newest ${l.cut.held.toLocaleString('en')} of ${l.cut.total.toLocaleString('en')}`;
  return n.toLocaleString('en');
}

// ---- the Watchbox (GEO-W-01 to W-06)

/** An area a watchbox watches: a box as a closed ring, or a polygon feature's rings, as [lon, lat]. */
export interface WatchArea { rings: [number, number][][]; geometry: Geometry; label: string }

/** The area of a box [west, south, east, north], or of a polygon feature, or nothing. */
export function areaOf(box: unknown, polygon: Feature | undefined): WatchArea | undefined {
  if (Array.isArray(box) && box.length === 4 && box.every(n => typeof n === 'number' && Number.isFinite(n))) {
    const [w, s, e, n] = box as number[];
    const ring: [number, number][] = [[w, s], [e, s], [e, n], [w, n], [w, s]];
    return { rings: [ring], geometry: { type: 'Polygon', coordinates: [ring] }, label: '' };
  }
  if (polygon && (polygon.geometry.type === 'Polygon' || polygon.geometry.type === 'MultiPolygon')) {
    const polys = (polygon.geometry.type === 'Polygon' ? [polygon.geometry.coordinates] : polygon.geometry.coordinates) as [number, number][][][];
    return { rings: polys.map(p => p[0]).filter(Boolean), geometry: polygon.geometry, label: polygon.label || polygon.id };
  }
  return undefined;
}

/** Whether a feature is inside an area: its anchor (a point's position, a shape's middle) within one of the area's outer rings. */
export function inArea(f: Feature, area: WatchArea): boolean {
  const at = anchorOf(f);
  if (!at) return false;
  return area.rings.some(ring => insideRing(at[0], at[1], ring));
}

function insideRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, serious: 2, warning: 1, info: 0 };

/** A watchbox's rows: newest first by when each was observed, the graver first on a tie, at most max. */
export function watchRows(features: readonly Feature[], max = 200, sort?: string): Feature[] {
  const t = (f: Feature) => { const v = Date.parse(f.at); return Number.isFinite(v) ? v : 0; };
  const newest = (a: Feature, b: Feature) => t(b) - t(a) || (SEVERITY_RANK[b.severity ?? ''] ?? -1) - (SEVERITY_RANK[a.severity ?? ''] ?? -1) || a.id.localeCompare(b.id);
  const by = sort ? sortOf(sort) : undefined;
  return [...features].sort(by ? (a, b) => by(a, b) || newest(a, b) : newest).slice(0, Math.max(1, max));
}

/**
 * A watchbox's sort (GEO-W-07): a feature property, a leading - for descending; numbers by value, other values as text,
 * a feature without the property last whichever way.
 */
export function sortOf(sort: string): ((a: Feature, b: Feature) => number) | undefined {
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  if (!key) return undefined;
  const has = (v: unknown) => v !== undefined && v !== null && v !== '';
  return (a, b) => {
    const x = a.properties[key], y = b.properties[key];
    if (!has(x) || !has(y)) return has(x) === has(y) ? 0 : has(x) ? -1 : 1;
    const nx = typeof x === 'number' ? x : Number.NaN, ny = typeof y === 'number' ? y : Number.NaN;
    const c = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : String(x).localeCompare(String(y));
    return desc ? -c : c;
  };
}

/** A row's property line: each named property that is set, as "name value", joined. */
export function propertyLine(f: Feature, fields: readonly string[]): string {
  return fields.filter(k => f.properties[k] !== undefined && f.properties[k] !== null && f.properties[k] !== '').map(k => `${k} ${valueText(f.properties[k])}`).join(' · ');
}

/** A watchbox's done rows, from its done property: the field that marks a row done, and the actions a done row keeps. */
export interface WatchboxDone { field: string; keep: ReadonlySet<string> }
export function watchboxDone(v: unknown): WatchboxDone | undefined {
  const d = v as { field?: unknown; keep?: unknown } | null | undefined;
  if (!d || typeof d !== 'object' || typeof d.field !== 'string' || !d.field) return undefined;
  return { field: d.field, keep: new Set(Array.isArray(d.keep) ? d.keep.filter((k): k is string => typeof k === 'string') : []) };
}
/** Whether a feature's done field marks its row done: true, a non-empty string or a non-zero number. */
export function isWatchboxDone(f: Feature, done: WatchboxDone | undefined): boolean {
  const v = done ? f.properties[done.field] : undefined;
  return v === true || (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && v !== 0 && Number.isFinite(v));
}
/** A done row's words on its meta line: the field and its value, or the field alone for true. */
export function watchboxDoneText(f: Feature, done: WatchboxDone): string {
  const v = f.properties[done.field];
  return v === true ? done.field : `${done.field} ${valueText(v)}`;
}

/** Whether a feed has been silent past twice its expected interval; the words for it, or empty. */
export function staleText(lastChange: number, expectSeconds: number | undefined, now = Date.now()): string {
  if (!expectSeconds || expectSeconds <= 0) return '';
  const quiet = now - lastChange;
  if (quiet <= 2 * expectSeconds * 1000) return '';
  const min = Math.round(quiet / 60_000);
  return `The feed stopped: nothing new for ${min >= 1 ? `${min} min` : `${Math.round(quiet / 1000)} s`}.`;
}

// ---- the time slider (GEO-M-07)

/** The windows a time slider offers, in milliseconds (0 for every feature). */
export const TIME_WINDOWS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: 'All', ms: 0 }, { label: '15 min', ms: 15 * 60_000 }, { label: '1 h', ms: 3_600_000 }, { label: '6 h', ms: 6 * 3_600_000 }, { label: '24 h', ms: 24 * 3_600_000 },
];

/** The earliest and latest `at` of the layers' features, in milliseconds, or nothing when none parses. */
export function timeSpan(layers: readonly FeatureLayer[]): [number, number] | undefined {
  let lo = Infinity, hi = -Infinity;
  for (const l of layers) for (const f of l.features) { const t = Date.parse(f.at); if (Number.isFinite(t)) { lo = Math.min(lo, t); hi = Math.max(hi, t); } }
  return Number.isFinite(lo) ? [lo, hi] : undefined;
}

/**
 * The time slider's range over a span: a step of about a two-hundredth of it (at least a second), and a minimum a whole
 * number of steps below the span's end, so the thumb reaches the newest time. A browser's range only yields min + k * step,
 * and with min at the span's start the right end would snap short of the newest features.
 */
export function sliderGrid(span: readonly [number, number]): { min: number; max: number; step: number } {
  const step = Math.max(1000, Math.round((span[1] - span[0]) / 200));
  return { min: span[1] - Math.ceil((span[1] - span[0]) / step) * step, max: span[1], step };
}

/** The layers with only the features observed in the window (end − width, end]; a width of 0 keeps every feature. */
export function inWindow(layers: readonly FeatureLayer[], end: number, width: number): FeatureLayer[] {
  if (!width) return [...layers];
  return layers.map(l => ({ ...l, features: l.features.filter(f => { const t = Date.parse(f.at); return Number.isFinite(t) && t > end - width && t <= end; }) }));
}

// ---- a fly-to or a fit clear of what covers the map

/** How far in from each side of the map something covers it (docked windows, the controls over it), in CSS pixels. */
export interface MapInsets { top?: number; right?: number; bottom?: number; left?: number }

/**
 * A fit's padding: the base on every side plus the insets, the insets scaled down where they would leave less than a
 * quarter of the map (or 64 px) visible across or down, so a fit always has room.
 */
export function fitPadding(insets: MapInsets | undefined, base: number, width: number, height: number): { top: number; right: number; bottom: number; left: number } {
  const i = { top: Math.max(0, insets?.top ?? 0), right: Math.max(0, insets?.right ?? 0), bottom: Math.max(0, insets?.bottom ?? 0), left: Math.max(0, insets?.left ?? 0) };
  const fit = (a: number, b: number, size: number): [number, number] => {
    const room = Math.max(0, size - Math.max(64, size / 4) - 2 * base);
    const f = a + b > room ? (a + b > 0 ? room / (a + b) : 0) : 1;
    return [Math.floor(a * f), Math.floor(b * f)];
  };
  const [left, right] = fit(i.left, i.right, width);
  const [top, bottom] = fit(i.top, i.bottom, height);
  return { top: base + top, right: base + right, bottom: base + bottom, left: base + left };
}
