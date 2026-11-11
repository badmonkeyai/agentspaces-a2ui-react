/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Menu: a menu behind a menu button, an overflow, or a context menu on the
// row or the file it sits in, over the WAI-ARIA Menu Button and Menu patterns. Items come as a list or from a path of
// the data model; they sit together by group with a separator between groups, may be disabled or checked (a literal
// or a path), show their shortcut, and open one level of submenu. A press dispatches the item's action with its id
// (and, for a checked item, the value it turns to). The trigger always draws, so a context menu has a keyboard path
// too (the trigger, Shift+F10, or the context menu key). MenuView is the popup alone, for a component that opens a
// menu of its own (a file tree's rows).
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { define, useData, type Ctx } from '../../renderer/implementation';
import type { MenuProps } from '../../generated/props';
import { useCommands } from '../../frame/commands';
import { Icon } from '../../frame/icons';

export interface MenuItem { id: string; label: string; shortcut?: string; group?: string; disabled?: boolean; checked?: unknown; icon?: string;
  action?: { name: string; context?: Record<string, unknown> }; items?: MenuItem[] }

/** The items in drawing order: each group where its first item stood, a group's items in their order. */
export function grouped(items: MenuItem[]): MenuItem[][] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const g = item.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(item);
  }
  return [...groups.values()];
}

/** Whether a key press is a shortcut such as Ctrl+Shift+O. */
export function matchesShortcut(shortcut: string | undefined, e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  if (!shortcut) return false;
  const parts = shortcut.split('+').map(p => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const want = new Set(parts.slice(0, -1));
  return e.key.toLowerCase() === key && want.has('ctrl') === e.ctrlKey && want.has('shift') === e.shiftKey && want.has('alt') === e.altKey
    && (want.has('cmd') || want.has('meta')) === e.metaKey;
}

export interface MenuViewProps {
  items: MenuItem[];
  label: string;
  isChecked(item: MenuItem): boolean;
  run(item: MenuItem): void;
  close(refocus: boolean): void;
  /** Which item takes focus first: the first, or the last (an ArrowUp on the trigger). */
  start?: 'first' | 'last';
  at?: { x: number; y: number };
  id?: string;
  /** A submenu: ArrowLeft closes it and returns the focus to its item. */
  nested?: boolean;
}

/** The open menu: role menu, roving focus, the APG keys, one level of submenu; running an item of a submenu closes the whole menu. */
export function MenuView({ items, label, isChecked, run, close, start = 'first', at, id, nested = false }: MenuViewProps) {
  const flat = grouped(items).flat();
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  const [sub, setSub] = useState<number | null>(null);
  const focus = (i: number) => refs.current[(i + flat.length) % flat.length]?.focus();
  useEffect(() => { focus(start === 'last' ? flat.length - 1 : 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const current = () => refs.current.findIndex(r => r === document.activeElement);
  const activate = (item: MenuItem, i: number) => {
    if (item.disabled) return;
    if (item.items?.length) { setSub(i); return; }
    close(true);
    run(item);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const i = current();
    if (e.key === 'ArrowDown') focus(i + 1);
    else if (e.key === 'ArrowUp') focus(i - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(flat.length - 1);
    else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') { close(false); return; }
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) activate(flat[i], i);
    else if (e.key === 'ArrowRight' && i >= 0 && flat[i].items?.length) setSub(i);
    else if (e.key === 'ArrowLeft' && nested) close(true);
    else if (e.key === 'ArrowLeft') { /* the top menu stays open */ }
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      const n = flat.findIndex((it, k) => k > i && it.label.toLowerCase().startsWith(e.key.toLowerCase()));
      const m = n >= 0 ? n : flat.findIndex(it => it.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (m >= 0) focus(m);
    } else {
      const hit = flat.find(it => matchesShortcut(it.shortcut, e.nativeEvent));
      if (!hit) return;
      activate(hit, flat.indexOf(hit));
    }
    e.preventDefault();
    e.stopPropagation();
  };
  let k = -1;
  return (
    <ul id={id} className="as-menu-popup" role="menu" aria-label={label} onKeyDown={onKey} style={at ? { position: 'fixed', left: at.x, top: at.y } : undefined}>
      {grouped(items).map((group, g) => [
        g > 0 ? <li key={'sep-' + g} role="separator" className="as-menu-sep" /> : null,
        ...group.map(item => {
          const i = ++k;
          const checkable = item.checked !== undefined;
          return (
            <li key={item.id} ref={el => { refs.current[i] = el; }} tabIndex={-1}
              role={checkable ? 'menuitemcheckbox' : 'menuitem'} aria-checked={checkable ? isChecked(item) : undefined}
              aria-disabled={item.disabled ? true : undefined} aria-haspopup={item.items?.length ? 'menu' : undefined}
              aria-expanded={item.items?.length ? sub === i : undefined} aria-keyshortcuts={item.shortcut ? item.shortcut.replace(/Ctrl/g, 'Control') : undefined}
              className={'as-menu-item' + (item.disabled ? ' disabled' : '')} onClick={e => { e.stopPropagation(); activate(item, i); }}>
              <span className="check" aria-hidden="true">{checkable && isChecked(item) ? '✓' : ''}</span>
              <Icon name={item.icon} />
              <span className="label">{item.label}</span>
              {item.shortcut ? <kbd className="shortcut">{item.shortcut}</kbd> : item.items?.length ? <span className="more" aria-hidden="true">›</span> : null}
              {sub === i && item.items?.length ? (
                <MenuView items={item.items} label={item.label} isChecked={isChecked} start="first" nested
                  run={it => { close(true); run(it); }}
                  close={refocus => { setSub(null); if (refocus) focus(i); }} />
              ) : null}
            </li>
          );
        }),
      ])}
    </ul>
  );
}

/** The items a Menu shows, and the note its trigger carries while they are not a list. */
function useItems(ctx: Ctx, items: MenuProps['items']): { list: MenuItem[]; note: string } {
  const bound = useData<unknown>(ctx, typeof items === 'string' ? items : undefined);
  if (Array.isArray(items)) return { list: items as MenuItem[], note: items.length ? '' : 'None' };
  if (bound === undefined) return { list: [], note: 'Loading' };
  if (!Array.isArray(bound)) return { list: [], note: 'Unavailable' };
  return { list: bound as MenuItem[], note: bound.length ? '' : 'None' };
}

export const Menu = define<MenuProps>('Menu', ({ props, ctx }) => {
  const trigger = (props.trigger ?? {}) as { kind?: string; label?: string };
  const kind = trigger.kind ?? 'button';
  const label = trigger.label || (kind === 'overflow' ? 'More' : 'Actions');
  const { list, note } = useItems(ctx, props.items);
  const [open, setOpen] = useState<null | { start: 'first' | 'last'; at?: { x: number; y: number } }>(null);
  const button = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const checks = useRef(new Map<string, boolean>());
  const isChecked = (item: MenuItem) => {
    const c = item.checked as unknown;
    if (c && typeof c === 'object' && 'path' in (c as object)) return checks.current.get(item.id) ?? Boolean(ctx.get((c as { path: string }).path));
    return Boolean(c);
  };
  const run = (item: MenuItem) => {
    const context: Record<string, unknown> = { id: item.id, ...(item.action?.context ?? {}) };
    if (item.checked !== undefined) {
      const next = !isChecked(item);
      checks.current.set(item.id, next);
      context.checked = next;
    }
    ctx.dispatch(item.action?.name, context);
  };
  useCommands(host, () => list.flatMap(i => (i.items?.length ? i.items : [i])).map(i => ({ id: i.id, label: i.label, where: label, shortcut: i.shortcut, disabled: i.disabled, run: () => run(i) })), [JSON.stringify(list), label]);
  // a context menu opens on the row it sits in, at the pointer, or from the keyboard there
  useEffect(() => {
    const row = kind === 'context' ? host.current?.parentElement : null;
    if (!row) return;
    const onContext = (e: MouseEvent) => { if (!list.length) return; e.preventDefault(); setOpen({ start: 'first', at: { x: e.clientX, y: e.clientY } }); };
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { if (!list.length) return; e.preventDefault(); setOpen({ start: 'first' }); } };
    row.addEventListener('contextmenu', onContext);
    row.addEventListener('keydown', onKey);
    return () => { row.removeEventListener('contextmenu', onContext); row.removeEventListener('keydown', onKey); };
  }, [kind, list.length]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const onTriggerKey = (e: ReactKeyboardEvent) => {
    if (!list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen({ start: 'first' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen({ start: 'last' }); }
  };
  return (
    <span ref={host} className={'as-menu as-menu-' + kind} data-component="Menu">
      <button ref={button} type="button" className={kind === 'overflow' ? 'bma-btn as-menu-overflow' : 'bma-btn'} aria-haspopup="menu"
        aria-expanded={open ? true : false} aria-controls={open ? menuId : undefined} aria-label={kind === 'overflow' ? label : undefined}
        aria-busy={note === 'Loading' ? true : undefined} disabled={!list.length}
        onClick={() => setOpen(o => (o ? null : { start: 'first' }))} onKeyDown={onTriggerKey}>
        {kind === 'overflow' ? <><Icon name="more" /><span className="as-visually-hidden">{label}</span></> : label}
        {note ? <span className="as-menu-note"> {note}</span> : null}
      </button>
      {open ? (
        <span className="as-menu-anchor">
          <MenuView id={menuId} items={list} label={label} isChecked={isChecked} run={run} start={open.start} at={open.at}
            close={refocus => { setOpen(null); if (refocus) button.current?.focus(); }} />
        </span>
      ) : null}
    </span>
  );
});
