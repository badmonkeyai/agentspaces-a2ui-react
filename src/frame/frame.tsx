/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The page chrome and the TitleBar share one bar: a page provides the frame with its own tools (sign-on,
// Sign out, the mode switch); the first TitleBar drawn claims the bar, shows the tools at its end, and the page then
// draws no bar of its own. A page with no TitleBar keeps its own bar.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface Frame {
  /** The page's tools, drawn at the end of the TitleBar that claims the bar. */
  tools?: ReactNode;
  /** Claims the bar for a TitleBar; returns the release, and whether this one holds it. */
  claim(owner: object): { held: boolean; release(): void };
}

const NO_FRAME: Frame = { claim: () => ({ held: false, release: () => undefined }) };
export const FrameContext = createContext<Frame>(NO_FRAME);

/** The frame a TitleBar reads. */
export function useFrame(): Frame {
  return useContext(FrameContext);
}

/** Holds the bar for one TitleBar at a time; {@code claimed} tells the page whether to draw its own bar. */
export function useFrameProvider(tools: ReactNode): { frame: Frame; claimed: boolean } {
  const holder = useRef<object | null>(null);
  const [claimed, setClaimed] = useState(false);
  const claim = useCallback((owner: object) => {
    if (holder.current && holder.current !== owner) return { held: false, release: () => undefined };
    holder.current = owner;
    setClaimed(true);
    return { held: true, release: () => { if (holder.current === owner) { holder.current = null; setClaimed(false); } } };
  }, []);
  const frame = useMemo(() => ({ tools, claim }), [tools, claim]);
  return { frame, claimed };
}

/** A TitleBar's hold on the bar while it is mounted. */
export function useBarClaim(): { held: boolean; tools?: ReactNode } {
  const frame = useFrame();
  const owner = useRef({});
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const c = frame.claim(owner.current);
    setHeld(c.held);
    return () => c.release();
  }, [frame]);
  return { held, tools: held ? frame.tools : undefined };
}
