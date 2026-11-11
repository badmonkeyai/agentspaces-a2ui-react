/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// Files as a page meets them (moved into the open package from a platform's widgets): the one
// upload path every drop zone calls (a FileTree's, a Chat's, the FileShare alias's), the size and the refusal in a
// person's words, and the tree a list of SharedFile rows makes, with its badges. Plain functions, no React.
import type { Ctx, UploadAnswer } from '../renderer/implementation';

/** A SharedFile row as a page reads it (version 1 or 2). */
export interface FileRow { id?: string; name?: string; path?: string; mediaType?: string; bytes?: number; root?: string; by?: string; at?: unknown; sha256?: string; replaces?: string; sharedWith?: string[] }

/** A size as people read it: bytes, KiB or MiB, one decimal below ten. */
export function sizeText(n: number): string {
  const f = (v: number) => (v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));
  return n >= 1048576 ? f(n / 1048576) + ' MiB' : n >= 1024 ? f(n / 1024) + ' KiB' : n + (n === 1 ? ' byte' : ' bytes');
}

/** Whether a file matches an accept list: '.json' an extension, 'text/csv' a media type, 'text/*' a family; an empty list takes every file. */
export function accepts(file: { name?: string; type?: string }, accept: readonly string[] | undefined): boolean {
  const list = (accept ?? []).map(a => String(a).trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const name = String(file.name ?? '').toLowerCase(); const type = String(file.type ?? '').toLowerCase();
  return list.some(a => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a));
}

/** The reason a feed gave for a refusal: its JSON `error`, else the status in words. */
export function refusalOf(status: number, body: string): string {
  let why = '';
  try { why = String((JSON.parse(body) as { error?: unknown }).error ?? ''); } catch { why = body; }
  const words: Record<number, string> = { 401: 'sign in first', 403: 'this page may not share files', 413: 'too large', 415: 'not a type this app takes', 422: 'refused', 429: 'too many files at once', 503: 'the feed is busy' };
  return why || words[status] || `refused (${status})`;
}

/** One file's state in a drop. */
export type DropState = { state: 'uploading'; percent: number } | { state: 'shared'; id?: string } | { state: 'sent' } | { state: 'refused'; status: number; reason: string };
export interface DropOptions { accept?: string[]; maxBytes?: number; multiple?: boolean; attest?: string; attested?: string; path?: string; onState?: (name: string, s: DropState) => void }

/**
 * The one upload path: refuses on the page what the feed would refuse anyway (over maxBytes, outside accept, the
 * attestation not given), hands each other file to the surface's uploader with the lawful basis and the folder, and
 * tells each file's state as it goes; a shared file's state carries the id the feed gave it.
 */
export async function dropFiles(ctx: Pick<Ctx, 'upload'>, files: Iterable<File> | ArrayLike<File>, opts: DropOptions = {}): Promise<DropState[]> {
  const all = Array.from(files as ArrayLike<File>);
  const chosen = opts.multiple === false ? all.slice(0, 1) : all;
  const tell = (file: File, s: DropState) => { opts.onState?.(String(file.name || 'file'), s); return s; };
  const max = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 0;
  return Promise.all(chosen.map(async file => {
    if (max && file.size > max) return tell(file, { state: 'refused', status: 413, reason: 'larger than ' + sizeText(max) });
    if (!accepts(file, opts.accept)) return tell(file, { state: 'refused', status: 415, reason: `not a type this app takes (${(opts.accept ?? []).join(', ')})` });
    if (opts.attest && !String(opts.attested ?? '').trim()) return tell(file, { state: 'refused', status: 422, reason: 'tick the box first: ' + opts.attest });
    tell(file, { state: 'uploading', percent: 0 });
    let r: UploadAnswer | false;
    try {
      const path = opts.path ? opts.path.replace(/\/+$/, '') + '/' + file.name : '';
      r = await ctx.upload(file, { attest: opts.attest ? String(opts.attested) : undefined, path: path || undefined,
        onProgress: f => tell(file, { state: 'uploading', percent: Math.max(0, Math.min(100, Math.round(f * 100))) }) });
    } catch (e) {
      return tell(file, { state: 'refused', status: 0, reason: 'the upload did not reach the feed: ' + String((e as Error)?.message ?? e) });
    }
    if (r === false) return tell(file, { state: 'refused', status: 0, reason: 'this page does not share files' });
    if (r.status >= 200 && r.status < 300) {
      let id: string | undefined;
      try { id = String((JSON.parse(r.body || '{}') as { id?: unknown }).id ?? '') || undefined; } catch { id = undefined; }
      return tell(file, { state: 'shared', id });
    }
    return tell(file, { state: 'refused', status: r.status, reason: refusalOf(r.status, r.body) + (r.retryAfter ? `; try again in ${r.retryAfter} s` : '') });
  }));
}

/** A row of the drawn tree: a folder or a file, its depth, and for a file its row. */
export interface TreeNode { id: string; label: string; depth: number; folder: boolean; expanded?: boolean; path: string; file?: FileRow; badges: string[] }

/** A file's path in the tree: its `path`, else its name. */
export const pathOf = (f: FileRow) => String(f.path || f.name || f.id || '');

/**
 * The tree's visible rows from the files: folders from each path's segments, folders before files and each by name, a
 * file another version replaces left out,
 * the children of a folder only while it is open ({@code expanded} holds the closed ones out: a folder is open unless
 * it is named there with false). A flat tree lists every file by name, as FileShare drew.
 */
export function treeRows(all: readonly FileRow[], expanded: Readonly<Record<string, boolean>>, flat: boolean, badges: (f: FileRow) => string[]): TreeNode[] {
  // a renamed file's earlier version (named in a newer one's replaces) is not drawn: the tree shows each file once
  const replaced = new Set(all.map(f => String(f.replaces ?? '')).filter(Boolean));
  const files = all.filter(f => !replaced.has(String(f.id ?? '')));
  if (flat) {
    return [...files].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))).map(f => ({ id: 'f:' + String(f.id ?? pathOf(f)), label: String(f.name || pathOf(f)), depth: 0, folder: false, path: pathOf(f), file: f, badges: badges(f) }));
  }
  interface Dir { dirs: Map<string, Dir>; files: FileRow[] }
  const root: Dir = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = pathOf(f).split('/').filter(Boolean);
    let d = root;
    for (const seg of parts.slice(0, -1)) {
      if (!d.dirs.has(seg)) d.dirs.set(seg, { dirs: new Map(), files: [] });
      d = d.dirs.get(seg)!;
    }
    d.files.push(f);
  }
  const out: TreeNode[] = [];
  const walk = (d: Dir, prefix: string, depth: number) => {
    for (const name of [...d.dirs.keys()].sort((a, b) => a.localeCompare(b))) {
      const path = prefix + name;
      const open = expanded[path] !== false;
      out.push({ id: 'd:' + path, label: name, depth, folder: true, expanded: open, path, badges: [] });
      if (open) walk(d.dirs.get(name)!, path + '/', depth + 1);
    }
    for (const f of [...d.files].sort((a, b) => pathOf(a).localeCompare(pathOf(b)))) {
      const p = pathOf(f);
      out.push({ id: 'f:' + String(f.id ?? p), label: p.split('/').pop() || p, depth, folder: false, path: p, file: f, badges: badges(f) });
    }
  };
  walk(root, '', 0);
  return out;
}

/** What this person has seen of each file (its digest, else its time), so a file new or changed since reads so. */
export type Seen = Record<string, string>;
export const mark = (f: FileRow) => String(f.sha256 || f.at || '');

/** The badges of a file: an agent working on it, written by an agent, new or changed since this person looked. */
export function badgesOf(f: FileRow, working: ReadonlyMap<string, string>, agents: ReadonlySet<string>, seen: Seen | undefined, shown: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const p = pathOf(f);
  if (shown.has('working') && working.has(p)) out.push('working: ' + working.get(p));
  if (shown.has('agent') && f.by && agents.has(String(f.by))) out.push('by ' + f.by);
  const id = String(f.id ?? p);
  if (seen && shown.has('new') && !(id in seen)) out.push('new');
  else if (seen && shown.has('changed') && seen[id] !== mark(f)) out.push('changed');
  return out;
}

/** Parses CSV (RFC 4180: quoted fields, doubled quotes, CRLF or LF), at most {@code limit} rows after the header. */
export function parseCsv(text: string, limit: number): { header: string[]; rows: string[][]; more: boolean } {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let quoted = false; let more = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
      if (rows.length > limit + 1) { more = true; break; }
    } else field += c;
  }
  if (!more && (field || row.length)) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows;
  if (body.length > limit) { body.length = limit; more = true; }
  return { header, rows: body, more };
}
