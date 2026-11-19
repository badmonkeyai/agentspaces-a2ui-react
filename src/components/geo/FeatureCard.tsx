/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/FeatureCard: the catalog's component, drawn by src/geo/FeatureCardView.tsx once the geo chunk loads (./load).
import { define } from '../../renderer/implementation';
import type { FeatureCardProps } from '../../generated/props';
import { useGeoViews } from './load';

export const FeatureCard = define<FeatureCardProps>('FeatureCard', ({ props, ctx }) => {
  const views = useGeoViews();
  if (!views) return <div className="as-feature-card" data-component="FeatureCard" data-state="loading"><span className="bma-muted bma-small">Loading the details…</span></div>;
  return <views.FeatureCardView props={props} ctx={ctx} />;
});
