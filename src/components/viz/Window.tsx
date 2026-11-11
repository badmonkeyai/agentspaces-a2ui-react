/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Window: a panel with a header over one child: dragged by the header, minimized to the
// header and restored, in the flow or at a corner of its surface; the design's actions sit in the header.
import { define } from '../../renderer/implementation';
import type { WindowProps } from '../../generated/props';
import { WindowPanel, placementOf } from '../../viz/WindowPanel';

interface Action { id: string; label: string; action?: { name: string; context?: Record<string, unknown> } }

export const Window = define<WindowProps>('Window', ({ props, ctx }) => {
  const actions = (Array.isArray(props.actions) ? props.actions : []) as Action[];
  const buttons = actions.map(a => (
    <button key={a.id} type="button" className="bma-btn" onClick={() => ctx.dispatch(a.action?.name, { id: a.id, ...(a.action?.context ?? {}) })}>{a.label}</button>
  ));
  return (
    <div className="bma-window-slot" data-component="Window">
      <WindowPanel title={String(props.title ?? '')} placement={placementOf(props.placement)} minimized={props.minimized === true} width={typeof props.width === 'number' ? props.width : undefined}
        testId={props.id} actions={buttons.length ? buttons : undefined}>
        {ctx.child(props.child)}
      </WindowPanel>
    </div>
  );
}, ['child']);
