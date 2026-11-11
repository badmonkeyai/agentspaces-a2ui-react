/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The envelope log a page keeps for Surfaces. An agent that draws live data writes the same paths again and again (the
// geo watch's units, a few times a second), and a log that kept every write held them all: an hour of the geo page
// grew its heap from 8.8 to 16.7 MiB. A data write replaces the value at its path and everything below it, so the log
// keeps a slot for each envelope (Surfaces counts the envelopes it has seen) and puts SUPERSEDED in the slots of the
// writes a later one covers, which Surfaces passes over.
import type { Envelope } from './surfaces';

/** Stands in the log for a data write a later one replaced; Surfaces passes over it. */
export const SUPERSEDED: Envelope = Object.freeze({});

interface DataWrite { surfaceId?: string; path?: string }

/** '/' and no path name the whole model; a trailing slash names the same place as none. */
const place = (path: string | undefined): string => (path ?? '').replace(/\/+$/, '');

/** True when a write at {@code later} replaces what a write at {@code earlier} set: the same place or one above it. */
const covers = (later: string, earlier: string): boolean => later === '' || earlier === later || earlier.startsWith(later + '/');

/**
 * The log with {@code envelope} appended, as a new array: an earlier data write of the same surface at the envelope's
 * path or below it becomes SUPERSEDED. Any other envelope (createSurface, updateComponents, deleteSurface) is kept.
 */
export function appendEnvelope(log: readonly Envelope[], envelope: Envelope): Envelope[] {
  const next = [...log, envelope];
  const write = envelope.updateDataModel as DataWrite | undefined;
  if (!write) return next;
  const at = place(write.path);
  for (let i = next.length - 2; i >= 0; i--) {
    const earlier = next[i].updateDataModel as DataWrite | undefined;
    if (earlier && earlier.surfaceId === write.surfaceId && covers(at, place(earlier.path))) next[i] = SUPERSEDED;
  }
  return next;
}
