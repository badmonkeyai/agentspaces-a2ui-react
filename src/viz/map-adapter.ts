/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The one place MapLibre GL and deck.gl are touched (deck.gl's MapboxOverlay over a MapLibre
// map). Loaded on first use by the Map component, so the page bundle carries both as one separate
// chunk. The layers rebuild from the surface's data on each update; an icons layer keeps its keys in a stable order,
// so deck.gl's attribute transition moves an icon from its previous position to its newest instead of
// redrawing the layer; a tracks layer is a path per key; areas are polygons; heat is the aggregation layer; a
// GeoJSON layer is drawn as it is. Clicks on icons and markers reach the component's marker action.
import * as maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { IconLayer, PathLayer, PolygonLayer, GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { KeyOrder, TrailBook, headingOf, iconName, iconUrl, labelOf, number, polygonOf, positioned, trailOf, boundsOf, type MapLayer, type Row } from './geo';
import { anchorOf, clusterPoints, featureBounds, fitPadding, lookOf, pointsOf, positionsOf, type Feature, type MapInsets, type PointItem, type FeatureKindRow, type FeatureLayer } from './features';
export type { MapInsets } from './features';
import type { BasemapStyle } from './basemaps';
import { LABEL_PAD, LABEL_SIZE, layoutLabels, rankLabels, type LabelInsets, type PlacedLabel } from './labels';

export type { MapLayer, Row } from './geo';

export interface DrawOptions {
  /** Fit the view to the layers' bounds on this update. */
  fit: boolean;
  /** Milliseconds an icon takes from its previous position to its newest. */
  transition: number;
  /** The keys drawn with a ring and a larger icon. */
  highlight: string[];
  /** The key the map keeps centred, or nothing. */
  follow?: string;
  /** The layers hidden by the legend. */
  hidden: Set<number>;
  onMarker: (row: Row, layer: MapLayer) => void;
}

export interface MapAdapter {
  setLayers(layers: MapLayer[], options: DrawOptions): void;
  /** The pixel of a position in the map's container, for a box placed beside its key. */
  project(lat: number, lon: number): { x: number; y: number };
  /** Called after every move, zoom, or resize; returns the unsubscribe. */
  onMove(listener: () => void): () => void;
  dispose(): void;
}

const STYLE = (dark: boolean) => ({
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm', paint: dark ? { 'raster-brightness-max': 0.6, 'raster-saturation': -0.6 } : {} }],
});

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
function rgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [68, 119, 170];
}
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---- point labels as chips (./labels): a label is drawn on a small translucent chip, the selected one on the accent; the
// labels a map leaves out (they would overlap, or pass the cap) stay in the layer with no colour, so a moving point's label
// keeps its place in the data and glides with it over the transition instead of jumping between points
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];
/** Dark or light text, whichever reads better on a background (the accent varies by look). */
function inkOn([r, g, b]: Rgb): Rgb {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.22 ? [19, 25, 31] : [255, 255, 255];
}
/** A label chip; a quiet one (its layer keeps its labels to some features, §10.13) shows only while selected or hovered. */
interface Chip { key: string; position: [number, number]; label: string; dy: number; lit: boolean; pin?: Rgb; quiet?: boolean }
/** The chips shown and the moves (px) that keep the always-shown ones inside the visible part of the map. */
interface ChipLayout { shown: Set<string>; shift: Map<string, [number, number]> }
/** The colours of a label chip: clear when left out, the accent when lit (selected), else the mode's translucent chip. */
function chipColors(dark: boolean, accent: Rgb) {
  const ink: Rgb = dark ? [229, 234, 240] : [32, 44, 56];
  return {
    text: (shown: Set<string>) => (d: Chip) => (!shown.has(d.key) ? CLEAR : d.lit ? [...inkOn(accent), 255] : [...ink, 255]),
    back: (shown: Set<string>) => (d: Chip) => (!shown.has(d.key) ? CLEAR : d.lit ? [...accent, 240] : dark ? [19, 25, 31, 214] : [255, 255, 255, 226]),
    border: (shown: Set<string>) => (d: Chip) => (!shown.has(d.key) ? CLEAR : d.lit ? [...accent, 255] : d.pin ? [...d.pin, 255] : dark ? [61, 74, 86, 200] : [195, 204, 212, 220]),
  };
}
/** A TextLayer of label chips; `shown` names the chips drawn, the rest are clear. The glyphs come from the labels
 * themselves (characterSet 'auto'): the default set is ASCII, so 'Bahía' drew as 'Bah a' (2026-11-13). */
function chipLayer(id: string, data: Chip[], layout: ChipLayout, colors: ReturnType<typeof chipColors>, font: string, version: number, transitions?: Record<string, unknown>) {
  const { shown, shift } = layout;
  return new TextLayer({ id, data, getPosition: (d: Chip) => d.position, getText: (d: Chip) => d.label, getSize: LABEL_SIZE,
    getColor: colors.text(shown) as never, getPixelOffset: ((d: Chip) => { const m = shift.get(d.key); return m ? [m[0], d.dy + m[1]] : [0, d.dy]; }) as never, getTextAnchor: 'middle', getAlignmentBaseline: 'top',
    fontFamily: font, fontWeight: 500, characterSet: 'auto', background: true, getBackgroundColor: colors.back(shown) as never, getBorderColor: colors.border(shown) as never,
    backgroundBorderRadius: 4, backgroundPadding: LABEL_PAD, transitions: transitions as never,
    getBorderWidth: ((d: Chip) => (d.pin ? 2 : 1)) as never,
    updateTriggers: { getColor: [version], getBackgroundColor: [version], getBorderColor: [version], getBorderWidth: [version], getPixelOffset: [version] } });
}
/**
 * The chips a map shows now: the lit ones and the hovered one always, the rest by rank where they fit inside the part of
 * the map the insets (the docked windows and the controls) leave visible; a quiet chip only when lit or hovered.
 */
function shownChips(map: maplibregl.Map, container: HTMLElement, ranked: Chip[], hovered?: string, insets?: LabelInsets): ChipLayout {
  const placed: PlacedLabel[] = [];
  // a picked key's chip shows at any zoom (GEO-M-10), as the selected one and the hovered one do
  const always = (c: Chip) => c.lit || Boolean(c.pin) || c.key === hovered;
  for (const pass of [true, false]) {
    for (const c of ranked) {
      if (always(c) !== pass || (!pass && c.quiet)) continue;
      const p = map.project(c.position);
      placed.push({ key: c.key, label: c.label, x: p.x, y: p.y, dy: c.dy, always: pass });
    }
  }
  return layoutLabels(placed, container.clientWidth, container.clientHeight, undefined, undefined, insets);
}
/** The page's font for the labels, read once from the map's container (the look's family), else the system's. */
const fontOf = (container: HTMLElement) => { try { return getComputedStyle(container).fontFamily || 'system-ui, sans-serif'; } catch { return 'system-ui, sans-serif'; } };
/** The look's accent where the map is drawn (its CSS variable), for the selected label of a map not told it. */
const accentOf = (container: HTMLElement): Rgb => { try { return rgb(getComputedStyle(container).getPropertyValue('--bma-color-accent').trim() || '#c97531'); } catch { return rgb('#c97531'); } };

export async function createMap(container: HTMLElement, options: { center?: [number, number]; zoom?: number; dark: boolean }): Promise<MapAdapter> {
  if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) throw new Error('no WebGL');
  const map = new maplibregl.Map({ container, style: STYLE(options.dark), center: options.center ? [options.center[1], options.center[0]] : [0, 20], zoom: options.zoom ?? 1.5, attributionControl: {} });
  // ready once the style is: maplibre's 'load' waits for the first tiles too, and a tile server that stalls (or one the
  // page cannot reach) left the map loading for good, with none of its layers or alert boxes drawn (FIT 2026-11-15); the
  // tiles fill in under the layers when they come
  await new Promise<void>(resolve => (map.isStyleLoaded() ? resolve() : map.once('style.load', () => resolve())));
  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay as unknown as maplibregl.IControl);
  const orders = new Map<number, KeyOrder>();
  const books = new Map<number, TrailBook>();
  let fitted = false;
  const listeners = new Set<() => void>();
  const moved = () => listeners.forEach(l => l());
  map.on('move', moved); map.on('zoom', moved); map.on('resize', moved);
  // the labels of the last draw, placed again when a move ends (./labels): the layers under them stay as they are
  const font = fontOf(container);
  const colors = chipColors(options.dark, accentOf(container));
  let drawn: { base: Layer[]; chips: Array<{ id: string; data: Chip[]; ranked: Chip[]; transitions?: Record<string, unknown> }> } | undefined;
  let version = 0;
  const relabel = () => {
    if (!drawn) return;
    const layout = shownChips(map, container, drawn.chips.flatMap(c => c.ranked));
    version++;
    overlay.setProps({ layers: [...drawn.base, ...drawn.chips.map(c => chipLayer(c.id, c.data, layout, colors, font, version, c.transitions))] });
  };
  map.on('moveend', relabel);
  return {
    setLayers(layers, { fit, transition, highlight, follow, hidden, onMarker }) {
      const deck: Layer[] = [];
      const chips: NonNullable<typeof drawn>['chips'] = [];
      const highlighted = new Set(highlight);
      let followAt: [number, number] | undefined;
      for (const l of layers) {
        if (hidden.has(l.index)) continue;
        const id = `bma-${l.index}`;
        const color = rgb(l.color);
        if (l.kind === 'geojson' && l.geojson) {
          deck.push(new GeoJsonLayer({ id, data: l.geojson as never, stroked: true, filled: true, getLineColor: color, getFillColor: [...color, 40] as never, getLineWidth: 2, lineWidthUnits: 'pixels', pointRadiusMinPixels: 4, getPointRadius: 4, pointRadiusUnits: 'pixels', pickable: true, onClick: (info: PickingInfo) => { if (info.object) onMarker((info.object as { properties?: Row }).properties ?? {}, l); } }));
          continue;
        }
        if (l.kind === 'areas') {
          const polygons = l.rows.map(r => ({ row: r, ring: polygonOf(r) })).filter(p => p.ring);
          deck.push(new PolygonLayer({ id, data: polygons, getPolygon: (d: { ring?: [number, number][] }) => d.ring as never, stroked: true, filled: true, getLineColor: color, getFillColor: [...color, 30] as never, getLineWidth: 2, lineWidthUnits: 'pixels', pickable: true, onClick: (info: PickingInfo) => { if (info.object) onMarker((info.object as { row: Row }).row, l); } }));
          deck.push(new TextLayer({ id: id + '-names', data: polygons.filter(p => labelOf(l, p.row)), getPosition: (d: { ring?: [number, number][] }) => centroid(d.ring!), getText: (d: { row: Row }) => labelOf(l, d.row), getSize: 12, getColor: color, getTextAnchor: 'middle', getAlignmentBaseline: 'center', fontFamily: 'system-ui, sans-serif', characterSet: 'auto', background: true, getBackgroundColor: [255, 255, 255, 200], backgroundPadding: [4, 2] }));
          continue;
        }
        const points = l.rows.filter(positioned);
        if (l.kind === 'heat') {
          deck.push(new HeatmapLayer({ id, data: points, getPosition: (r: Row) => [number(r.lon)!, number(r.lat)!], getWeight: (r: Row) => number(r.weight) ?? 1, radiusPixels: 40, colorRange: [[...color, 0], [...color, 80], [...color, 140], [...color, 200], [...color, 255]] as never, aggregation: 'SUM' }));
          continue;
        }
        if (l.kind === 'tracks') {
          // rows that carry a history (several per key) are drawn as they are; a layer over the newest positions (one row
          // per key) keeps its own trail as the positions change
          const perKey = trailOf(points, l.key, l.timeField, l.trail ?? 50);
          const history = [...perKey.values()].some(rows => rows.length > 1);
          let trails: Array<{ key: string; path: [number, number][] }>;
          if (history) {
            trails = [...perKey.entries()].map(([key, rows]) => ({ key, path: rows.map(r => [number(r.lon)!, number(r.lat)!] as [number, number]) })).filter(t => t.path.length >= 2);
          } else {
            if (!books.has(l.index)) books.set(l.index, new TrailBook());
            const book = books.get(l.index)!;
            perKey.forEach((rows, key) => { const r = rows[rows.length - 1]; book.push(key, number(r.lon)!, number(r.lat)!, l.trail ?? 50); });
            trails = book.paths();
          }
          deck.push(new PathLayer({ id, data: trails, getPath: (d: { path: number[][] }) => d.path as never, getColor: [...color, 180] as never, getWidth: 2, widthUnits: 'pixels', widthMinPixels: 1.5, jointRounded: true, capRounded: true }));
          continue;
        }
        if (l.kind === 'alerts') continue;   // the boxes are the component's; nothing on the canvas
        // icons and markers: one per key in the stable order; icons move, markers are dots
        if (!orders.has(l.index)) orders.set(l.index, new KeyOrder());
        const ordered = orders.get(l.index)!.order(points, l.key);
        const data = ordered.map(o => ({ key: o.key, row: o.row, position: [number(o.row.lon)!, number(o.row.lat)!] as [number, number], heading: headingOf(o.row, o.previous, l.heading), label: labelOf(l, o.row), lit: highlighted.has(o.key) }));
        if (follow) { const f = data.find(d => d.key === follow); if (f) followAt = f.position; }
        const size = l.size && l.size > 0 ? l.size : 28;
        const t = transition > 0 ? { getPosition: { duration: transition, easing: ease }, getAngle: { duration: Math.min(transition, 400) } } : undefined;
        const lit = data.filter(d => d.lit);
        if (lit.length) deck.push(new ScatterplotLayer({ id: id + '-ring', data: lit, getPosition: (d: { position: [number, number] }) => d.position, getRadius: size * 0.75, radiusUnits: 'pixels', stroked: true, filled: true, getFillColor: [...color, 50] as never, getLineColor: WHITE, getLineWidth: 2, lineWidthUnits: 'pixels', transitions: t ? { getPosition: t.getPosition } : undefined }));
        if (l.kind === 'icons') {
          const icon = iconName(l.icon);
          deck.push(new IconLayer({ id, data, getPosition: (d: { position: [number, number] }) => d.position, getIcon: () => ({ url: iconUrl(icon), width: 64, height: 64, mask: true, id: icon }), getSize: (d: { lit: boolean }) => (d.lit ? size * 1.3 : size), sizeUnits: 'pixels', getColor: color, getAngle: (d: { heading: number }) => (icon === 'dot' || icon === 'pin' ? 0 : 360 - d.heading), pickable: true, onClick: (info: PickingInfo) => { if (info.object) onMarker((info.object as { row: Row }).row, l); }, transitions: t, updateTriggers: { getSize: [highlight.join(',')] } }));
        } else {
          deck.push(new ScatterplotLayer({ id, data, getPosition: (d: { position: [number, number] }) => d.position, getRadius: 6, radiusUnits: 'pixels', stroked: true, getFillColor: color, getLineColor: WHITE, getLineWidth: 2, lineWidthUnits: 'pixels', pickable: true, onClick: (info: PickingInfo) => { if (info.object) onMarker((info.object as { row: Row }).row, l); }, transitions: t ? { getPosition: t.getPosition } : undefined }));
        }
        // labels as chips, the highlighted ones first, then in the rows' order, where they fit (./labels)
        const labelled: Chip[] = data.filter(d => d.label).map(d => ({ key: l.index + '|' + d.key, position: d.position, label: d.label, dy: size * 0.75, lit: d.lit }));
        if (labelled.length) chips.push({ id: id + '-labels', data: labelled, ranked: [...labelled.filter(c => c.lit), ...labelled.filter(c => !c.lit)], transitions: t ? { getPosition: t.getPosition } : undefined });
      }
      drawn = { base: deck, chips };
      relabel();
      if (followAt) {
        map.easeTo({ center: followAt, duration: transition, easing: ease });
      } else if (fit && !fitted) {
        // the first fit waits for the container to have a size (a page lays the surface out after the map is made;
        // a fit on a zero-size canvas lands at zoom 0, seen in the study of 2026-11-07)
        const b = boundsOf(layers);
        if (b && container.clientWidth > 0 && container.clientHeight > 0) { map.resize(); map.fitBounds(b, { padding: 48, maxZoom: 13, duration: 0 }); fitted = true; }
      }
    },
    project(lat, lon) { const p = map.project([lon, lat]); return { x: p.x, y: p.y }; },
    onMove(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { listeners.clear(); map.removeControl(overlay as unknown as maplibregl.IControl); overlay.finalize(); map.remove(); },
  };
}

function centroid(ring: [number, number][]): [number, number] {
  let x = 0, y = 0;
  ring.forEach(([lon, lat]) => { x += lon; y += lat; });
  return [x / ring.length, y / ring.length];
}

// ---- agentspaces-geo/GeoMap (srad/agentspaces-geo.md phase 2): GeoFeature layers on the same MapLibre and deck.gl stack.
// Polygons and lines draw as one GeoJSON layer per feature layer (a fill and an outline), points as icons or dots in a
// stable order per layer, so a moved point travels over the transition; below a layer's cluster zoom its points gather
// into counted circles; the selection draws a white ring (an outline for a shape), and a point of warning, serious or
// critical severity a ring in its status colour. A click on a feature selects it, a click on a cluster zooms to it, and
// a click on empty map clears the selection.

/** The longest a fly-to animates (ms); a flight that would take longer jumps (MapLibre's maxDuration). */
export const FLY_MAX_MS = 1500;
/** How long a fly-to's fit of a line or a polygon to its bounds animates (ms). */
const FIT_MS = 800;

/** Whether the person asks for less motion (prefers-reduced-motion): a fly-to then jumps. */
function reducedMotion(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export interface GeoView { center: [number, number]; zoom: number; bearing?: number; pitch?: number }

export interface GeoDrawOptions {
  kinds: readonly FeatureKindRow[];
  hidden: ReadonlySet<number>;
  selected?: string;
  follow?: string;
  transition: number;
  /** The look's status colours, for the severity rings. */
  status: Record<string, string>;
  onSelect: (id: string | undefined) => void;
  /** The areas the layout's windows watch, outlined in the accent (a watchbox's area). */
  overlays?: ReadonlyArray<{ key: string; geometry: { type: string; coordinates: unknown }; label: string }>;
  accent?: string;
  /**
   * The pick set as the map draws it (GEO-M-10, ./features applyPicks): each picked feature's hue (colour, fill and
   * stroke, over a white halo), one chip per picked key at any zoom, and the layers drawn at half opacity meanwhile.
   */
  picks?: { hue: ReadonlyMap<string, string>; chips: ReadonlyArray<{ key: string; feature: Feature; hue: string }>; dimmed: ReadonlySet<number> };
  /** How far in the docked windows and the map's controls reach (px): no label is drawn under them (§10.13). */
  insets?: LabelInsets;
  /** The layers (by index) that show no label but the selected and the hovered feature's now (their windows are open). */
  quietLabels?: ReadonlySet<number>;
}

export interface GeoAdapter {
  setFeatures(layers: FeatureLayer[], options: GeoDrawOptions): void;
  /**
   * Flies to a feature: a point at zoom 14, a line or a polygon fitted to its bounds. With insets (the windows docked over
   * the map, px from each side), the feature lands in the middle of the part of the map they leave visible.
   */
  flyTo(feature: Feature, insets?: MapInsets): void;
  /**
   * Fits the view to features (the first draw with no kept view), inside the insets when given. Returns whether it did: a
   * container with no size yet (a hidden page or window) is not fitted, and the caller tries again once it has one.
   */
  fit(features: readonly Feature[], insets?: MapInsets, animate?: boolean): boolean;
  view(): GeoView;
  setView(view: GeoView, animate?: boolean): void;
  zoomBy(delta: number): void;
  /** Turns the map back to north up and flat. */
  resetNorth(): void;
  /** Called when a pan, zoom, rotation or tilt ends; returns the unsubscribe. */
  onViewChange(listener: (view: GeoView) => void): () => void;
  /** The draw control's shape so far (GEO-F-21), drawn over the features in its colour; nothing clears it. */
  setSketch(sketch: GeoSketch | undefined): void;
  /** Turns panning, rotating and the double-click zoom off while a shape is drawn (on), back on after; the wheel still zooms. */
  setDrawing(on: boolean): void;
  /** Hears the pointer on the map (press, move, release, double-click) in longitude and latitude; returns the unsubscribe. */
  onPointer(listener: (e: GeoPointer) => void): () => void;
  /** The distance on the screen between two places, in CSS pixels. */
  pixels(a: [number, number], b: [number, number]): number;
  dispose(): void;
}

/** A drawing in progress: its geometry (a ring or a line) and its corners, in a colour. */
export interface GeoSketch { geometry: { type: string; coordinates: unknown }; corners: Array<[number, number]>; color?: string }
/** The pointer on the map: where (longitude, latitude) and where on the screen (CSS pixels from the map's corner). */
export interface GeoPointer { type: 'down' | 'move' | 'up' | 'dblclick'; at: [number, number]; x: number; y: number }

export async function createGeoMap(container: HTMLElement, options: { view: GeoView; dark: boolean; style: BasemapStyle; fallback: BasemapStyle; onBasemapError: () => void }): Promise<GeoAdapter> {
  if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) throw new Error('no WebGL');
  // the zoom buttons, the north reset and the attribution are the component's, in the look (no MapLibre stylesheet)
  const map = new maplibregl.Map({ container, style: options.style as never, center: options.view.center, zoom: options.view.zoom, bearing: options.view.bearing ?? 0, pitch: options.view.pitch ?? 0, attributionControl: false });
  // a basemap that does not load draws the features on a plain background, and the component says so (GEO-M-05)
  let loaded = false;
  map.on('error', (e: unknown) => {
    if (!loaded && !(e as { sourceId?: string }).sourceId) { map.setStyle(options.fallback as never); options.onBasemapError(); }
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { if (!loaded) { map.setStyle(options.fallback as never); options.onBasemapError(); } }, 8000);
    map.once('load', () => { loaded = true; clearTimeout(timer); resolve(); });
    map.once('styledata', () => { /* a fallback style also ends the wait */ if (!loaded && map.isStyleLoaded()) { loaded = true; clearTimeout(timer); resolve(); } });
    setTimeout(() => { if (!loaded) reject(new Error('the map did not load')); }, 15000);
  });
  let last: { layers: FeatureLayer[]; options: GeoDrawOptions } | undefined;
  const overlay = new MapboxOverlay({
    interleaved: false, layers: [],
    onClick: (info: PickingInfo) => { if (!info.object && last) last.options.onSelect(undefined); },
  });
  map.addControl(overlay as unknown as maplibregl.IControl);
  const orders = new Map<number, Map<string, number>>();
  const listeners = new Set<(v: GeoView) => void>();
  const view = (): GeoView => { const c = map.getCenter(); return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; };
  map.on('moveend', () => listeners.forEach(l => l(view())));
  // the labels of the last draw (./labels): placed again when a move ends or the hovered point changes, the layers under
  // them left as they are
  const font = fontOf(container);
  let drawn: { base: Layer[]; chips: Array<{ id: string; data: Chip[]; transitions?: Record<string, unknown> }>; ranked: Chip[]; colors: ReturnType<typeof chipColors> } | undefined;
  let hovered: string | undefined;
  let version = 0;
  // the draw control's sketch sits over the features and under the labels; a sketch's change paints it alone, so a
  // pointer's move does not rebuild the features' layers
  let sketch: Layer[] = [];
  let chipLayers: Layer[] = [];
  const paint = () => overlay.setProps({ layers: [...(drawn?.base ?? []), ...sketch, ...chipLayers] });
  const relabel = () => {
    if (!drawn) return;
    const d = drawn;
    const layout = shownChips(map, container, d.ranked, hovered, last?.options.insets);
    version++;
    chipLayers = d.chips.map(c => chipLayer(c.id, c.data, layout, d.colors, font, version, c.transitions));
    paint();
  };
  map.on('moveend', relabel);
  const pointers = new Set<(e: GeoPointer) => void>();
  let disposed = false;
  const pointerOf = (type: GeoPointer['type'], e: MouseEvent): GeoPointer => {
    const r = container.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const ll = map.unproject([x, y]);
    return { type, at: [ll.lng, ll.lat], x, y };
  };
  const onDown = (e: PointerEvent) => {
    if (!pointers.size || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // the press is the drawing's: kept to the end of the drag even when the pointer leaves the map
    try { container.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    const p = pointerOf('down', e);
    pointers.forEach(l => l(p));
  };
  const onMove = (e: PointerEvent) => { if (pointers.size) { const p = pointerOf('move', e); pointers.forEach(l => l(p)); } };
  const onUp = (e: PointerEvent) => {
    if (!pointers.size || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try { container.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const p = pointerOf('up', e);
    pointers.forEach(l => l(p));
  };
  const onDouble = (e: MouseEvent) => { if (pointers.size) { const p = pointerOf('dblclick', e); pointers.forEach(l => l(p)); } };
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('dblclick', onDouble);
  let zoomBand = Math.floor(map.getZoom());
  map.on('zoomend', () => { const band = Math.floor(map.getZoom()); if (band !== zoomBand) { zoomBand = band; if (last) draw(last.layers, last.options); } });
  const ordered = (layer: number, points: PointItem[]) => {
    // a stable order per layer, so deck.gl's transition moves a point from its previous position to its newest
    if (!orders.has(layer)) orders.set(layer, new Map());
    const order = orders.get(layer)!;
    points.forEach(p => { if (!order.has(p.key)) order.set(p.key, order.size); });
    return [...points].sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  };
  function draw(layers: FeatureLayer[], o: GeoDrawOptions) {
    last = { layers, options: o };
    const deck: Layer[] = [];
    const zoom = map.getZoom();
    const t = o.transition > 0 ? { getPosition: { duration: o.transition, easing: ease } } : undefined;
    const statusRgb = (s?: string) => (s && s !== 'info' && o.status[s] ? rgb(o.status[s]) : undefined);
    let selectedFeature: Feature | undefined;
    const chips: NonNullable<typeof drawn>['chips'] = [];
    const ranks: Array<Chip & { severity?: string; at?: string }> = [];
    for (const l of layers) {
      if (o.hidden.has(l.index)) continue;
      const id = `geo-${l.index}`;
      const shapes = l.features.filter(f => f.geometry.type !== 'Point' && f.geometry.type !== 'MultiPoint');
      // a picked feature takes its pick hue for colour, fill and stroke (GEO-M-10); a layer without pick is dimmed meanwhile
      const hueOf = o.picks?.hue;
      const looks = new Map(l.features.map(f => { const k = lookOf(f, l, o.kinds); const h = hueOf?.get(f.id); return [f.id, h ? { ...k, color: h, fill: h, stroke: h } : k]; }));
      const opacity = o.picks?.dimmed.has(l.index) ? 0.5 : 1;
      if (o.selected) selectedFeature = l.features.find(f => f.id === o.selected) ?? selectedFeature;
      // the white halo under each picked feature, so its hue reads against any layer of the same hue
      const haloShapes = hueOf?.size ? shapes.filter(f => hueOf.has(f.id)) : [];
      if (haloShapes.length) {
        deck.push(new GeoJsonLayer({ id: id + '-halo-shapes', data: { type: 'FeatureCollection', features: haloShapes.map(f => ({ type: 'Feature', id: f.id, geometry: f.geometry, properties: { id: f.id } })) } as never,
          stroked: true, filled: false, lineWidthUnits: 'pixels', getLineColor: [...WHITE, 230] as never, getLineWidth: ((d: { id: string }) => looks.get(d.id)!.width + 4) as never, updateTriggers: { getLineWidth: [looks] } }));
      }
      if (shapes.length) {
        deck.push(new GeoJsonLayer({
          id: id + '-shapes', data: { type: 'FeatureCollection', features: shapes.map(f => ({ type: 'Feature', id: f.id, geometry: f.geometry, properties: { id: f.id } })) } as never,
          stroked: true, filled: true, lineWidthUnits: 'pixels', pickable: true, opacity,
          getFillColor: ((d: { id: string }) => { const k = looks.get(d.id)!; return [...rgb(k.fill), Math.round(k.opacity * 255)]; }) as never,
          getLineColor: ((d: { id: string }) => rgb(looks.get(d.id)!.stroke)) as never,
          getLineWidth: ((d: { id: string }) => looks.get(d.id)!.width) as never,
          onClick: (info: PickingInfo) => { if (info.object) o.onSelect(String((info.object as { id: string }).id)); return true; },
          updateTriggers: { getFillColor: [looks], getLineColor: [looks], getLineWidth: [looks] },
        }));
      }
      // points: MultiPoints as their points, clustered below the layer's zoom; each point keeps its feature's id (partOf)
      // for its look and a click, since an id may itself hold any character
      const singles = pointsOf(l.features);
      const below = l.cluster?.below;
      const { clusters, points } = typeof below === 'number' && zoom < below ? clusterPoints(singles, zoom) : { clusters: [], points: singles };
      const color = rgb(l.color);
      if (clusters.length) {
        deck.push(new ScatterplotLayer({ id: id + '-clusters', data: clusters, getPosition: (c: { position: [number, number] }) => c.position, getRadius: (c: { count: number }) => 12 + Math.min(18, Math.log2(c.count) * 4), radiusUnits: 'pixels',
          stroked: true, getFillColor: [...color, 200] as never, getLineColor: WHITE, getLineWidth: 2, lineWidthUnits: 'pixels', pickable: true, opacity,
          onClick: (info: PickingInfo) => { const c = info.object as { position: [number, number] } | undefined; if (c) map.easeTo({ center: c.position, zoom: Math.min(22, zoom + 2) }); return true; } }));
        deck.push(new TextLayer({ id: id + '-counts', data: clusters, getPosition: (c: { position: [number, number] }) => c.position, getText: (c: { count: number }) => String(c.count), getSize: 12, getColor: WHITE, getTextAnchor: 'middle', getAlignmentBaseline: 'center', fontFamily: 'system-ui, sans-serif', fontWeight: 600, opacity }));
      }
      const pts = ordered(l.index, points);
      const data = pts.map(f => ({ id: f.partOf, key: l.index + '|' + f.key, at: f.at, position: [(f.geometry.coordinates as number[])[0], (f.geometry.coordinates as number[])[1]] as [number, number], look: looks.get(f.partOf)!, label: f.label, severity: f.severity }));
      const halos = hueOf?.size ? data.filter(d => hueOf.has(d.id)) : [];
      if (halos.length) deck.push(new ScatterplotLayer({ id: id + '-halo', data: halos, getPosition: (d: { position: [number, number] }) => d.position, getRadius: (d: { look: { size: number; icon: string } }) => (d.look.icon ? d.look.size * 0.55 : Math.max(3, d.look.size / 4)) + 3, radiusUnits: 'pixels',
        getFillColor: [...WHITE, 230] as never, transitions: t }));
      const rings = data.filter(d => statusRgb(d.severity));
      if (rings.length) deck.push(new ScatterplotLayer({ id: id + '-severity', data: rings, getPosition: (d: { position: [number, number] }) => d.position, getRadius: (d: { look: { size: number } }) => d.look.size * 0.62, radiusUnits: 'pixels', stroked: true, filled: false, getLineColor: ((d: { severity?: string }) => statusRgb(d.severity)) as never, getLineWidth: 2, lineWidthUnits: 'pixels', transitions: t, opacity }));
      const icons = data.filter(d => d.look.icon);
      const dots = data.filter(d => !d.look.icon);
      const select = (info: PickingInfo) => { if (info.object) o.onSelect((info.object as { id: string }).id); return true; };
      // a hovered point shows its label, whatever the others' rank
      const hover = (info: PickingInfo) => { const k = (info.object as { key?: string } | undefined)?.key; if (k !== hovered) { hovered = k; relabel(); } };
      if (dots.length) deck.push(new ScatterplotLayer({ id: id + '-dots', data: dots, getPosition: (d: { position: [number, number] }) => d.position, getRadius: (d: { look: { size: number } }) => Math.max(3, d.look.size / 4), radiusUnits: 'pixels', stroked: true,
        getFillColor: ((d: { look: { color: string } }) => rgb(d.look.color)) as never, getLineColor: options.dark ? [10, 10, 10] : WHITE, getLineWidth: 1, lineWidthUnits: 'pixels', pickable: true, onClick: select, onHover: hover, transitions: t, opacity,
        updateTriggers: { getFillColor: [looks] } }));
      if (icons.length) deck.push(new IconLayer({ id: id + '-icons', data: icons, getPosition: (d: { position: [number, number] }) => d.position,
        getIcon: ((d: { look: { icon: string } }) => { const name = iconName(d.look.icon); return { url: iconUrl(name), width: 64, height: 64, mask: true, id: name }; }) as never,
        getSize: (d: { look: { size: number } }) => d.look.size, sizeUnits: 'pixels', getColor: ((d: { look: { color: string } }) => rgb(d.look.color)) as never,
        getAngle: ((d: { look: { icon: string; heading?: number } }) => (d.look.icon === 'dot' || d.look.icon === 'pin' || d.look.heading === undefined ? 0 : 360 - d.look.heading)) as never,
        pickable: true, onClick: select, onHover: hover, transitions: t, opacity, updateTriggers: { getColor: [looks] } }));
      // labels as chips where they can be read (past zoom 11, or a layer of a few hundred points), and of those the ones
      // that fit without overlapping, by rank (./labels); the selected feature's on the accent
      // a layer's labels kept to some features (its labels' filter), or to none while its windows are open, leave the
      // others quiet: they show while hovered or selected (§10.13)
      const quietAll = Boolean(o.quietLabels?.has(l.index));
      const labelled = data.filter(d => d.label && (zoom >= 11 || data.length <= 300))
        .map(d => ({ key: d.key, position: d.position, label: d.label, dy: d.look.size * 0.6, lit: d.id === o.selected, severity: d.severity, at: d.at,
          ...(quietAll || (l.labelIds && !l.labelIds.has(d.id)) ? { quiet: true } : {}) }));
      if (labelled.length) { chips.push({ id: id + '-labels', data: labelled, transitions: t }); ranks.push(...labelled); }
    }
    // one chip per picked key, at any zoom, bordered in its hue: on its route, else its first point (GEO-M-10)
    const pickChips: Chip[] = (o.picks?.chips ?? []).flatMap(c => {
      const point = c.feature.geometry.type === 'Point' || c.feature.geometry.type === 'MultiPoint';
      // a route's chip sits on the route, at its middle vertex (its bounds' middle may lie off the line)
      const along = point ? [] : positionsOf(c.feature.geometry);
      const at = along.length ? [along[Math.floor(along.length / 2)][0], along[Math.floor(along.length / 2)][1]] as [number, number] : anchorOf(c.feature);
      return at ? [{ key: 'pick|' + c.key, position: at, label: c.key, dy: point ? 14 : 0, lit: false, pin: rgb(c.hue) }] : [];
    });
    if (pickChips.length) { chips.push({ id: 'geo-picks', data: pickChips }); ranks.push(...pickChips); }
    if (o.overlays?.length) {
      const accent = rgb(o.accent ?? '#c97531');
      deck.unshift(new GeoJsonLayer({ id: 'geo-watched', data: { type: 'FeatureCollection', features: o.overlays.map(a => ({ type: 'Feature', geometry: a.geometry, properties: { label: a.label } })) } as never,
        stroked: true, filled: true, getFillColor: [...accent, 22] as never, getLineColor: [...accent, 220] as never, getLineWidth: 2, lineWidthUnits: 'pixels' }));
    }
    if (selectedFeature) {
      const f = selectedFeature;
      if (f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint') {
        const at = anchorOf(f);
        if (at) deck.push(new ScatterplotLayer({ id: 'geo-selected', data: [{ position: at }], getPosition: (d: { position: [number, number] }) => d.position, getRadius: 18, radiusUnits: 'pixels', stroked: true, filled: false, getLineColor: WHITE, getLineWidth: 3, lineWidthUnits: 'pixels', transitions: t }));
      } else {
        deck.push(new GeoJsonLayer({ id: 'geo-selected', data: { type: 'Feature', geometry: f.geometry, properties: {} } as never, stroked: true, filled: false, getLineColor: WHITE, getLineWidth: 4, lineWidthUnits: 'pixels' }));
      }
    }
    const ranked = rankLabels(ranks);
    drawn = { base: deck, chips, ranked: [...ranked.filter(c => c.lit), ...ranked.filter(c => !c.lit)], colors: chipColors(options.dark, rgb(o.accent ?? '#c97531')) };
    if (hovered && !ranks.some(c => c.key === hovered)) hovered = undefined;
    relabel();
    if (o.follow) {
      const f = layers.flatMap(l => l.features).find(x => x.id === o.follow);
      const at = f && anchorOf(f);
      if (at) map.easeTo({ center: at, duration: o.transition, easing: ease });
    }
  }
  return {
    setFeatures: draw,
    flyTo(f, insets) {
      const pad = fitPadding(insets, 64, container.clientWidth, container.clientHeight);
      // a person who asks for less motion gets the jump, never a flight
      const still = reducedMotion();
      if (f.geometry.type === 'Point') {
        // the point at the middle of the visible part: an offset from the container's centre, which (unlike a camera
        // padding) the map does not keep for later moves. A flight lasts at most FLY_MAX_MS: one that would take longer
        // (a move far beyond the view, a city to another) is a jump, so the map never sweeps out over another region for
        // seconds on the way (a fly from one city to another took five, zoomed out over the region between)
        const at = anchorOf(f)!;
        map.flyTo({ center: at, zoom: Math.max(14, map.getZoom()), offset: [(pad.left - pad.right) / 2, (pad.top - pad.bottom) / 2], essential: true,
          maxDuration: FLY_MAX_MS, ...(still ? { duration: 0 } : {}) });
        return;
      }
      const b = featureBounds([f]);
      if (b) map.fitBounds(b, { padding: pad, maxZoom: 16, duration: still ? 0 : FIT_MS });
    },
    fit(features, insets, animate = false) {
      const b = featureBounds(features);
      if (!b || container.clientWidth <= 0 || container.clientHeight <= 0) return false;
      map.resize(); map.fitBounds(b, { padding: fitPadding(insets, 48, container.clientWidth, container.clientHeight), maxZoom: animate ? 15 : 13, duration: animate ? 800 : 0 });
      return true;
    },
    view,
    setView(v, animate = true) { map.easeTo({ center: v.center, zoom: v.zoom, bearing: v.bearing ?? 0, pitch: v.pitch ?? 0, duration: animate ? 600 : 0 }); },
    zoomBy(delta) { map.easeTo({ zoom: map.getZoom() + delta, duration: 200 }); },
    resetNorth() { map.easeTo({ bearing: 0, pitch: 0, duration: 300 }); },
    onViewChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSketch(s) {
      // the control clears its sketch as it unmounts, which may come after the map is gone (a new look makes a new map)
      if (disposed) return;
      if (!s) { sketch = []; paint(); return; }
      const c = rgb(s.color ?? '#c97531');
      const corners = s.corners.map((at, i) => ({ at, first: i === 0 }));
      sketch = [
        new GeoJsonLayer({ id: 'geo-sketch', data: { type: 'Feature', geometry: s.geometry, properties: {} } as never, stroked: true, filled: true,
          getFillColor: [...c, 40] as never, getLineColor: [...c, 255] as never, getLineWidth: 2, lineWidthUnits: 'pixels' }),
        new ScatterplotLayer({ id: 'geo-sketch-corners', data: corners, getPosition: (d: { at: [number, number] }) => d.at,
          getRadius: (d: { first: boolean }) => (d.first ? 7 : 5), radiusUnits: 'pixels', stroked: true, getFillColor: WHITE, getLineColor: c, getLineWidth: 2, lineWidthUnits: 'pixels' }),
      ];
      paint();
    },
    setDrawing(on) {
      if (disposed) return;
      const handlers = [map.dragPan, map.dragRotate, map.doubleClickZoom, map.boxZoom];
      handlers.forEach(h => (on ? h.disable() : h.enable()));
      map.getCanvas().style.cursor = on ? 'crosshair' : '';
      // a touch that places a corner or drags a radius is the drawing's, not the page's scroll
      container.style.touchAction = on ? 'none' : '';
    },
    onPointer(listener) { pointers.add(listener); return () => { pointers.delete(listener); }; },
    pixels(a, b) { const p = map.project(a), q = map.project(b); return Math.hypot(p.x - q.x, p.y - q.y); },
    dispose() {
      disposed = true;
      listeners.clear(); pointers.clear();
      container.removeEventListener('pointerdown', onDown); container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp); container.removeEventListener('dblclick', onDouble);
      map.removeControl(overlay as unknown as maplibregl.IControl); overlay.finalize(); map.remove();
    },
  };
}
