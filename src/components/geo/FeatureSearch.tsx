/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/FeatureSearch: the catalog's component, drawn by src/geo/FeatureSearchView.tsx once the geo chunk loads (./load).
import { define } from '../../renderer/implementation';
import type { FeatureSearchProps } from '../../generated/props';
import { useGeoViews } from './load';

export const FeatureSearch = define<FeatureSearchProps>('FeatureSearch', ({ props, ctx }) => {
  const views = useGeoViews();
  if (!views) return <div className="as-feature-search" data-component="FeatureSearch" data-state="loading"><span className="bma-muted bma-small">Loading the search…</span></div>;
  return <views.FeatureSearchView props={props} ctx={ctx} />;
});
