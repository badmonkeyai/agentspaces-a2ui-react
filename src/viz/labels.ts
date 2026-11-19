/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// Which point labels a map draws (srad/agentspaces-geo.md GEO-M-04): labels that pile up on each other read as none, so
// the map places them in rank order and leaves out a label whose box would overlap one already placed, or that lies off
// the screen. The selected and the hovered feature's labels always show; past those, at most LABEL_MAX do. Pure: the map
// adapter projects the positions and draws what this returns, and the tests call it directly.

/** The most labels a map shows at once, beyond the selected and the hovered feature's. */
export const LABEL_MAX = 40;

/** The label's text size in pixels, and the chip's padding around it (x, y). */
export const LABEL_SIZE = 11;
export const LABEL_PAD: [number, number] = [6, 3];

const SEVERITY_RANK: Record<string, number> = { critical: 4, serious: 3, warning: 2, info: 1 };

/** A label to place: its key, its text, and what ranks it (always shown, severity, time). */
export interface LabelItem { key: string; label: string; severity?: string; at?: string; always?: boolean }

/** A ranked label at its pixel: the point's place on the screen and the label's offset below it. */
export interface PlacedLabel { key: string; label: string; x: number; y: number; dy: number; always?: boolean }

/** Ranks labels: the ones always shown, then the graver severity, then the newer time, then by text, so a tie is stable. */
export function rankLabels<T extends LabelItem>(items: readonly T[]): T[] {
  const time = (s?: string) => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : 0; };
  return [...items].sort((a, b) => Number(Boolean(b.always)) - Number(Boolean(a.always))
    || (SEVERITY_RANK[b.severity ?? ''] ?? 0) - (SEVERITY_RANK[a.severity ?? ''] ?? 0)
    || time(b.at) - time(a.at)
    || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

/** The chip a label takes on the screen, anchored at the middle of its top edge, a little below its point. */
export function labelBox(l: PlacedLabel, size = LABEL_SIZE): { left: number; top: number; right: number; bottom: number } {
  // an estimate of the text's width (a sans face averages about 0.6 em a character); the chip's padding around it
  const w = l.label.length * size * 0.6 + LABEL_PAD[0] * 2;
  const h = size * 1.25 + LABEL_PAD[1] * 2;
  return { left: l.x - w / 2, top: l.y + l.dy, right: l.x + w / 2, bottom: l.y + l.dy + h };
}

/**
 * Places labels in the order given (rankLabels first): one that overlaps a placed one, or lies wholly outside the
 * width by height screen, is left out; the ones marked always are placed whatever they overlap. Returns the placed keys.
 */
export function placeLabels(ranked: readonly PlacedLabel[], width: number, height: number, max = LABEL_MAX, gap = 2): Set<string> {
  const placed: Array<ReturnType<typeof labelBox>> = [];
  const keys = new Set<string>();
  let counted = 0;
  for (const l of ranked) {
    if (!l.always && counted >= max) break;
    const b = labelBox(l);
    if (b.right < 0 || b.bottom < 0 || b.left > width || b.top > height) continue;
    if (!l.always && placed.some(p => b.left < p.right + gap && b.right + gap > p.left && b.top < p.bottom + gap && b.bottom + gap > p.top)) continue;
    placed.push(b);
    keys.add(l.key);
    if (!l.always) counted++;
  }
  return keys;
}
