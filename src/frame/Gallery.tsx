/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The gallery as a page a customer opens: every golden surface of the open catalogs, each with the
// envelopes that draw it (its data and its code) under "Show the code", in the look and mode the page sets. A frame
// component shows its four states (full, empty, loading, error). The FilePreview goldens read their files from the
// gallery's own small files, since a gallery has no feed.
import { useEffect, type ReactNode } from 'react';
import { fileSources } from '../renderer/implementation';
import { Surfaces, type SurfaceActionEvent } from '../renderer/surfaces';
import { GOLDENS, type GoldenSurface } from '../generated/goldens';
import type { LookAndFeel } from '../generated/look';

export interface GalleryProps {
  look?: LookAndFeel;
  mode: 'light' | 'dark';
  /** The goldens to draw; the open ones by default, a host adds its own. */
  goldens?: readonly GoldenSurface[];
  /** A line over the gallery, such as the palette's verdict. */
  note?: ReactNode;
  onAction?: (action: SurfaceActionEvent) => void;
}

/** A golden's heading: its component, and its state when it has one besides full. */
export function goldenTitle(g: GoldenSurface): string {
  return g.state && g.state !== 'full' ? `${g.name} (${g.state})` : g.name;
}

/** The files the goldens name, by root: what a FilePreview of the gallery draws. */
const GALLERY_FILES: Record<string, string> = {
  'r-q3': 'category,spent,budget\ntravel,1180,1000\nfood,300,400\nrent,900,900\n',
  'r-note': '# Overspend in Q3\n\nTravel ran **18 percent** over its budget.\n',
};

export function Gallery({ look, mode, goldens = GOLDENS, note, onAction }: GalleryProps) {
  useEffect(() => {
    const ids = goldens.filter(g => g.name === 'FilePreview').map(g => g.surfaceId);
    for (const id of ids) fileSources.set(id, { url: () => '', text: async f => { const t = GALLERY_FILES[String(f.root)]; if (t === undefined) throw new Error('the gallery holds no such file'); return t; } });
    return () => { for (const id of ids) fileSources.delete(id); };
  }, [goldens]);
  return (
    <div className="bma-gallery as-gallery">
      {note ? <p className="bma-gallery-note">{note}</p> : null}
      {goldens.map(g => (
        <section key={g.surfaceId} className="bma-gallery-item" data-golden={g.name} data-state={g.state ?? 'full'} aria-label={goldenTitle(g)}>
          <h2>{goldenTitle(g)} <small>{g.catalogId.replace(/^https?:\/\//, '')}</small></h2>
          <Surfaces envelopes={g.envelopes} look={look} mode={mode} onAction={onAction} />
          <details className="as-gallery-code">
            <summary>Show the code</summary>
            <pre><code>{JSON.stringify(g.envelopes, null, 2)}</code></pre>
          </details>
        </section>
      ))}
    </div>
  );
}
