/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// How the components of one surface hand each other a file: a FileTree's "Ask about this
// file" attaches the file to the Chat it names, and a chip opens a file in a FilePreview through the data model path
// that preview reads. View state in the browser alone: the fabric carries none of it.

type Listener = (fileId: string) => void;
const listeners = new Map<string, Set<Listener>>();
const keyOf = (surfaceId: string, componentId: string) => surfaceId + '\u0000' + componentId;

/** Attaches a file to a chat of the surface; false when no such chat listens. */
export function attachToChat(surfaceId: string, chatId: string, fileId: string): boolean {
  const set = listeners.get(keyOf(surfaceId, chatId));
  if (!set || !set.size) return false;
  for (const l of set) l(fileId);
  return true;
}

/** A chat hears the files handed to it; returns the stop. */
export function onAttach(surfaceId: string, chatId: string, listener: Listener): () => void {
  const k = keyOf(surfaceId, chatId);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(listener);
  return () => { listeners.get(k)?.delete(listener); };
}

/** The data model path a FilePreview reads its file from, when its `file` is a path; else empty. */
export function previewPath(props: Record<string, unknown> | undefined): string {
  const f = props?.file;
  return f && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string' ? String((f as { path: string }).path) : '';
}
