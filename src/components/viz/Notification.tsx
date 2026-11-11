/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Notification: alerts or incidents bound to the data model, grouped by incident, group, or not at all; each
// carries its severity as a status colour with its word, an acknowledge action, and a route action.
// The detail property names the item field drawn as a second line, and routeLabel the route button's words.
import { useMemo } from 'react';
import { define, useRows } from '../../renderer/implementation';
import type { NotificationProps } from '../../generated/props';

type Item = { id?: string; severity?: string; title?: string; at?: string; group?: string; incident?: string; acknowledged?: boolean; [k: string]: unknown };

export const Notification = define<NotificationProps>('Notification', ({ props, ctx }) => {
  const items = useRows<Item>(ctx, props.items);
  const groupBy = props.groupBy ?? 'incident';
  const groups = useMemo(() => {
    const out = new Map<string, Item[]>();
    items.forEach(i => { const k = groupBy === 'none' ? '' : String(i[groupBy] ?? (groupBy === 'incident' ? i.id ?? '' : '')); if (!out.has(k)) out.set(k, []); out.get(k)!.push(i); });
    return [...out.entries()];
  }, [items, groupBy]);
  if (!items.length) return <div className="bma-empty" data-component="Notification">Nothing to acknowledge.</div>;
  return (
    <div className="bma-notifications" data-component="Notification">
      {groups.map(([k, list]) => (
        <div key={k} className="bma-notification-group">
          {k && groupBy !== 'none' && (groupBy !== 'incident' || list.length > 1) ? <h4>{groupBy} {k} · {list.length}</h4> : null}
          {list.map((i, n) => { const sev = String(i.severity ?? 'warning');
            return <div key={i.id ?? n} className={`bma-notification bma-status-${sev}`} aria-live="polite">
              <span className={`bma-status bma-status-${sev} bma-small`}>{sev}</span>
              <span><b>{String(i.title ?? i.id ?? '')}</b>{i.group ? <span className="bma-pill" style={{ marginLeft: 6 }}>{String(i.group)}</span> : null}{props.detail && i[props.detail] !== undefined && i[props.detail] !== null && String(i[props.detail]) ? <div className="detail">{String(i[props.detail])}</div> : null}<div className="when">{String(i.at ?? '')}</div></span>
              <span>{i.acknowledged ? <span className="bma-muted bma-small">acknowledged</span> : <button type="button" className="bma-btn primary" onClick={() => ctx.dispatch(props.ackAction, { id: i.id, incident: i.incident ?? i.id })} aria-label={`Acknowledge: ${String(i.title ?? i.id ?? '')}`}>Acknowledge</button>}
                {props.routeAction ? <button type="button" className="bma-btn" style={{ marginLeft: 4 }} onClick={() => ctx.dispatch(props.routeAction, { id: i.id })} aria-label={`${props.routeLabel || 'Route'}: ${String(i.title ?? i.id ?? '')}`}>{props.routeLabel || 'Route'}</button> : null}</span>
            </div>; })}
        </div>
      ))}
    </div>
  );
});
