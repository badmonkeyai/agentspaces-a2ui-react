/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/GeoMap: the catalog's component, drawn by src/geo/GeoMapView.tsx once the geo chunk loads (./load).
import { define } from '../../renderer/implementation';
import type { GeoMapProps } from '../../generated/props';
import { useGeoViews } from './load';

export const GeoMap = define<GeoMapProps>('GeoMap', ({ props, ctx }) => {
  const views = useGeoViews();
  if (!views) return <div className="as-geomap" data-component="GeoMap" data-state="loading"><span className="bma-muted bma-small">Loading the map…</span></div>;
  return <views.GeoMapView props={props} ctx={ctx} />;
});
