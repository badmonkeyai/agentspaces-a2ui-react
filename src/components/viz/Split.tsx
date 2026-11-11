/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Split: two or three panes over <agentspaces-split>, the WAI-ARIA Window Splitter
// element of this package. Each pane draws its one child; an empty pane says so, and a pane whose child is not on the
// surface names what is missing. The sizes and the collapsed panes stay in the browser under `persist`.
import { createElement } from 'react';
import { define } from '../../renderer/implementation';
import type { SplitProps } from '../../generated/props';
import { defineSplit } from '../../elements/split';

interface Pane { id: string; child?: string; size: number; min?: number; collapsible?: boolean; label?: string }

export const Split = define<SplitProps>('Split', ({ props, ctx }) => {
  defineSplit();
  const panes = ((Array.isArray(props.panes) ? props.panes : []) as Pane[]).slice(0, 3);
  const spec = JSON.stringify(panes.map(p => ({ id: p.id, size: p.size, min: p.min ?? 0, collapsible: Boolean(p.collapsible), label: p.label ?? '' })));
  return createElement('agentspaces-split', {
    class: 'as-split', 'data-component': 'Split', orientation: props.orientation ?? 'horizontal', panes: spec,
    persist: props.persist ? `${ctx.surfaceId}/${props.persist}` : undefined, 'stack-below': props.stackBelow ? String(props.stackBelow) : undefined,
  }, panes.map((p, i) => (
    <div key={p.id} slot={'pane-' + i} className="as-split-pane" role="group" aria-label={p.label || p.id} data-pane={p.id}>
      {p.label ? <div className="as-split-label" aria-hidden="true">{p.label}</div> : null}
      {!p.child ? <p className="bma-empty">Nothing here yet.</p>
        : ctx.has(p.child) ? ctx.child(p.child) : <p className="bma-empty" role="note">Missing content: {p.child}</p>}
    </div>
  )));
}, [], [], { panes: ['child'] });
