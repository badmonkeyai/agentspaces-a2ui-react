/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The open custom elements alone, for a page without React (dist/elements.js): the panel split and the tree, each
// defined once per window when this module loads.
import { defineSplit } from './split';
import { defineTree } from './tree';

export { AgentSpacesSplit, defineSplit, type PaneSpec } from './split';
export { AgentSpacesTree, defineTree, ROW_HEIGHT, FILE_DRAG, type TreeRow } from './tree';

defineSplit();
defineTree();
