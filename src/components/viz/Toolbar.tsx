/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Toolbar: a row of actions, each a label and the action it dispatches with its context, and
// a Menu by id as its overflow.
import { define } from '../../renderer/implementation';
import type { ToolbarProps } from '../../generated/props';

export const Toolbar = define<ToolbarProps>('Toolbar', ({ props, ctx }) => {
  const actions = Array.isArray(props.actions) ? props.actions.filter(a => a && typeof a === 'object' && typeof a.action === 'string') : [];
  return (
    <div className="bma-toolbar" data-component="Toolbar" role="toolbar" aria-label={String(props.title ?? 'actions')}>
      {props.title ? <b>{String(props.title)}</b> : null}
      {actions.map((a, i) => <button type="button" key={i} className={`bma-btn${a.primary ? ' primary' : ''}`} onClick={() => ctx.dispatch(a.action, a.context && typeof a.context === 'object' ? (a.context as Record<string, unknown>) : {})}>{String(a.label ?? a.action)}</button>)}
      {props.menu ? ctx.child(String(props.menu)) : null}
      {!actions.length && !props.menu ? <span className="bma-empty">No action.</span> : null}
    </div>
  );
}, ['menu']);
