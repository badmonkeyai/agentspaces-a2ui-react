/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/LayerMenu: the catalog's component, drawn by src/geo/LayerMenuView.tsx once the geo chunk loads (./load).
import { define } from '../../renderer/implementation';
import type { LayerMenuProps } from '../../generated/props';
import { useGeoViews } from './load';

export const LayerMenu = define<LayerMenuProps>('LayerMenu', ({ props, ctx }) => {
  const views = useGeoViews();
  if (!views) return <div className="as-layer-menu" data-component="LayerMenu" data-state="loading"><span className="bma-muted bma-small">Loading the layers…</span></div>;
  return <views.LayerMenuView props={props} ctx={ctx} />;
});
