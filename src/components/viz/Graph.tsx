/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Graph: nodes and edges bound to the data model, laid out in columns (one column per `column` field, as the
// console's canvas), as a tree (layers by depth from the roots), or by force (a deterministic spring layout); drawn as
// SVG blocks and arrows in the look's colours; a node click dispatches the node action.
import { useMemo, useState } from 'react';
import { define, useRows } from '../../renderer/implementation';
import { useLook } from '../../look/provider';
import type { GraphProps } from '../../generated/props';

type Node = { id: string; title?: string; sub?: string; column?: string; kind?: string; lit?: boolean; [k: string]: unknown };
type Edge = { from: string; to: string; label?: string; [k: string]: unknown };
interface Placed { node: Node; x: number; y: number; w: number; h: number }
const COL_W = 180, GAP = 60, PAD = 24, TOP = 40, NODE_H = 44, ROW_GAP = 14;

function columnsLayout(nodes: Node[], columns: { key: string; label?: string }[]): { placed: Placed[]; width: number; height: number; bands: { x: number; w: number; label: string }[] } {
  const keys = columns.length ? columns.map(c => c.key) : [...new Set(nodes.map(n => String(n.column ?? n.kind ?? '')))];
  const labels = new Map(columns.map(c => [c.key, c.label ?? c.key]));
  const placed: Placed[] = []; const bands: { x: number; w: number; label: string }[] = [];
  let height = TOP;
  keys.forEach((k, i) => {
    const x = PAD + i * (COL_W + GAP);
    let y = TOP + 10;
    nodes.filter(n => String(n.column ?? n.kind ?? '') === k).forEach(n => { placed.push({ node: n, x, y, w: COL_W, h: NODE_H }); y += NODE_H + ROW_GAP; });
    bands.push({ x: x - 8, w: COL_W + 16, label: labels.get(k) ?? k });
    height = Math.max(height, y + 10);
  });
  return { placed, width: PAD * 2 + keys.length * COL_W + Math.max(0, keys.length - 1) * GAP, height, bands };
}

function treeLayout(nodes: Node[], edges: Edge[]) {
  const depth = new Map<string, number>();
  const incoming = new Set(edges.map(e => e.to));
  const roots = nodes.filter(n => !incoming.has(n.id));
  (roots.length ? roots : nodes.slice(0, 1)).forEach(r => depth.set(r.id, 0));
  let changed = true; let guard = 0;
  while (changed && guard++ < nodes.length + 1) { changed = false; edges.forEach(e => { const d = depth.get(e.from); if (d !== undefined && (depth.get(e.to) ?? -1) < d + 1 && d + 1 < nodes.length) { depth.set(e.to, d + 1); changed = true; } }); }
  nodes.forEach(n => { if (!depth.has(n.id)) depth.set(n.id, 0); });
  const levels = [...new Set([...depth.values()])].sort((a, b) => a - b);
  const columns = levels.map(l => ({ key: String(l), label: l === 0 ? 'roots' : `depth ${l}` }));
  return columnsLayout(nodes.map(n => ({ ...n, column: String(depth.get(n.id)) })), columns);
}

function forceLayout(nodes: Node[], edges: Edge[]) {
  const n = nodes.length; const width = Math.max(480, Math.ceil(Math.sqrt(n)) * 200); const height = Math.max(320, Math.ceil(Math.sqrt(n)) * 140);
  const pos = nodes.map((_, i) => ({ x: width / 2 + Math.cos(i * 2.399) * (width / 3) * Math.sqrt((i + 1) / n), y: height / 2 + Math.sin(i * 2.399) * (height / 3) * Math.sqrt((i + 1) / n) }));
  const index = new Map(nodes.map((d, i) => [d.id, i]));
  for (let it = 0; it < 200; it++) {
    const f = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y; const d2 = Math.max(400, dx * dx + dy * dy); const k = 9000 / d2; f[i].x -= dx * k / Math.sqrt(d2); f[i].y -= dy * k / Math.sqrt(d2); f[j].x += dx * k / Math.sqrt(d2); f[j].y += dy * k / Math.sqrt(d2); }
    edges.forEach(e => { const a = index.get(e.from), b = index.get(e.to); if (a === undefined || b === undefined) return; const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y; const d = Math.max(1, Math.hypot(dx, dy)); const k = (d - 150) * 0.02; f[a].x += dx / d * k; f[a].y += dy / d * k; f[b].x -= dx / d * k; f[b].y -= dy / d * k; });
    const cool = 1 - it / 200;
    pos.forEach((p, i) => { p.x = Math.min(width - COL_W / 2 - PAD, Math.max(COL_W / 2 + PAD, p.x + f[i].x * cool)); p.y = Math.min(height - NODE_H, Math.max(NODE_H, p.y + f[i].y * cool)); });
  }
  return { placed: nodes.map((node, i) => ({ node, x: pos[i].x - COL_W / 2, y: pos[i].y - NODE_H / 2, w: COL_W, h: NODE_H })), width, height, bands: [] as { x: number; w: number; label: string }[] };
}

export const Graph = define<GraphProps>('Graph', ({ props, ctx }) => {
  const nodes = useRows<Node>(ctx, props.nodes);
  const edges = useRows<Edge>(ctx, props.edges);
  const { tokens } = useLook();
  const [lit, setLit] = useState<string | null>(null);
  const layout = useMemo(() => props.layout === 'force' ? forceLayout(nodes, edges) : props.layout === 'tree' ? treeLayout(nodes, edges) : columnsLayout(nodes, (props.columns ?? []).filter(c => c.key).map(c => ({ key: String(c.key), label: c.label }))), [nodes, edges, props.layout, JSON.stringify(props.columns ?? [])]);
  const at = new Map(layout.placed.map(p => [p.node.id, p]));
  if (!nodes.length) return <div className="bma-empty" data-component="Graph">No node yet.</div>;
  const truncate = (s: unknown, n: number) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  return (
    <div className="bma-graph" data-component="Graph" data-layout={props.layout ?? 'columns'}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="graph">
        <defs><marker id="bma-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--bma-color-ink-muted)" /></marker></defs>
        {layout.bands.map(b => <g key={b.label} className="column"><rect x={b.x} y={TOP - 4} width={b.w} height={layout.height - TOP - 6} rx={6} /><text x={b.x + 8} y={TOP - 10}>{b.label}</text></g>)}
        {edges.map((e, i) => { const a = at.get(e.from), b = at.get(e.to); if (!a || !b) return null; const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const same = Math.abs(a.x - b.x) < 1;
          const d = same ? `M${a.x + a.w / 2} ${a.y + a.h} C ${a.x + a.w / 2} ${(a.y + b.y) / 2 + a.h / 2}, ${b.x + b.w / 2} ${(a.y + b.y) / 2 + a.h / 2}, ${b.x + b.w / 2} ${b.y}` : `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
          return <g key={i} className="edge"><path d={d} markerEnd="url(#bma-arrow)" />{e.label ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle">{String(e.label)}</text> : null}</g>; })}
        {layout.placed.map(p => { const on = lit === p.node.id || !!p.node.lit; const hue = tokens.color.categorical[Math.abs(hash(String(p.node.column ?? p.node.kind ?? ''))) % 8];
          return <g key={p.node.id} className={'node' + (on ? ' lit' : '')} transform={`translate(${p.x},${p.y})`} style={{ cursor: props.nodeAction ? 'pointer' : 'default' }}
            onClick={() => { setLit(p.node.id); ctx.dispatch(props.nodeAction, { id: p.node.id, node: p.node }); }} tabIndex={0} role={props.nodeAction ? 'button' : undefined} aria-label={String(p.node.title ?? p.node.id)}>
            <rect width={p.w} height={p.h} rx={4} /><rect width={4} height={p.h} rx={2} fill={hue} />
            <text x={12} y={18}>{truncate(p.node.title ?? p.node.id, 22)}</text>{p.node.sub ? <text className="sub" x={12} y={34}>{truncate(p.node.sub, 28)}</text> : null}
            <title>{String(p.node.title ?? p.node.id)}</title></g>; })}
      </svg>
    </div>
  );
});

function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
