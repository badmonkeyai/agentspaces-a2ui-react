/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-widgets/FileTree: the files of the rows at
// `reads` as a tree over <agentspaces-tree>, the WAI-ARIA tree element of this package. Folders come from each row's
// `path` (SharedFile version 2), else its name. A file carries a badge when an agent holds it (the WorkingOn rows at
// `working`), when an agent wrote it, and when it is new or changed since this person looked: the marks stay in the
// browser (local storage), and a browser's first look marks what is there as seen. Upload by the Upload button or by a
// drop on the tree (a drop on a folder lands under its path); download by the file's link. A file's context menu (a
// right press, Shift+F10 or the ContextMenu key) offers Ask about (attaches it to the Chat named by `chat`), Download,
// Share (the file.share action, and the link copied), Rename (file.rename with the new name) and Remove (file.remove,
// after a confirmation); the host applies the three actions. Choosing a file opens it in the FilePreview named by
// `preview`. FileShare draws through it as a flat list, with its notice and its attestation box.
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { define, useData, type Ctx } from '../../renderer/implementation';
import type { FileTreeProps } from '../../generated/props';
import { MenuView, type MenuItem } from '../viz/Menu';
import { attachToChat, previewPath } from '../../chat/links';
import { defineTree, type AgentSpacesTree } from '../../elements/tree';
import { badgesOf, dropFiles, mark, pathOf, treeRows, type DropState, type FileRow, type Seen, type TreeNode } from '../../files/files';

/** What a tree takes from its properties; FileShare maps its own onto these. */
export interface TreeOptions {
  reads?: string; working?: string; label?: string; upload?: boolean; preview?: string; chat?: string; actions?: unknown[]; badges?: unknown[];
  agents?: unknown[]; flat?: boolean; accept?: unknown[]; maxBytes?: number; notice?: string; attest?: string; multiple?: boolean;
}

const ALL_BADGES = ['working', 'new', 'changed', 'agent'];
const LABELS: Record<string, string> = { ask: 'Ask about this file', download: 'Download', share: 'Share', rename: 'Rename', remove: 'Remove' };

const seenKey = (surfaceId: string, componentId: string) => 'agentspaces-tree-seen:' + surfaceId + '/' + componentId;
const openKey = (surfaceId: string, componentId: string) => 'agentspaces-tree-open:' + surfaceId + '/' + componentId;
function readStore<T>(key: string): T | undefined {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v as T : undefined; } catch { return undefined; }
}
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the view is the browser's; a full store keeps none */ }
}

export function FileTreeView({ o, ctx }: { o: TreeOptions; ctx: Ctx }) {
  defineTree();
  const raw = useData<unknown>(ctx, o.reads ?? '/files');
  const files = useMemo(() => (Array.isArray(raw) ? raw as FileRow[] : []), [raw]);
  const working = useData<unknown>(ctx, o.working);
  const holding = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of Array.isArray(working) ? working as Array<{ agent?: string; files?: string[]; state?: string }> : []) {
      if (w.state && w.state !== 'working' && w.state !== 'submitted') continue;
      for (const p of w.files ?? []) m.set(String(p), String(w.agent ?? 'an agent'));
    }
    return m;
  }, [working]);
  // the agents of the page: the names the design gives, else every agent seen holding a file here (kept after it lets go)
  const heard = useRef(new Set<string>());
  for (const w of Array.isArray(working) ? working as Array<{ agent?: string }> : []) if (w.agent) heard.current.add(String(w.agent));
  const named = (Array.isArray(o.agents) ? o.agents : []).map(String);
  const agents = useMemo(() => new Set(named.length ? named : [...heard.current]), [named.join(), working]);
  const shown = new Set((Array.isArray(o.badges) && o.badges.length ? o.badges : ALL_BADGES).map(String));
  const [seen, setSeen] = useState<Seen | undefined>(() => readStore<Seen>(seenKey(ctx.surfaceId, ctx.componentId)));
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => readStore(openKey(ctx.surfaceId, ctx.componentId)) ?? {});
  const [selected, setSelected] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [ask, setAsk] = useState<{ kind: 'rename' | 'remove'; file: FileRow } | null>(null);
  const [states, setStates] = useState<Record<string, DropState>>({});
  const [ticked, setTicked] = useState(false);
  const [say, setSay] = useState('');
  const host = useRef<AgentSpacesTree | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // a browser's first look takes what is there as seen, so only what arrives later reads as new
  useEffect(() => {
    if (seen === undefined && Array.isArray(raw)) {
      const first: Seen = Object.fromEntries(files.map(f => [String(f.id ?? pathOf(f)), mark(f)]));
      setSeen(first); writeStore(seenKey(ctx.surfaceId, ctx.componentId), first);
    }
  }, [seen, raw, files, ctx.surfaceId, ctx.componentId]);
  const rows: TreeNode[] = useMemo(() => treeRows(files, expanded, Boolean(o.flat), f => badgesOf(f, holding, agents, seen, shown)),
    [files, expanded, o.flat, holding, agents, seen, [...shown].join()]);
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  useEffect(() => {
    const el = host.current;
    if (el) el.rows = rows.map(r => ({ id: r.id, label: r.label, depth: r.depth, folder: r.folder, expanded: r.expanded, badges: r.badges, selected: r.id === selected }));
  }, [rows, selected]);
  const look = (f: FileRow) => {
    const id = String(f.id ?? pathOf(f));
    setSeen(s => { const next = { ...(s ?? {}), [id]: mark(f) }; writeStore(seenKey(ctx.surfaceId, ctx.componentId), next); return next; });
  };
  const open = (r: TreeNode) => {
    if (!r.file) return;
    setSelected(r.id);
    look(r.file);
    const path = previewPath(ctx.component(o.preview));
    if (path) ctx.set(path, String(r.file.id ?? ''));
  };
  const toggle = (id: string, to: boolean) => {
    const r = byId.get(id);
    if (!r?.folder) return;
    setExpanded(e => { const next = { ...e, [r.path]: to }; writeStore(openKey(ctx.surfaceId, ctx.componentId), next); return next; });
  };
  const upload = (list: FileList | File[], folder = '') => {
    void dropFiles(ctx, list, {
      accept: (Array.isArray(o.accept) ? o.accept : []).map(String), maxBytes: o.maxBytes, multiple: o.multiple !== false,
      attest: o.attest, attested: o.attest && ticked ? o.attest : '', path: folder,
      onState: (name, st) => setStates(s => ({ ...s, [name]: st })),
    });
  };
  // the element's events, bound once per element; each reads the newest state through the ref of handlers
  const handlers = useRef({ open, toggle, upload, setMenu });
  handlers.current = { open, toggle, upload, setMenu };
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const on = (name: string, fn: (d: Record<string, unknown>) => void) => { const l = (e: Event) => fn((e as CustomEvent).detail ?? {}); el.addEventListener(name, l); return () => el.removeEventListener(name, l); };
    const offs = [
      on('tree-activate', d => { const r = byIdRef.current.get(String(d.id)); if (r) handlers.current.open(r); }),
      on('tree-toggle', d => handlers.current.toggle(String(d.id), Boolean(d.expanded))),
      on('tree-menu', d => { if (byIdRef.current.get(String(d.id))?.file) handlers.current.setMenu({ id: String(d.id), x: Number(d.x) || 0, y: Number(d.y) || 0 }); }),
      on('tree-drop', d => {
        const r = byIdRef.current.get(String(d.id ?? ''));
        const folder = !r ? '' : r.folder ? r.path : r.path.split('/').slice(0, -1).join('/');
        if (o.upload) handlers.current.upload(d.files as FileList, folder);
      }),
    ];
    return () => offs.forEach(off => off());
  }, [o.upload]);
  const actions = (Array.isArray(o.actions) ? o.actions : []).map(String).filter(a => a in LABELS);
  const menuFile = menu ? byId.get(menu.id)?.file : undefined;
  const items: MenuItem[] = actions.filter(a => a !== 'ask' || o.chat).map(a => ({ id: a, label: LABELS[a] }));
  const run = (item: MenuItem) => {
    const f = menuFile;
    setMenu(null);
    if (!f) return;
    const id = String(f.id ?? '');
    if (item.id === 'ask' && o.chat) { setSay(attachToChat(ctx.surfaceId, String(o.chat), id) ? `${f.name} is attached to the chat` : 'the chat this tree names is not on the page'); look(f); }
    else if (item.id === 'download') { const url = ctx.fileUrl(f, false); if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener'); }
    else if (item.id === 'share') {
      ctx.dispatch('file.share', { file: id });
      const url = ctx.fileUrl(f, false);
      if (url) void navigator.clipboard?.writeText(url).then(() => setSay('the link is copied; the group can open it'), () => setSay('shared with the group'));
      else setSay('shared with the group');
    } else if (item.id === 'rename' || item.id === 'remove') setAsk({ kind: item.id, file: f });
  };
  const loading = raw === undefined;
  const broken = raw !== undefined && !Array.isArray(raw);
  const label = String(o.label || 'Files');
  return (
    <div className="as-filetree" data-component="FileTree"
      onDragOver={e => { if (o.upload && [...(e.dataTransfer?.types ?? [])].includes('Files')) e.preventDefault(); }}
      onDrop={e => { if (!o.upload || !e.dataTransfer?.files?.length) return; e.preventDefault(); upload(e.dataTransfer.files); }}>
      <div className="as-filetree-head">
        {o.flat ? null : <b className="as-filetree-label">{label}</b>}
        {o.upload ? <>
          <button type="button" className="bma-btn as-filetree-upload" onClick={() => picker.current?.click()}>{o.flat ? label : 'Upload'}</button>
          <input ref={picker} type="file" className="as-visually-hidden" multiple={o.multiple !== false} aria-label={o.flat ? label : 'Upload to ' + label} tabIndex={-1}
            accept={(Array.isArray(o.accept) ? o.accept : []).map(String).join(',') || undefined}
            onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
        </> : null}
      </div>
      {o.notice ? <p className="as-filetree-notice bma-small">{String(o.notice)}</p> : null}
      {o.attest ? <label className="as-filetree-attest bma-small"><input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} /> {String(o.attest)}</label> : null}
      {loading ? <p className="bma-empty" aria-busy="true">Loading files…</p>
        : broken ? <p className="bma-empty" role="note">Unavailable: the files do not read as a list.</p>
        : !files.length ? <p className="bma-empty">No file yet.{o.upload ? ' Upload one, or drop it here.' : ''}</p> : null}
      {createElement('agentspaces-tree', { ref: host, label, class: 'as-tree', hidden: loading || broken || !files.length ? true : undefined })}
      {Object.keys(states).length ? (
        <ul className="as-filetree-states bma-small" aria-live="polite">
          {Object.entries(states).map(([name, st]) => <li key={name} className={'state ' + st.state}><b>{name}</b> {st.state === 'uploading' ? `uploading ${st.percent}%` : st.state === 'refused' ? 'refused: ' + st.reason : st.state}</li>)}
        </ul>
      ) : null}
      {say ? <p className="bma-small" role="status">{say}</p> : null}
      {menu && menuFile && items.length ? (
        <MenuView items={items} label={'Actions for ' + (menuFile.name ?? '')} isChecked={() => false} run={run}
          close={() => { setMenu(null); host.current?.querySelector<HTMLElement>('[role="tree"]')?.focus(); }} at={menu.x || menu.y ? { x: menu.x, y: menu.y } : undefined} />
      ) : null}
      {ask ? <Confirm ask={ask} done={() => { setAsk(null); host.current?.querySelector<HTMLElement>('[role="tree"]')?.focus(); }} ctx={ctx} /> : null}
    </div>
  );
}

/** The two file actions that ask first: a new name for Rename, a yes for Remove. */
function Confirm({ ask, done, ctx }: { ask: { kind: 'rename' | 'remove'; file: FileRow }; done(): void; ctx: Ctx }) {
  const [name, setName] = useState(String(ask.file.name ?? ''));
  const box = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { (box.current ?? first.current)?.focus(); }, []);
  const id = String(ask.file.id ?? '');
  const go = () => {
    if (ask.kind === 'rename') { const n = name.trim(); if (!n || n.includes('/')) return; ctx.dispatch('file.rename', { file: id, name: n }); }
    else ctx.dispatch('file.remove', { file: id });
    done();
  };
  return (
    <div className="as-filetree-ask" role="dialog" aria-modal="false" aria-label={ask.kind === 'rename' ? 'Rename ' + ask.file.name : 'Remove ' + ask.file.name}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); done(); } }}>
      <form onSubmit={e => { e.preventDefault(); go(); }}>
        {ask.kind === 'rename'
          ? <label className="bma-small">New name <input ref={box} value={name} onChange={e => setName(e.target.value)} aria-label="New name" /></label>
          : <span className="bma-small">Remove {ask.file.name} for everyone in the group?</span>}
        <button ref={first} type="submit" className="bma-btn primary">{ask.kind === 'rename' ? 'Rename' : 'Remove'}</button>
        <button type="button" className="bma-btn" onClick={done}>Cancel</button>
      </form>
    </div>
  );
}

export const FileTree = define<FileTreeProps>('FileTree', ({ props, ctx }) => <FileTreeView o={props as TreeOptions} ctx={ctx} />);
