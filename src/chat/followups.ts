/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The chips a chat offers over its Send box (agentspaces-widgets/Chat `suggestions`): a fixed list of questions, or the
// rows an agent writes at a bound path, so the follow-ups change with each answer. A bound row is a string or
// { text, label, line }: text is what a tap sends, label the chip's words when they differ, line the agent line the chip
// follows. A chip with a line draws only while that line is the newest line of the thread, so it hides as soon as the
// person sends a new line and the next answer brings its own; a chip with no line always draws, which is how an agent
// seeds its starters before any answer. At most MAX_CHIPS draw, each cut at CHIP_TEXT words with its full text kept to
// send. A chip is text drawn as text and sends only its text; line only decides whether it draws.

/** The most chips a chat draws at once. */
export const MAX_CHIPS = 8;
/** The most characters a chip shows of its text before it is cut with an ellipsis; a tap still sends the whole text. */
export const CHIP_TEXT = 120;
/** The most characters a chip shows of its label. */
export const CHIP_LABEL = 60;

/** One chip: the words it shows, the text a tap sends (its title when the two differ), and the agent line it follows. */
export interface Chip { words: string; text: string; line: string }

/** The data binding of a bound `suggestions`, or undefined for a list. */
export function suggestionsPath(suggestions: unknown): string | undefined {
  const p = suggestions && typeof suggestions === 'object' && !Array.isArray(suggestions) ? (suggestions as { '@path'?: unknown })['@path'] : undefined;
  return typeof p === 'string' && p ? p : undefined;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** A row of the list or of the bound rows as a chip, or nothing when it has no text. */
function chipOf(item: unknown): Chip | undefined {
  const row = typeof item === 'string' ? { text: item } : item && typeof item === 'object' ? (item as Record<string, unknown>) : undefined;
  const text = typeof row?.text === 'string' ? row.text.trim() : '';
  if (!text) return undefined;
  const label = typeof row?.label === 'string' ? row.label.trim() : '';
  const line = typeof row?.line === 'string' || typeof row?.line === 'number' ? String(row.line) : '';
  return { words: label ? cut(label, CHIP_LABEL) : cut(text, CHIP_TEXT), text, line };
}

/**
 * The chips that draw: from a list (`suggestions` itself) or from the rows at the bound path, each with a line only
 * while that line is `newest` (the id of the thread's newest line, empty for none) and `hidden` is not it (the line the
 * person replied to, until the reply reaches the thread); the first MAX_CHIPS, one per text.
 */
export function chipsOf(items: readonly unknown[], newest: string, hidden = ''): Chip[] {
  const out: Chip[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const chip = chipOf(item);
    if (!chip || seen.has(chip.text)) continue;
    if (chip.line && (chip.line !== newest || chip.line === hidden)) continue;
    seen.add(chip.text);
    out.push(chip);
    if (out.length === MAX_CHIPS) break;
  }
  return out;
}
