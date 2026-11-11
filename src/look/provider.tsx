/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The look and feel on the tree: a wrapper element carrying the CSS variables, and a context so a chart finds
// the categorical hues in their fixed order without reading the DOM.
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { LookAndFeel, ModeTokens } from '../generated/look';
import { cssVariables, DEFAULT_LOOK, modeTokens } from './css';

export interface LookContextValue { look: LookAndFeel; mode: 'light' | 'dark'; tokens: ModeTokens }
const LookContext = createContext<LookContextValue>({ look: DEFAULT_LOOK, mode: 'light', tokens: DEFAULT_LOOK.tokens });

export function LookAndFeelProvider({ look, mode = 'light', children }: { look?: LookAndFeel; mode?: 'light' | 'dark'; children: ReactNode }) {
  const value = useMemo(() => ({ look: look ?? DEFAULT_LOOK, mode, tokens: modeTokens(look, mode) }), [look, mode]);
  const style = useMemo(() => cssVariables(look, mode) as CSSProperties, [look, mode]);
  return (
    <LookContext.Provider value={value}>
      <div className="bma-look" data-mode={mode} data-look={value.look.id} style={{ ...style, color: value.tokens.color.ink, background: value.tokens.color.surface, fontFamily: 'var(--bma-font-family)' }}>{children}</div>
    </LookContext.Provider>
  );
}

/** The look in force: the tokens of the current mode. */
export function useLook(): LookContextValue {
  return useContext(LookContext);
}
