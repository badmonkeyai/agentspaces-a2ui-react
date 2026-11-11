/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The thread of a chat (moved into the open package from a platform's widgets): when each line was
// written and how its time reads in the viewer's zone, the order of a thread, the visitor's own thread and its secret,
// and the progress of a line from its ChatProgress in the A2A task words. Plain functions, no React,
// so a page, a custom element and a test share them.

/** A chat line as a page reads it: the ChatMessage fields (version 1 or 2), and the `_at` a feed's row adds. */
export interface ChatLine {
  id?: unknown; key?: unknown; from?: { kind?: unknown; name?: unknown }; text?: unknown; attachments?: unknown; inReplyTo?: unknown;
  at?: unknown; _at?: unknown; format?: unknown; cites?: unknown;
}

/** When a line was written, in milliseconds: its `at` (an ISO string, or the epoch seconds a feed's row carries), else `_at`; NaN when neither reads. */
export function chatWhen(m: ChatLine | undefined): number {
  const v = m && m.at !== undefined && m.at !== null && m.at !== '' ? m.at : m?._at;
  return typeof v === 'number' ? v * 1000 : Date.parse(String(v ?? ''));
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A line's time in the viewer's own zone, 'HH:MM' (':SS' when asked), after its local day when that is not today at `now`; empty when it does not read. */
export function chatTime(m: ChatLine, seconds = false, now = Date.now()): string {
  const ms = chatWhen(m);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  const day = localDay(d);
  return (day === localDay(new Date(now)) ? '' : day + ' ') + pad(d.getHours()) + ':' + pad(d.getMinutes()) + (seconds ? ':' + pad(d.getSeconds()) : '');
}

/** The thread in order: by time, then the reply-to chain (a reply after the line it answers), then id; a line whose time does not read goes last. A new array. */
export function chatOrder<T extends ChatLine>(lines: readonly T[]): T[] {
  const byId = new Map(lines.map(m => [String(m.id ?? ''), m]));
  const depth = (m: T) => { let d = 0; const seen = new Set<T>(); for (let p: T | undefined = m; p && p.inReplyTo && !seen.has(p); p = byId.get(String(p.inReplyTo))) { seen.add(p); d++; } return d; };
  const rows = lines.map((m, i) => ({ m, i, t: chatWhen(m), d: depth(m), id: String(m.id ?? '') }));
  const late = (r: { t: number }) => (Number.isNaN(r.t) ? 1 : 0);
  rows.sort((a, b) => (late(a) || late(b) ? (late(a) - late(b)) || (a.i - b.i)
    : (a.t - b.t) || (a.d - b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.i - b.i)));
  return rows.map(r => r.m);
}

// SHA-256 (FIPS 180-4), synchronous, so a thread draws in one pass and a page on plain HTTP (no crypto.subtle) works.
const K: number[] = []; const H: number[] = [];
for (let n = 2; K.length < 64; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
  if (!prime) continue;
  if (H.length < 8) H.push((Math.pow(n, 1 / 2) % 1) * 4294967296 | 0);
  K.push((Math.pow(n, 1 / 3) % 1) * 4294967296 | 0);
}
/** The SHA-256 of a string's UTF-8 bytes, as hex. */
export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(String(text));
  const size = ((bytes.length + 9 + 63) >> 6) << 6;
  const msg = new Uint8Array(size); msg.set(bytes); msg[bytes.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(size - 8, Math.floor(bytes.length / 536870912)); view.setUint32(size - 4, (bytes.length * 8) >>> 0);
  const h = H.slice(); const w = new Int32Array(64); const rot = (x: number, r: number) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < size; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(o + i * 4);
    for (let i = 16; i < 64; i++) w[i] = (w[i - 16] + (rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10))) | 0;
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, k].forEach((x, i) => { h[i] = (h[i] + x) | 0; });
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/** The name of a visitor's thread: the first 32 hex digits of the SHA-256 of the visitor's secret, as a feed names it. The page's data carries this, never the secret. */
export function chatDigest(secret: string): string {
  return sha256(secret).slice(0, 32);
}

/** Where this browser keeps its chat secret. */
export const SECRET_KEY = 'agentspaces-chat-secret';
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;
let memorySecret = '';
const newSecret = () => [...globalThis.crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');

/** This browser's chat secret: 32 random bytes as hex in local storage (in memory where it refuses), sent with each line as `secret`. */
export function chatSecret(): string {
  try {
    const store = window.localStorage;
    let secret = store.getItem(SECRET_KEY) || '';
    if (!SECRET.test(secret)) { secret = newSecret(); store.setItem(SECRET_KEY, secret); }
    return secret;
  } catch {
    if (!memorySecret) memorySecret = newSecret();
    return memorySecret;
  }
}

/**
 * The lines one visitor sees. With a key: the key's lines and the visitor's own thread (`<key>:<me>`). With none (a
 * page that draws every thread): every thread except another visitor's, a thread a feed wrote a line into under the
 * author `visitor`. A new array, in the order given.
 */
export function chatThread<T extends ChatLine>(lines: readonly T[], key: string, me: string): T[] {
  const mine = (key || 'main') + ':' + me;
  const others = new Set(lines.filter(m => m.from?.kind !== 'agent' && m.from?.name === 'visitor' && m.key !== mine).map(m => m.key));
  return lines.filter(m => (key ? m.key === key || m.key === mine : !others.has(m.key)));
}

/** One step an agent took on a line: what it read, the tool it called, what it wrote. */
export interface Step { label?: unknown; kind?: unknown; ref?: unknown; at?: unknown }
/** A ChatProgress row as a page reads it. */
export interface Progress { id?: unknown; key?: unknown; inReplyTo?: unknown; agent?: unknown; state?: unknown; steps?: unknown; at?: unknown }

/** The A2A task states (A2A specification, TaskState), in the order the records name them. */
export const TASK_STATES = ['submitted', 'working', 'input-required', 'completed', 'failed', 'canceled'] as const;
export type TaskState = typeof TASK_STATES[number];

/** The steps of a progress row, at most twenty, each with its words. */
export function stepsOf(p: Progress | undefined): Array<{ label: string; kind: string; ref: string }> {
  const steps = Array.isArray(p?.steps) ? (p!.steps as Step[]) : [];
  return steps.slice(0, 20).map(s => ({ label: String(s.label ?? ''), kind: String(s.kind ?? ''), ref: String(s.ref ?? '') }));
}

/**
 * The progress line of a person's line in the A2A words: "submitted", "working: <the last step>", "needs your input",
 * and nothing once the answer is in (completed) or the agent gave up (failed and canceled say so themselves).
 */
export function progressWords(p: Progress | undefined): string {
  const state = String(p?.state ?? '');
  const steps = stepsOf(p);
  switch (state) {
    case 'submitted': return 'submitted';
    case 'working': return steps.length ? 'working: ' + steps[steps.length - 1].label : 'working';
    case 'input-required': return 'needs your input';
    case 'failed': return 'The agent stopped';
    case 'canceled': return 'stopped at your request';
    default: return '';
  }
}

/**
 * What a person's line waits on: `answered` once an agent's line replies to it; else its progress row's state; else
 * `stopped` when a progress row was seen working and has lapsed with no answer (the agent went away
 * mid-answer), else `waiting`.
 */
export function lineState(line: ChatLine, lines: readonly ChatLine[], progress: Progress | undefined, seenWorking: boolean):
  'answered' | 'stopped' | 'waiting' | TaskState {
  const id = String(line.id ?? '');
  if (id && lines.some(l => l.from?.kind === 'agent' && String(l.inReplyTo ?? '') === id)) return 'answered';
  if (progress) {
    const s = String(progress.state ?? '');
    if ((TASK_STATES as readonly string[]).includes(s)) return s as TaskState;
  }
  return seenWorking ? 'stopped' : 'waiting';
}
