/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The icons a TitleBar, a Menu or a navigation names: a few strokes each, drawn in the text's colour, and
// hidden from a screen reader since the words beside them say the same. A name outside the set draws nothing.
const PATHS: Record<string, string> = {
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3',
  share: 'M12 4v11M7 9l5-5 5 5M5 14v6h14v-6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 18h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  folder: 'M3 6h6l2 2h10v11H3z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

/** The icon names a design may use. */
export const ICONS: readonly string[] = Object.keys(PATHS);

export function Icon({ name }: { name?: string }) {
  const d = name ? PATHS[name] : undefined;
  if (!d) return null;
  return (
    <svg className="as-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
