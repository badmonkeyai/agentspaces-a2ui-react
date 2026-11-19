/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The basemaps a GeoMap names (srad/agentspaces-geo.md GEO-M-05, and the catalog's noCode rule): a design names a
// basemap, never a URL, and the renderer or its host decides what the name draws. The open names are osm (the
// OpenStreetMap raster tiles), osm-dark (the same, dimmed for a dark look), and plain (a background of the look's
// surface colour, no tiles); a host adds its own (a PMTiles style, its tile server) with registerBasemap. This module
// loads no map library, so a host registers before the first map is drawn without paying for one.

/** A MapLibre style: the style document itself, or the URL of one the host trusts. */
export type BasemapStyle = Record<string, unknown> | string;

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

function osm(dark: boolean): BasemapStyle {
  return {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: OSM_ATTRIBUTION } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: dark ? { 'raster-brightness-max': 0.45, 'raster-saturation': -0.85, 'raster-contrast': 0.1 } : {} }],
  };
}

/** A style of one background colour, with no tiles: the plain basemap, and what a map falls back to when its basemap fails. */
export function plainStyle(background: string): BasemapStyle {
  return { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }] };
}

const registered = new Map<string, (dark: boolean) => BasemapStyle>();

/** Lets a GeoMap name a basemap the host provides; the style may depend on whether the look is dark. */
export function registerBasemap(name: string, style: BasemapStyle | ((dark: boolean) => BasemapStyle)): void {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) throw new RangeError(`a basemap's name is lower case letters, digits and dashes: ${name}`);
  registered.set(name, typeof style === 'function' ? style : () => style);
}

/** The basemaps a design may name: the open three and the host's. */
export function basemapNames(): string[] {
  return ['osm', 'osm-dark', 'plain', ...registered.keys()];
}

/**
 * The style a name draws: a registered name's, else the open name's, else the look's default (osm-dark for a dark
 * look, osm for a light one). {@code known} says whether the name was one the renderer knows.
 */
export function basemapStyle(name: string | undefined, dark: boolean, background: string): { style: BasemapStyle; name: string; known: boolean; attribution: string } {
  const n = (name ?? '').trim();
  const fn = n ? registered.get(n) : undefined;
  if (fn) { const style = fn(dark); return { style, name: n, known: true, attribution: attributionOf(style) }; }
  if (n === 'osm') return { style: osm(false), name: n, known: true, attribution: OSM_ATTRIBUTION };
  if (n === 'osm-dark') return { style: osm(true), name: n, known: true, attribution: OSM_ATTRIBUTION };
  if (n === 'plain') return { style: plainStyle(background), name: n, known: true, attribution: '' };
  return { style: osm(dark), name: dark ? 'osm-dark' : 'osm', known: !n, attribution: OSM_ATTRIBUTION };
}

/** The attribution a style document's sources carry, joined (a URL style says its own once loaded; nothing here). */
function attributionOf(style: BasemapStyle): string {
  if (typeof style === 'string') return '';
  const sources = (style.sources ?? {}) as Record<string, { attribution?: unknown }>;
  return [...new Set(Object.values(sources).map(s => (typeof s?.attribution === 'string' ? s.attribution : '')).filter(Boolean))].join('; ');
}
