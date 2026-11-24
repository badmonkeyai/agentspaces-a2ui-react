/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The pick set as a component reads and writes it (srad/agentspaces-geo.md GEO-M-09): inside a GeoLayout the
// layout holds it for every window and the map; outside one it is the map's state path /_geo/<map>/picked on the
// surface. Either way it lives in the browser's memory only: never a space, storage, the URL or an action.
import { useCallback, useMemo } from 'react';
import { useGeoFrame, type PickCause } from '../frame/geo';
import { useData, type Ctx } from '../renderer/implementation';
import { cleanPicks, geoState, MAX_PICKED, pickedWords } from './features';

export interface Picks {
  /** The picked keys, in order, at most eight. */
  picked: readonly string[];
  /**
   * Sets the picked keys, and the words the map says of the change (its own when none are given). By 'data' when the data
   * made the change (a key that left a table's rows, the table's scope changing), never the person: the map then fits
   * nothing, so it stays where the person looks; the default is the person's change, which the map fits once.
   */
  set(keys: readonly string[], said?: string, by?: PickCause): void;
  /** The words said of the last change, a count that tells two equal sayings apart, and whether the data made it. */
  said: { text: string; seq: number; byData?: boolean };
  /** A select table tells which keys its rows hold (nothing when it goes); a watchbox's pick keeps to them. */
  listKeys(source: string, keys: readonly string[] | undefined): void;
  /** The keys the select tables hold, or nothing when none is drawn (outside a GeoLayout, nothing). */
  listed(): ReadonlySet<string> | undefined;
  /** Whether a GeoLayout holds the set. */
  inLayout: boolean;
}

const NO_SAID = { text: '', seq: 0 };

/** The pick set of a map: the GeoLayout's, else the map's state on this surface. */
export function usePicks(ctx: Ctx, map: string | undefined): Picks {
  const frame = useGeoFrame();
  const inLayout = Boolean(frame?.setPicked);
  const paths = geoState(map || '');
  const own = useData<unknown>(ctx, inLayout || !map ? undefined : paths.picked);
  const ownPicked = useMemo(() => cleanPicks(own), [own]);
  const ownSaid = useData<{ text?: unknown; seq?: unknown; byData?: unknown }>(ctx, inLayout || !map ? undefined : paths.pickedSaid);
  const set = useCallback((keys: readonly string[], said?: string, by?: PickCause) => {
    const next = cleanPicks([...keys], MAX_PICKED);
    if (frame?.setPicked) { frame.setPicked(next, said, by); return; }
    if (!map) return;
    const before = ctx.get<{ seq?: number }>(paths.pickedSaid);
    // the words (and who made the change) first: the map reads them when the set itself changes
    ctx.set(paths.pickedSaid, { text: said ?? pickedWords(next), seq: (typeof before?.seq === 'number' ? before.seq : 0) + 1, byData: by === 'data' });
    ctx.set(paths.picked, next);
  }, [frame?.setPicked, map, ctx, paths.picked, paths.pickedSaid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (inLayout && frame) {
    return { picked: frame.picked ?? [], set, said: frame.pickSaid ?? NO_SAID, listKeys: frame.listKeys ?? (() => undefined), listed: frame.listed ?? (() => undefined), inLayout };
  }
  const said = ownSaid && typeof ownSaid.text === 'string' ? { text: ownSaid.text, seq: typeof ownSaid.seq === 'number' ? ownSaid.seq : 0, byData: ownSaid.byData === true } : NO_SAID;
  return { picked: ownPicked, set, said, listKeys: () => undefined, listed: () => undefined, inLayout };
}
