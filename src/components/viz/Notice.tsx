/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Notice: a status box: the status word with its icon and colour (never colour alone), a title,
// a text from a literal or a path, and a dismiss action when the page may put it away. The statusPath property names
// a path to the status word, so a page colours the box from the record it binds (an analysis that turns ready or paused).
import { define, useData } from '../../renderer/implementation';
import type { NoticeProps } from '../../generated/props';

const STATUSES = ['info', 'good', 'warning', 'serious', 'critical'] as const;
const ICONS: Record<(typeof STATUSES)[number], string> = { info: 'ⓘ', good: '✓', warning: '!', serious: '!!', critical: '⨯' };
const pointer = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('/') ? v : undefined);

export const Notice = define<NoticeProps>('Notice', ({ props, ctx }) => {
  const boundStatus = useData<unknown>(ctx, pointer(props.statusPath));
  const word = (STATUSES as readonly string[]).includes(String(boundStatus)) ? String(boundStatus) : String(props.status);
  const status = (STATUSES as readonly string[]).includes(word) ? (word as (typeof STATUSES)[number]) : 'info';
  const bound = useData<unknown>(ctx, pointer(props.text));
  const text = bound !== undefined ? String(bound) : pointer(props.text) ? '' : String(props.text ?? '');
  return (
    <div className={`bma-notice bma-status-${status}`} data-component="Notice" role={status === 'serious' || status === 'critical' ? 'alert' : 'status'}>
      <span className="icon" aria-hidden="true">{ICONS[status]}</span>
      <span className="body"><span className={`bma-status bma-status-${status} bma-small`}>{status}</span> <b>{String(props.title ?? '')}</b>{text ? <div className="text">{text}</div> : null}</span>
      {props.dismissAction ? <button type="button" className="bma-btn" onClick={() => ctx.dispatch(props.dismissAction, { id: props.id })} aria-label={'dismiss ' + String(props.title ?? '')}>Dismiss</button> : null}
    </div>
  );
});
