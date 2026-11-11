/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The gallery page of the open renderer: every golden surface of the open catalogs with its code, in the
// default look, light or dark from ?mode=dark or the switch, and the command palette on Ctrl or Cmd and K.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Gallery } from '../frame/Gallery';
import { CommandPalette } from '../frame/CommandPalette';
import { LookAndFeelProvider } from '../look/provider';
import { DEFAULT_LOOK } from '../look/css';
import { validateLook } from '../look/palette';

function Page() {
  const [mode, setMode] = useState<'light' | 'dark'>(() => (new URLSearchParams(location.search).get('mode') === 'dark' ? 'dark' : 'light'));
  const report = validateLook(DEFAULT_LOOK);
  return (
    <LookAndFeelProvider look={DEFAULT_LOOK} mode={mode}>
      <main className="as-gallery-page" data-mode={mode}>
        <header className="as-titlebar">
          <span className="as-titlebar-title" role="heading" aria-level={1}>The open components</span>
          <span className="as-titlebar-subtitle">@agentspaces/a2ui-react, {mode} mode</span>
          <span className="as-titlebar-actions">
            <button type="button" className="bma-btn" onClick={() => setMode(m => (m === 'dark' ? 'light' : 'dark'))}>{mode === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          </span>
        </header>
        <Gallery mode={mode} look={DEFAULT_LOOK} note={`Each golden surface of agentspaces-viz, drawn with the default look. Palette: ${report.ok ? 'passes the six checks' : 'FAILS a check'}. Press Ctrl+K or Cmd+K for the commands.`} />
        <CommandPalette />
      </main>
    </LookAndFeelProvider>
  );
}

createRoot(document.getElementById('gallery')!).render(<StrictMode><Page /></StrictMode>);
