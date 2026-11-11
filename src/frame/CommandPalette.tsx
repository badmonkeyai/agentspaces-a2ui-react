/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The command palette: Ctrl+K or Cmd+K opens a dialog over the TitleBar's actions and the page's menu items
// (commands.ts); a person types to filter, moves with the arrows, runs one with Enter, and leaves with Escape, focus
// returning where it was; Tab keeps the focus in the dialog. A page mounts one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { commands, type Command } from './commands';

/** Whether a key press opens the palette: K with Ctrl, or with Cmd on a Mac. */
export function opensPalette(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey;
}

/** The commands whose words hold every word typed, in order. */
export function filterCommands(all: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter(c => { const text = (c.label + ' ' + c.where).toLowerCase(); return words.every(w => text.includes(w)); });
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [all, setAll] = useState<Command[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!opensPalette(e)) return;
      e.preventDefault();
      back.current = document.activeElement;
      setAll(commands());
      setQuery('');
      setActive(0);
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  const shown = useMemo(() => filterCommands(all, query), [all, query]);
  if (!open) return null;
  const close = () => { setOpen(false); (back.current as HTMLElement | null)?.focus?.(); };
  const run = (c: Command | undefined) => { if (!c) return; close(); c.run(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (shown.length ? (a + 1) % shown.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (shown.length ? (a - 1 + shown.length) % shown.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(shown[active]); }
    else if (e.key === 'Tab') e.preventDefault();   // the input is the dialog's one stop, and a modal dialog keeps the focus
  };
  return (
    <div className="as-palette-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="as-palette" role="dialog" aria-modal="true" aria-label="Commands">
        <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls="as-palette-list" aria-autocomplete="list"
          aria-activedescendant={shown[active] ? 'as-palette-' + active : undefined} aria-label="Type a command" placeholder="Type a command"
          value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} />
        <ul id="as-palette-list" role="listbox" aria-label="Commands">
          {shown.length === 0 ? <li className="as-palette-none" role="option" aria-selected="false" aria-disabled="true">No command matches.</li>
            : shown.map((c, i) => (
              <li key={c.where + '/' + c.id} id={'as-palette-' + i} role="option" aria-selected={i === active} className={i === active ? 'active' : undefined}
                onMouseDown={e => { e.preventDefault(); run(c); }}>
                <span>{c.label}</span> <small>{c.where}</small>{c.shortcut ? <kbd>{c.shortcut}</kbd> : null}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
