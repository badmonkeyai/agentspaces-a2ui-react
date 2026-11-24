/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// What the agentspaces-geo components share: the value of several data model paths at once, and a map's layers read
// by the components that name the map (the card, the search, the layer menu), so each reads the same features the map
// draws from the same paths.
import { useEffect, useMemo, useState } from 'react';
import { useArrived, useData, useRows, type Ctx } from '../renderer/implementation';
import { useLook } from '../look/provider';
import { featureLayers, geoState, labelsSpecOf, type FeatureKindRow, type FeatureLayer, type FeatureLayerSpec } from '../viz/features';
import { rowFilterOf } from '../viz/filter';
import { lookRamp } from '../viz/ramp';

/** The values at several pointers, re-rendered when any changes (one subscription per path, in order). */
export function usePaths(ctx: Ctx, paths: readonly string[]): unknown[] {
  const [values, setValues] = useState<unknown[]>(() => paths.map(p => ctx.get(p)));
  const joined = paths.join('\u0000');
  useEffect(() => {
    setValues(paths.map(p => ctx.get(p)));
    const offs = paths.map((p, i) => ctx.subscribe(p, v => setValues(prev => { const next = prev.slice(); next[i] = v; return next; })));
    return () => offs.forEach(off => off());
  }, [ctx, joined]);
  return values;
}

/** A GeoMap's layer specs from its properties: the entries with a path. */
export function specsOf(layers: unknown): FeatureLayerSpec[] {
  return Array.isArray(layers) ? (layers as FeatureLayerSpec[]).filter(l => l && typeof l.path === 'string' && l.path.startsWith('/')) : [];
}

/** The layers, the kinds and the shared state paths of a map, from its properties. */
export function useFeatureLayers(ctx: Ctx, mapId: string, mapProps: Record<string, unknown> | undefined): { layers: FeatureLayer[]; kinds: FeatureKindRow[]; state: ReturnType<typeof geoState> } {
  const { tokens } = useLook();
  const specs = useMemo(() => specsOf(mapProps?.layers), [mapProps?.layers]);
  // each layer's path and its total, then the paths its filter reads (GEO-M-12), so a change there filters at once
  const filterPaths = useMemo(() => [...new Set(specs.flatMap(s => [rowFilterOf(s.filter)?.path, labelsSpecOf(s.labels)?.filter?.path]).filter((p): p is string => Boolean(p)))], [specs]);
  const paths = useMemo(() => [...specs.flatMap(s => [s.path, s.path + 'Total']), ...filterPaths], [specs, filterPaths]);
  const values = usePaths(ctx, paths);
  const kinds = useRows<FeatureKindRow>(ctx, typeof mapProps?.kinds === 'string' && mapProps.kinds.startsWith('/') ? mapProps.kinds : undefined);
  // once the page's data has arrived, a layer whose path it lacks is empty, not loading for ever
  const arrived = useArrived(ctx);
  const ramp = useMemo(() => lookRamp(tokens.color), [tokens.color.surface, tokens.color.sequential, tokens.color.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const layers = useMemo(() => featureLayers(specs, p => {
    const v = values[paths.indexOf(p)];
    return v === undefined && arrived && !p.endsWith('Total') && !filterPaths.includes(p) ? [] : v;
  }, tokens.color.categorical, ramp), [specs, values, paths, filterPaths, tokens.color.categorical, ramp, arrived]);
  return { layers, kinds, state: geoState(mapId) };
}

/** The layer indexes a map hides, from its shared state. */
export function useHidden(ctx: Ctx, path: string): Set<number> {
  const v = useData<unknown>(ctx, path);
  return useMemo(() => new Set(Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : []), [v]);
}
