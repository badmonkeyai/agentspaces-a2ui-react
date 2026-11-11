/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/KeyValue: facts as label and value pairs: the items given (a literal or a path each), or every
// scalar field of the object at a path.
import { define, fmt, useData, type Ctx } from '../../renderer/implementation';
import type { KeyValueProps } from '../../generated/props';

const pointer = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('/') ? v : undefined);

function Item({ ctx, label, value }: { ctx: Ctx; label: string; value: unknown }) {
  const bound = useData<unknown>(ctx, pointer(value));
  const shown = pointer(value) ? bound : value;
  return <><dt>{label}</dt><dd>{shown === undefined || shown === null ? <span className="bma-muted">—</span> : fmt(shown)}</dd></>;
}

export const KeyValue = define<KeyValueProps>('KeyValue', ({ props, ctx }) => {
  const object = useData<unknown>(ctx, pointer(props.path));
  const items: Array<{ label: string; value: unknown }> = Array.isArray(props.items) && props.items.length
    ? props.items.filter(i => i && typeof i === 'object').map(i => ({ label: String(i.label ?? ''), value: i.value }))
    : object && typeof object === 'object' ? Object.entries(object as Record<string, unknown>).filter(([, v]) => v === null || typeof v !== 'object').map(([k, v]) => ({ label: k, value: v })) : [];
  return (
    <div className="bma-keyvalue" data-component="KeyValue">
      {props.title ? <h4>{String(props.title)}</h4> : null}
      {items.length ? <dl>{items.map((i, n) => <Item key={n} ctx={ctx} label={i.label} value={i.value} />)}</dl> : <div className="bma-empty">Nothing to show yet.</div>}
    </div>
  );
});
