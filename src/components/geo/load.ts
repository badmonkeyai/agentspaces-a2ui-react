/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// Loads the agentspaces-geo drawings on first use (srad/agentspaces-geo.md phase 2): the catalog's components are small
// wrappers, and the first geo surface a page draws loads the chunk that holds the map, the card, the search and the
// layer menu. Once loaded, a wrapper draws at once; a page may load it ahead (loadGeo) when a surface names the catalog.
import { useEffect, useState } from 'react';

type Views = typeof import('../../geo/views');
let views: Views | undefined;
let pending: Promise<Views> | undefined;

/** Loads the geo drawings; resolves at once when they are loaded. */
export function loadGeo(): Promise<Views> {
  if (views) return Promise.resolve(views);
  pending ??= import('../../geo/views').then(m => (views = m));
  return pending;
}

/** The geo drawings, or nothing until they load (the component re-renders when they do). */
export function useGeoViews(): Views | undefined {
  const [v, setV] = useState<Views | undefined>(views);
  useEffect(() => {
    if (v) return;
    let alive = true;
    void loadGeo().then(m => { if (alive) setV(m); });
    return () => { alive = false; };
  }, [v]);
  return v;
}
