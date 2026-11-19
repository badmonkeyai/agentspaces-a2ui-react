/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Toolbar: a row of actions, each a label and the action it dispatches with its context, and
// a Menu by id as its overflow. An action with confirm asks first: a modal dialog with
// its title, its question (literal words, or a data model path to them, as Notice's text takes) and two buttons, the no
// button focused; Escape and no dispatch nothing and give the focus back to the action's button, yes dispatches it.
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { define, useData, type Ctx } from '../../renderer/implementation';
import type { ToolbarProps } from '../../generated/props';

type Confirm = { title: string; text?: string; yes?: string; no?: string };
type Action = { label?: unknown; action: string; primary?: unknown; context?: unknown; confirm?: Confirm };

const confirmOf = (v: unknown): Confirm | undefined => {
  const c = v as { title?: unknown; text?: unknown; yes?: unknown; no?: unknown } | null | undefined;
  if (!c || typeof c !== 'object' || typeof c.title !== 'string' || !c.title.trim()) return undefined;
  const words = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
  return { title: c.title.trim(), text: typeof c.text === 'string' ? c.text : undefined, yes: words(c.yes), no: words(c.no) };
};

export const Toolbar = define<ToolbarProps>('Toolbar', ({ props, ctx }) => {
  const actions = Array.isArray(props.actions) ? props.actions.filter(a => a && typeof a === 'object' && typeof a.action === 'string') as Action[] : [];
  const [asking, setAsking] = useState<number | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const run = (a: Action) => ctx.dispatch(a.action, a.context && typeof a.context === 'object' ? (a.context as Record<string, unknown>) : {});
  const close = (i: number, yes: boolean) => {
    setAsking(null);
    if (yes) run(actions[i]);
    // the focus goes back to the button that asked
    setTimeout(() => buttons.current[i]?.focus(), 0);
  };
  const ask = asking === null ? undefined : confirmOf(actions[asking]?.confirm);
  return (
    <div className="bma-toolbar" data-component="Toolbar" role="toolbar" aria-label={String(props.title ?? 'actions')}>
      {props.title ? <b>{String(props.title)}</b> : null}
      {actions.map((a, i) => <button type="button" key={i} ref={el => { buttons.current[i] = el; }} className={`bma-btn${a.primary ? ' primary' : ''}`}
        aria-haspopup={confirmOf(a.confirm) ? 'dialog' : undefined}
        onClick={() => (confirmOf(a.confirm) ? setAsking(i) : run(a))}>{String(a.label ?? a.action)}</button>)}
      {props.menu ? ctx.child(String(props.menu)) : null}
      {!actions.length && !props.menu ? <span className="bma-empty">No action.</span> : null}
      {ask && asking !== null ? <ConfirmDialog ask={ask} ctx={ctx} done={yes => close(asking, yes)} /> : null}
    </div>
  );
}, ['menu']);

const pointer = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('/') ? v : undefined);

/** The modal confirm: the title, the question, the no button focused; Tab stays inside, Escape is no. */
function ConfirmDialog({ ask, ctx, done }: { ask: Confirm; ctx: Ctx; done(yes: boolean): void }) {
  const titleId = useId(), textId = useId();
  const bound = useData<unknown>(ctx, pointer(ask.text));
  const text = pointer(ask.text) ? (bound === undefined || bound === null ? '' : String(bound)) : ask.text ?? '';
  const no = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { no.current?.focus(); }, []);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    if (!focusable.length) return;
    const at = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const next = focusable[(at + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
    e.preventDefault();
    next.focus();
  };
  return (
    <div className="as-confirm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div ref={box} className="as-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={text ? textId : undefined} onKeyDown={onKey}>
        <h2 id={titleId} className="as-confirm-title">{ask.title}</h2>
        {text ? <p id={textId} className="as-confirm-text">{text}</p> : null}
        <div className="as-confirm-buttons">
          <button ref={no} type="button" className="bma-btn" onClick={() => done(false)}>{ask.no ?? 'Cancel'}</button>
          <button type="button" className="bma-btn primary" onClick={() => done(true)}>{ask.yes ?? 'Yes'}</button>
        </div>
      </div>
    </div>
  );
}
