/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The page's commands: each TitleBar action and each Menu item a page draws, while it is drawn, for the
// command palette to offer. View state only: nothing here reaches the fabric.
import { useEffect } from 'react';

export interface Command { id: string; label: string; where: string; shortcut?: string; disabled?: boolean; run(): void }

const sources = new Map<object, () => Command[]>();
const listeners = new Set<() => void>();

/** Every command the page offers now, in the order the components registered. */
export function commands(): Command[] {
  return [...sources.values()].flatMap(f => f()).filter(c => !c.disabled);
}

/** Calls back when the commands change; returns the unsubscribe. */
export function onCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Offers a component's commands while it is mounted; {@code list} is read when the palette opens. */
export function useCommands(owner: object, list: () => Command[], deps: readonly unknown[]): void {
  useEffect(() => {
    sources.set(owner, list);
    listeners.forEach(l => l());
    return () => { sources.delete(owner); listeners.forEach(l => l()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
