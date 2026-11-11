/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// A panel with a header (the window pattern of the alerts example): dragged by its header, minimized
// to its header alone and restored from it; placed in the flow or at a corner of its host. The catalog's Window
// component and the Map's alert boxes draw it.
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

export type Placement = 'flow' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'anchored';
const PLACEMENTS: readonly Placement[] = ['flow', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'anchored'];
export function placementOf(v: unknown): Placement {
  return typeof v === 'string' && (PLACEMENTS as readonly string[]).includes(v) ? (v as Placement) : 'flow';
}

export interface WindowPanelProps {
  title: string;
  placement?: Placement;
  /** The pixel the panel sits beside when anchored (its host's coordinates). */
  anchor?: { x: number; y: number };
  minimized?: boolean;
  width?: number;
  /** The panel's tone: a status word draws the header's edge in that colour. */
  status?: string;
  /** What minimize does besides collapsing: a Map moves the box to its bar. */
  onMinimize?: (minimized: boolean) => void;
  children?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}

export function WindowPanel({ title, placement = 'flow', anchor, minimized: initial = false, width, status, onMinimize, children, actions, testId }: WindowPanelProps) {
  const [minimized, setMinimized] = useState(initial);
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const toggle = () => { const next = !minimized; setMinimized(next); onMinimize?.(next); };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: offset.dx, dy: offset.dy, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setOffset({ dx: d.dx + dx, dy: d.dy + dy });
  };
  const up = () => { drag.current = null; };
  const style: CSSProperties = { transform: offset.dx || offset.dy ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined, width: width && width > 0 ? width : undefined };
  if (placement === 'anchored' && anchor) { style.left = anchor.x + 14; style.top = anchor.y - 10; }
  return (
    <section className={`bma-window place-${placement}${minimized ? ' minimized' : ''}${drag.current?.moved ? ' dragging' : ''}${status ? ` bma-status-${status}` : ''}`} style={style} data-window={testId} aria-label={title}>
      <div className="head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <b>{title}</b>
        <span className="tools">{actions}<button type="button" className="bma-btn" onClick={toggle} aria-label={minimized ? 'restore ' + title : 'minimize ' + title}>{minimized ? '▢' : '—'}</button></span>
      </div>
      {!minimized ? <div className="body">{children}</div> : null}
    </section>
  );
}
