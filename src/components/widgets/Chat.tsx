/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-widgets/Chat: the one agentic chat. The ChatMessage
// rows of one key as bubbles, a person's on the right and an agent's on the left, the agent named over the thread, each
// with its time in the viewer's zone, in the order of chatOrder; the visitor's own thread (chatThread, chatSecret);
// suggestions as chips; a Send box whose draft survives a redraw. Under a person's line, the progress of its answer from
// the line's ChatProgress in the A2A task words (an ARIA status a screen reader announces), with the agent's steps in a list that opens,
// and "The agent stopped" with Retry when the agent failed or its progress lapsed while it worked; an
// answered line keeps the list of steps the agent took while its progress stands. An
// answer of text/markdown draws as safe Markdown whose code blocks copy. Attachments and
// citations are chips by name that open the file in the FilePreview the chat names; a person attaches by
// dropping a file on the chat, by the Attach button, or from a FileTree's Ask about. The controls copy, retry, stop and
// feedback. Whole answers only: the chat streams no text.
//
// The visitor's secret rides with a sent line only through the page's write action ("write"), which the feed takes as
// the proof of the visitor's thread; a design that names another writeAction never carries it into an action.
// ChatInput and Conversation draw through this component (aliases through 0.6.x).
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { define, useRows, type Ctx } from '../../renderer/implementation';
import type { ChatProps } from '../../generated/props';
import { Markdown } from '../../viz/Markdown';
import { chatDigest, chatOrder, chatSecret, chatThread, chatTime, chatWhen, lineState, progressWords, stepsOf, type ChatLine, type Progress } from '../../chat/thread';
import { onAttach, previewPath } from '../../chat/links';

interface FileRow { id?: string; name?: string; path?: string; root?: string; mediaType?: string }
interface Cite { file?: string; path?: string; name?: string }

/**
 * What a host draws under an agent's line beside the open chat's own: a platform's closed extras, such as the
 * model that served the answer; each gets the line and the surface's context and draws nothing for a line it knows
 * nothing of.
 */
export type ChatExtra = (line: ChatLine, ctx: Ctx) => ReactNode;
const extras: ChatExtra[] = [];
/** Adds a host's extra under every agent line of every chat on the page; call before the first draw. */
export function registerChatExtra(extra: ChatExtra): void {
  if (!extras.includes(extra)) extras.push(extra);
}

/** The page's write action: the only action a visitor's secret rides with. */
export const PAGE_WRITE = 'write';
/** Typed text not yet sent, per chat, so a redraw or a remount keeps it. */
const drafts = new Map<string, string>();
/** The person's lines whose progress was seen working, per chat, so a lapse reads as the agent stopping. */
const seenWorking = new Map<string, Set<string>>();

/** What a chat takes from its properties; ChatInput and Conversation map theirs onto these. */
export interface ChatOptions {
  reads?: string; progress?: string; files?: string; key?: string; agent?: string; placeholder?: string; suggestions?: unknown[];
  attach?: boolean; format?: string; controls?: unknown[]; max?: number; preview?: string; writeAction?: string;
}

/** The plain text of a line: a run of lines that start with "- " is a list, every other line a paragraph; text only. */
function PlainText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => { if (items.length) { out.push(<ul key={out.length}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>); items = []; } };
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) { items.push(line.slice(2)); continue; }
    flush();
    if (line.trim()) out.push(<p key={out.length}>{line}</p>);
  }
  flush();
  return <>{out}</>;
}

/** The chat itself, for the three names it draws under. */
export function ChatView({ o, ctx }: { o: ChatOptions; ctx: Ctx }) {
  const key = String(o.key ?? '');
  const id = ctx.surfaceId + '/' + ctx.componentId;
  const [secret] = useState(chatSecret);
  const me = chatDigest(secret);
  const mine = (key || 'main') + ':' + me;
  const max = typeof o.max === 'number' && o.max > 0 ? Math.min(1000, o.max) : 100;
  const all = useRows<ChatLine>(ctx, o.reads ?? '/conversations');
  const lines = chatOrder(chatThread(all, key, me)).slice(-max);
  const progress = useRows<Progress>(ctx, o.progress ?? '/progress');
  const files = useRows<FileRow>(ctx, o.files ?? '/files');
  const [text, setText] = useState(() => drafts.get(id) ?? '');
  const [pending, setPending] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const log = useRef<HTMLDivElement>(null);
  const controls = new Set((Array.isArray(o.controls) ? o.controls : []).map(String));
  const writeAction = typeof o.writeAction === 'string' && o.writeAction ? o.writeAction : PAGE_WRITE;
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);
  useEffect(() => onAttach(ctx.surfaceId, ctx.componentId, fileId => setPending(p => (p.includes(fileId) ? p : [...p, fileId]))), [ctx.surfaceId, ctx.componentId]);
  const fileOf = (fileId: string) => files.find(f => f.id === fileId);
  const nameOf = (fileId: string, fallback?: string) => fileOf(fileId)?.name || fallback || fileId;
  const openFile = (fileId: string) => {
    const path = previewPath(ctx.component(o.preview));
    if (path) ctx.set(path, fileId);
  };
  const send = (words: string, inReplyTo = '', attachments: string[] = pending) => {
    const t = words.trim();
    if (!t) return;
    const entry: Record<string, unknown> = { key, text: t, inReplyTo, attachments };
    if (writeAction === PAGE_WRITE) entry.secret = secret;   // the secret goes to the feed's write alone
    ctx.dispatch(writeAction, { type: 'ChatMessage', entry });
  };
  const submit = () => {
    if (!text.trim()) return;
    send(text);
    setText(''); drafts.delete(id); setPending([]); setNote('');
  };
  const upload = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      setNote(`uploading ${file.name}`);
      const r = await ctx.upload(file);
      if (r === false) { setNote('this page does not share files'); return; }
      if (r.status < 200 || r.status >= 300) { setNote(`${file.name} refused: ${refusal(r.body) || r.status}`); continue; }
      try {
        const shared = JSON.parse(r.body || '{}') as { id?: string };
        if (shared.id) setPending(p => [...p, String(shared.id)]);
        setNote('');
      } catch { setNote(`${file.name} shared`); }
    }
  };
  const onDrop = (e: DragEvent) => {
    if (!o.attach) return;
    e.preventDefault();
    if (e.dataTransfer?.files?.length) void upload(e.dataTransfer.files);
  };
  const seen = seenWorking.get(id) ?? new Set<string>();
  seenWorking.set(id, seen);
  const progressOf = (lineId: string) => progress.filter(p => String(p.inReplyTo ?? '') === lineId).sort((a, b) => chatWhen(a as ChatLine) - chatWhen(b as ChatLine)).pop();
  /** The steps the agent took on a line, behind a button that opens them. */
  const stepList = (lineId: string, steps: ReturnType<typeof stepsOf>) => (
    <span className="as-chat-steps">
      <button type="button" className="bma-btn" aria-expanded={Boolean(open[lineId])} onClick={() => setOpen(s => ({ ...s, [lineId]: !s[lineId] }))}>
        {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </button>
      {open[lineId] ? <ol>{steps.map((s, k) => <li key={k} data-kind={s.kind}>{s.kind ? s.kind + ': ' : ''}{s.label}</li>)}</ol> : null}
    </span>
  );
  const agent = o.agent ? String(o.agent) : '';
  const suggestions = (Array.isArray(o.suggestions) ? o.suggestions : []).map(String).filter(s => s.trim());
  const chip = (fileId: string, label: string, kind: 'attachment' | 'cite') => (
    <button key={kind + fileId + label} type="button" className={'bma-pill as-chat-chip as-chat-' + kind} onClick={() => openFile(fileId)}
      title={o.preview ? 'Open in the preview' : label} aria-label={(kind === 'cite' ? 'Source: ' : 'Attachment: ') + label}>{label}</button>
  );
  return (
    <div className="as-chat bma-conversation" data-component="Chat" onDragOver={e => { if (o.attach) e.preventDefault(); }} onDrop={onDrop}>
      {agent ? <div className="bma-muted bma-small as-chat-who">Chat with <b>{agent}</b></div> : null}
      <div className="log" ref={log} role="log" aria-live="polite" aria-label={agent ? `Chat with ${agent}` : 'Chat'}>
        {lines.length ? lines.map((l, i) => {
          const lineId = String(l.id ?? '');
          const kind = l.from?.kind === 'agent' ? 'agent' : 'person';
          const ms = chatWhen(l); const when = Number.isNaN(ms) ? undefined : new Date(ms);
          const who = kind === 'person' && (!l.from?.name || l.key === mine) ? 'you' : String(l.from?.name || kind);
          const markdown = kind === 'agent' && (l.format === 'text/markdown' || (!l.format && o.format === 'text/markdown'));
          const attachments = (Array.isArray(l.attachments) ? l.attachments : []).map(String);
          const cites = (Array.isArray(l.cites) ? l.cites : []) as Cite[];
          const p = kind === 'person' ? progressOf(lineId) : undefined;
          if (p && String(p.state) === 'working') seen.add(lineId);
          const state = kind === 'person' ? lineState(l, all, p, seen.has(lineId)) : 'answered';
          const steps = stepsOf(p);
          const question = kind === 'agent' ? all.find(q => String(q.id ?? '') === String(l.inReplyTo ?? '')) : undefined;
          return (
            <div key={lineId || i} className={`line ${kind}`} data-line={lineId}>
              <div className="bubble">
                <div className="meta"><b>{who}</b> <time className="bma-muted bma-small" dateTime={when?.toISOString()} title={when?.toLocaleString()}>{chatTime(l)}</time></div>
                <div className="text">{markdown ? <Markdown markdown={String(l.text ?? '')} copy /> : <PlainText text={String(l.text ?? '')} />}</div>
                {attachments.length ? <div className="as-chat-chips">{attachments.map(a => chip(a, nameOf(a), 'attachment'))}</div> : null}
                {cites.length ? <div className="as-chat-chips"><span className="bma-muted bma-small">Sources:</span> {cites.map(c => chip(String(c.file ?? ''), c.name || nameOf(String(c.file ?? ''), c.path), 'cite'))}</div> : null}
                {kind === 'agent' && extras.length ? <div className="as-chat-extras">{extras.map((x, k) => <span key={k}>{x(l, ctx)}</span>)}</div> : null}
                {kind === 'agent' && controls.size ? (
                  <div className="as-chat-controls">
                    {controls.has('copy') ? <button type="button" className="bma-btn" onClick={() => { void navigator.clipboard?.writeText(String(l.text ?? '')); }}>Copy</button> : null}
                    {controls.has('retry') && question ? <button type="button" className="bma-btn" onClick={() => send(String(question.text ?? ''), String(question.id ?? ''), [])}>Retry</button> : null}
                    {controls.has('feedback') ? <>
                      <button type="button" className="bma-btn" aria-label="A good answer" onClick={() => ctx.dispatch('chat.feedback', { line: lineId, key: String(l.key ?? ''), value: 'up' })}>Good</button>
                      <button type="button" className="bma-btn" aria-label="A poor answer" onClick={() => ctx.dispatch('chat.feedback', { line: lineId, key: String(l.key ?? ''), value: 'down' })}>Poor</button>
                    </> : null}
                  </div>
                ) : null}
              </div>
              {kind === 'person' && (state === 'answered' || state === 'completed') && steps.length ? (
                <div className="as-chat-progress as-state-completed">{stepList(lineId, steps)}</div>
              ) : null}
              {kind === 'person' && state !== 'answered' && state !== 'completed' && state !== 'waiting' ? (
                <div className={'as-chat-progress as-state-' + state} role="status" aria-live="polite">
                  <span>{state === 'stopped' ? 'The agent stopped' : progressWords(p)}</span>
                  {steps.length ? stepList(lineId, steps) : null}
                  {(state === 'working' || state === 'submitted') && controls.has('stop')
                    ? <button type="button" className="bma-btn" onClick={() => ctx.dispatch('chat.stop', { line: lineId, key: String(l.key ?? '') })}>Stop</button> : null}
                  {state === 'stopped' || state === 'failed' || state === 'canceled'
                    ? <button type="button" className="bma-btn" onClick={() => send(String(l.text ?? ''), lineId, attachments)}>Retry</button> : null}
                </div>
              ) : null}
            </div>
          );
        }) : <div className="bma-empty">{suggestions.length ? 'No message yet. Tap a suggestion or type below.' : 'No message yet.'}</div>}
      </div>
      {suggestions.length ? (
        <div className="suggestions" role="group" aria-label="suggested questions">
          {suggestions.map(s => <button key={s} type="button" className="bma-pill as-chat-suggestion" onClick={() => send(s)}>{s}</button>)}
        </div>
      ) : null}
      {pending.length ? (
        <div className="as-chat-chips as-chat-pending" aria-label="attached to the next line">
          {pending.map(f => <span key={f} className="bma-pill">{nameOf(f)} <button type="button" className="as-chat-unattach" aria-label={'Remove ' + nameOf(f)} onClick={() => setPending(p => p.filter(x => x !== f))}>×</button></span>)}
        </div>
      ) : null}
      {note ? <div className="bma-muted bma-small" role="status">{note}</div> : null}
      <form className="send" onSubmit={e => { e.preventDefault(); submit(); }}>
        {o.attach ? (
          <label className="bma-btn as-chat-attach">Attach<input type="file" multiple className="as-visually-hidden" aria-label="Attach a file" onChange={e => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} /></label>
        ) : null}
        <input value={text} onChange={e => { setText(e.target.value); if (e.target.value) drafts.set(id, e.target.value); else drafts.delete(id); }}
          placeholder={String(o.placeholder || (agent ? `Ask ${agent}` : 'Type a message; an agent that takes it answers'))} aria-label="message" />
        <button type="submit" className="bma-btn primary">Send</button>
      </form>
    </div>
  );
}

/** The reason a feed gave for a refusal: its JSON error, else the body. */
function refusal(body: string): string {
  try { return String((JSON.parse(body) as { error?: unknown }).error ?? ''); } catch { return body; }
}

export const Chat = define<ChatProps>('Chat', ({ props, ctx }) => <ChatView o={props as ChatOptions} ctx={ctx} />);
