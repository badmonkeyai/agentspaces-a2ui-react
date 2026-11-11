/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Timeline: events on lanes over time; a lane per distinct `lane` field (or the lanes path), the hues by lane
// position from the look, a label on each event when the lane holds twelve or fewer.
import { useMemo } from 'react';
import { define, useData, useRows } from '../../renderer/implementation';
import { useLook } from '../../look/provider';
import type { TimelineProps } from '../../generated/props';

type Ev = { at?: string; lane?: string; title?: string; [k: string]: unknown };
const W = 640, LANE_H = 34, PAD_L = 90, PAD_R = 16, PAD_T = 8;

export const Timeline = define<TimelineProps>('Timeline', ({ props, ctx }) => {
  const events = useRows<Ev>(ctx, props.events);
  const laneList = useData<unknown>(ctx, props.lanes);
  const { tokens } = useLook();
  const lanes = useMemo(() => {
    const names = Array.isArray(laneList) ? laneList.map(String) : [];
    events.forEach(e => { const l = String(e.lane ?? ''); if (!names.includes(l)) names.push(l); });
    return names;
  }, [events, laneList]);
  const times = events.map(e => new Date(String(e.at ?? '')).getTime()).filter(t => Number.isFinite(t));
  const given = (s: unknown) => { const t = new Date(String(s ?? '')).getTime(); return Number.isFinite(t) ? t : undefined; };
  const from = given(props.from) ?? (times.length ? Math.min(...times) : 0);
  const to = given(props.to) ?? (times.length ? Math.max(...times) : from + 1);
  const span = Math.max(1, to - from);
  const iso = (t: number) => (Number.isFinite(t) ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) : '');
  const x = (t: number) => PAD_L + ((t - from) / span) * (W - PAD_L - PAD_R);
  const H = PAD_T + lanes.length * LANE_H + 20;
  if (!events.length) return <div className="bma-empty" data-component="Timeline">No event yet.</div>;
  return (
    <div className="bma-timeline" data-component="Timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="timeline">
        {lanes.map((l, i) => <g key={l} className="lane"><text x={PAD_L - 8} y={PAD_T + i * LANE_H + LANE_H / 2 + 4} textAnchor="end">{l || 'events'}</text><line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + i * LANE_H + LANE_H / 2} y2={PAD_T + i * LANE_H + LANE_H / 2} /></g>)}
        {events.map((e, i) => { const t = new Date(String(e.at ?? '')).getTime(); if (!Number.isFinite(t)) return null; const li = lanes.indexOf(String(e.lane ?? '')); const cy = PAD_T + li * LANE_H + LANE_H / 2; const color = tokens.color.categorical[li % 8];
          const inLane = events.filter(o => String(o.lane ?? '') === String(e.lane ?? '')).length;
          return <g key={i} className="event"><circle cx={x(t)} cy={cy} r={5} fill={color}><title>{`${e.title ?? ''} · ${e.at ?? ''}`}</title></circle>{inLane <= 12 ? <text x={x(t)} y={cy - 9} textAnchor={x(t) > W - 90 ? 'end' : x(t) < PAD_L + 60 ? 'start' : 'middle'}>{String(e.title ?? '')}</text> : null}</g>; })}
        <g className="axis"><text x={PAD_L} y={H - 4}>{iso(from)}</text><text x={W - PAD_R} y={H - 4} textAnchor="end">{iso(to)}</text></g>
      </svg>
    </div>
  );
});
