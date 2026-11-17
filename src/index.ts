/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// @agentspaces/a2ui-react: the open React renderer of the agentspaces-viz and agentspaces-widgets catalogs, and the
// open custom elements it wraps (the split and the tree), with the chat's
// thread and the files' helpers a page shares with them.
export { Surfaces, withAgentCalls, AGENT_FUNCTION_TIMEOUT_MS, type SurfacesProps, type SurfaceActionEvent, type Envelope, type AgentFunctionCall, type AgentFunctionResult } from './renderer/surfaces';
export { appendEnvelope, SUPERSEDED } from './renderer/envelopes';
export { catalogs, declares, registerComponents, registerAlias, BASIC_ID } from './renderer/catalogs';
export { define, useData, useRows, fmt, uploaders, fileSources, agentFunctions, type Ctx, type ComponentProps, type Implementation, type UploadOptions, type UploadAnswer, type FileRef, type FileSource } from './renderer/implementation';
export { LookAndFeelProvider, useLook } from './look/provider';
export { cssVariables, stylesheet, modeTokens, withAlpha, DEFAULT_LOOK } from './look/css';
export { validatePalette, validateLook, type PaletteReport, type PaletteCheck } from './look/palette';
export { Markdown } from './viz/Markdown';
export { WindowPanel, placementOf, type WindowPanelProps, type Placement } from './viz/WindowPanel';
export { bearing, headingOf, polygonOf, inside, iconUrl, iconName, ICON_NAMES, KeyOrder, TrailBook, trailOf, hueOf, layersOf, boundsOf, rowsOf, positioned, severityOf, labelOf, legendName, LAYER_KINDS, type LayerSpec, type MapLayer, type Row, type LayerKind } from './viz/geo';
export { MenuView, grouped, matchesShortcut, type MenuItem, type MenuViewProps } from './components/viz/Menu';
export { statusOf } from './components/viz/TitleBar';
export { AgentSpacesSplit, defineSplit, type PaneSpec } from './elements/split';
export { AgentSpacesTree, defineTree, ROW_HEIGHT, FILE_DRAG, type TreeRow } from './elements/tree';
export { chatWhen, chatTime, chatOrder, chatThread, chatDigest, chatSecret, SECRET_KEY, sha256, stepsOf, progressWords, lineState, TASK_STATES, type ChatLine, type Progress, type Step, type TaskState } from './chat/thread';
export { attachToChat, onAttach, previewPath } from './chat/links';
export { sizeText, accepts, refusalOf, dropFiles, treeRows, badgesOf, parseCsv, pathOf, type FileRow, type DropState, type DropOptions, type TreeNode, type Seen } from './files/files';
export { ChatView, PAGE_WRITE, registerChatExtra, askChat, type ChatOptions, type ChatExtra } from './components/widgets/Chat';
export { chipsOf, suggestionsPath, MAX_CHIPS, CHIP_TEXT, CHIP_LABEL, type Chip } from './chat/followups';
export { featureOf, styleOf, kindMatches, kindOf, featureLayers, featuresState, lookOf, positionsOf, featureBounds, anchorOf, clusterPoints, pointsOf, fold, searchFeatures, cardFields, ageOf, valueText, geoState, byId, capped, viewKey, areaOf, inArea, watchRows, propertyLine, staleText, timeSpan, sliderGrid, inWindow, TIME_WINDOWS, type WatchArea, type Feature, type FeatureKindRow, type FeatureLayer, type FeatureLayerSpec, type FeaturesState, type Cluster, type PointItem, type SearchHit, type Style } from './viz/features';
export { registerBasemap, basemapNames, basemapStyle, plainStyle, type BasemapStyle } from './viz/basemaps';
export { loadGeo } from './components/geo/load';
export { specOf, missingColumns, seriesOf, sortCategories, guessSpec, MAX_SERIES, OTHER, type VisualSpec, type VSeries, type VPoint, type Mark, type Aggregate } from './viz/visualize';
export { graphOf, graphOfFeatures, layout as graphLayout, kindHues, graphDrawing, graphViewState, nearestNode, nodeOn, edgeOn, GRAPH_WEBGL_PAST, type Graph, type GNode, type GEdge, type GraphLayout, type Positions, type GraphCamera } from './viz/graph';
export { VisualizeView } from './components/viz/Visualize';
export { FileTreeView, type TreeOptions } from './components/widgets/FileTree';
export { previewKind } from './components/widgets/FilePreview';
export { FrameContext, useFrame, useFrameProvider, useBarClaim, type Frame } from './frame/frame';
export { commands, onCommands, useCommands, type Command } from './frame/commands';
export { CommandPalette, opensPalette, filterCommands } from './frame/CommandPalette';
export { Pages, currentPage, bannerOf, BANNER_MAX, type PagesProps, type Navigation, type NavPage, type Layout, type LayoutPane, type SplitLayout, type ConversationLayout, type Area } from './frame/Pages';
export { GeoPages, GeoWindow, GeoFrameContext, useGeoFrame, useWindowStates, useDetailsWindow, placeDocked, dockedSize, MIN_W, MIN_H, NARROW_PX, type GeoLayout, type GeoWindowSpec, type GeoFrame, type GeoOverlay, type Dock, type WindowState, type GeoWindowProps } from './frame/geo';
export { Gallery, goldenTitle, type GalleryProps } from './frame/Gallery';
export { Icon, ICONS } from './frame/icons';
export { OPEN_CATALOGS, HOSTED, type OpenCatalogId } from './generated/catalogs';
export { GOLDENS, type GoldenSurface } from './generated/goldens';
export { LOOK_SCHEMA, type LookAndFeel, type ModeTokens } from './generated/look';
export { OPEN_REQUIRED } from './generated/props';
export * from './generated/props';
