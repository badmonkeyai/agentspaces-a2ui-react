/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/Watchbox: the catalog's component, drawn by src/geo/WatchboxView.tsx once the geo chunk loads (./load).
import { define } from '../../renderer/implementation';
import type { WatchboxProps } from '../../generated/props';
import { useGeoViews } from './load';

export const Watchbox = define<WatchboxProps>('Watchbox', ({ props, ctx }) => {
  const views = useGeoViews();
  if (!views) return <div className="as-watchbox" data-component="Watchbox" data-state="loading"><span className="bma-muted bma-small">Loading the watchbox…</span></div>;
  return <views.WatchboxView props={props} ctx={ctx} />;
});
