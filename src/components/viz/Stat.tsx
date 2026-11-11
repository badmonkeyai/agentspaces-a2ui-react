/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import { define, fmt, useData } from '../../renderer/implementation';
import type { StatProps } from '../../generated/props';

/** agentspaces-viz/Stat: one figure with its label, unit, delta, and status (the status palette, with its word, never colour alone). */
/** A string that names a place in the data model starts with a slash; any other string is the figure itself. */
const pointer = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('/') ? v : undefined);
const literal = (v: unknown): unknown => (typeof v === 'string' && !v.startsWith('/') ? v : undefined);

export const Stat = define<StatProps>('Stat', ({ props, ctx }) => {
  // value, delta, and status are pointers into the data model, or literal figures an agent wrote into the component
  // (the operations center's tiles were blank: it writes "0 of 0", found in the study of 2026-11-06)
  const value = useData<unknown>(ctx, pointer(props.value)) ?? literal(props.value);
  const delta = useData<unknown>(ctx, pointer(props.delta)) ?? literal(props.delta);
  const status = useData<unknown>(ctx, pointer(props.status)) ?? literal(props.status);
  const s = status === undefined ? '' : String(status);
  const d = typeof delta === 'number' ? delta : delta === undefined ? undefined : Number(delta);
  return (
    <div className="bma-stat" data-component="Stat">
      <span className="bma-muted bma-small">{String(props.label ?? '')}</span>
      <span className="value">{fmt(value)}{props.unit ? <span className="unit">{String(props.unit)}</span> : null}</span>
      {d !== undefined && Number.isFinite(d) ? <span className="delta" aria-label="change">{d > 0 ? '▲ +' : d < 0 ? '▼ ' : '• '}{fmt(d)}</span> : null}
      {s ? <span className={`bma-status bma-status-${s} bma-small`}>{s}</span> : null}
    </div>
  );
});
