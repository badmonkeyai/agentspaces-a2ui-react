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

export async function createMap(container: HTMLElement, options: { center?: [number, number]; zoom?: number; dark: boolean }): Promise<MapAdapter> {
  if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) throw new Error('no WebGL');
  const map = new maplibregl.Map({ container, style: STYLE(options.dark), center: options.center ? [options.center[1], options.center[0]] : [0, 20], zoom: options.zoom ?? 1.5, attributionControl: {} });
  await new Promise<void>(resolve => (map.loaded() ? resolve() : map.once('load', () => resolve())));
  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay as unknown as maplibregl.IControl);
  const orders = new Map<number, KeyOrder>();
  const books = new Map<number, TrailBook>();
  let fitted = false;
  const listeners = new Set<() => void>();
  const moved = () => listeners.forEach(l => l());
  map.on('move', moved); map.on('zoom', moved); map.on('resize', moved);
  return {
    setLayers(layers, { fit, transition, highlight, follow, hidden, onMarker }) {
      const deck: Layer[] = [];
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
          deck.push(new TextLayer({ id: id + '-names', data: polygons.filter(p => labelOf(l, p.row)), getPosition: (d: { ring?: [number, number][] }) => centroid(d.ring!), getText: (d: { row: Row }) => labelOf(l, d.row), getSize: 12, getColor: color, getTextAnchor: 'middle', getAlignmentBaseline: 'center', fontFamily: 'system-ui, sans-serif', background: true, getBackgroundColor: [255, 255, 255, 200], backgroundPadding: [4, 2] }));
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
        const labelled = data.filter(d => d.label);
        if (labelled.length) deck.push(new TextLayer({ id: id + '-labels', data: labelled, getPosition: (d: { position: [number, number] }) => d.position, getText: (d: { label: string }) => d.label, getSize: 11, getColor: options.dark ? WHITE : [20, 20, 20], getPixelOffset: [0, size * 0.75], getTextAnchor: 'middle', getAlignmentBaseline: 'top', fontFamily: 'system-ui, sans-serif', background: true, getBackgroundColor: options.dark ? [20, 20, 20, 170] : [255, 255, 255, 190], backgroundPadding: [3, 1], transitions: t ? { getPosition: t.getPosition } : undefined }));
      }
      overlay.setProps({ layers: deck });
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
