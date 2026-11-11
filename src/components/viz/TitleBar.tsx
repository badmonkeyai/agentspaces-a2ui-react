/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/TitleBar: the page's one bar. The app's name (a literal or a path) and icon, a
// subtitle, a status read from the WorkingOn rows at status.from in the A2A words (any row working shows the working
// label; else failed, then input-required; else idle), the actions the design declares, and its Menu by id as the
// overflow. The first TitleBar on a page claims the page's bar and shows the page's own tools at its end, so the page
// draws one bar. Its actions join the command palette.
import { useRef } from 'react';
import { define, useData, useRows } from '../../renderer/implementation';
import type { TitleBarProps } from '../../generated/props';
import { useCommands } from '../../frame/commands';
import { useBarClaim } from '../../frame/frame';
import { Icon } from '../../frame/icons';

interface Action { id: string; label: string; icon?: string; action?: { name: string; context?: Record<string, unknown> } }
interface Labels { working?: string; idle?: string; input?: string; failed?: string }

/** The status word of a list of WorkingOn rows, in the A2A task states. */
export function statusOf(rows: Array<{ state?: unknown }>): 'working' | 'failed' | 'input' | 'idle' {
  const states = new Set(rows.map(r => String(r.state ?? '')));
  if (states.has('working') || states.has('submitted')) return 'working';
  if (states.has('failed')) return 'failed';
  if (states.has('input-required')) return 'input';
  return 'idle';
}

const DEFAULT_LABELS: Required<Labels> = { working: 'Working', idle: 'Ready', input: 'Needs your input', failed: 'The agent stopped' };

export const TitleBar = define<TitleBarProps>('TitleBar', ({ props, ctx }) => {
  const literal = typeof props.title === 'string' ? props.title : undefined;
  const path = props.title && typeof props.title === 'object' ? (props.title as { path?: string }).path : undefined;
  const bound = useData<unknown>(ctx, path);
  const title = literal ?? (bound === undefined || bound === null ? undefined : String(bound));
  const status = props.status as { from?: string; labels?: Labels } | undefined;
  const rows = useRows<{ state?: unknown }>(ctx, status?.from);
  const word = statusOf(rows);
  const labels = { ...DEFAULT_LABELS, ...(status?.labels ?? {}) };
  const actions = (Array.isArray(props.actions) ? props.actions : []) as Action[];
  const bar = useBarClaim();
  const owner = useRef({});
  const run = (a: Action) => ctx.dispatch(a.action?.name, { id: a.id, ...(a.action?.context ?? {}) });
  useCommands(owner.current, () => actions.map(a => ({ id: a.id, label: a.label, where: title ?? 'Title bar', run: () => run(a) })), [JSON.stringify(actions), title]);
  return (
    <div className="as-titlebar" data-component="TitleBar" data-holds-page-bar={bar.held ? '' : undefined}>
      <Icon name={typeof props.icon === 'string' ? props.icon : undefined} />
      <span className="as-titlebar-names">
        {title === undefined ? <span className="as-titlebar-title" aria-busy="true">Loading…</span> : <span className="as-titlebar-title" role="heading" aria-level={1}>{title}</span>}
        {props.subtitle ? <span className="as-titlebar-subtitle">{String(props.subtitle)}</span> : null}
      </span>
      {status?.from ? <span className={'as-titlebar-status bma-status as-state-' + word} role="status" aria-live="polite">{labels[word]}</span> : null}
      <span className="as-titlebar-actions">
        {actions.map(a => (
          <button key={a.id} type="button" className="bma-btn" onClick={() => run(a)}><Icon name={a.icon} />{a.label}</button>
        ))}
        {props.menu ? ctx.child(String(props.menu)) : null}
      </span>
      {bar.tools ? <span className="as-titlebar-tools">{bar.tools}</span> : null}
    </div>
  );
}, ['menu']);
