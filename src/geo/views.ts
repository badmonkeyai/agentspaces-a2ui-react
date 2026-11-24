/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The drawings of the agentspaces-geo components, one chunk the page loads when it first draws one (components/geo/load),
// so a page without a map does not carry them.
export { GeoMapView, select } from './GeoMapView';
export { FeatureCardView, GONE_CLOSE_MS } from './FeatureCardView';
export { FeatureSearchView, SEARCH_DEBOUNCE_MS } from './FeatureSearchView';
export { LayerMenuView } from './LayerMenuView';
export { WatchboxView, ARRIVAL_MS } from './WatchboxView';
export { DrawControl, CLICK_PX, CORNER_PX, KEYBOARD_RADIUS_M, SENT_NOTE_MS } from './DrawControl';
// the map's label placement is pure (no map library), so it rides in this chunk for the tests to reach by loadGeo()
export { placeLabels, layoutLabels, visibleArea, rankLabels, labelBox, LABEL_MAX } from '../viz/labels';
