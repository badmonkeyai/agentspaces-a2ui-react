/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The surfaces of one application drawn from A2UI envelopes: a MessageProcessor over the catalogs, fed the
// envelopes as they arrive (an array that grows: only the new ones are processed), one A2uiSurface per surface the
// agent created, every action handed to the host. The look and feel wraps the surfaces as CSS variables.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { A2uiSurface, MarkdownComponentContext, type ReactCatalogComponent } from '@a2ui/react/v0_9';
import { MessageProcessor, type SurfaceModel, type ComponentApi } from '@a2ui/web_core/v0_9';
import { catalogs, declares } from './catalogs';
import { SUPERSEDED } from './envelopes';
import { Markdown } from '../viz/Markdown';
import { LookAndFeelProvider } from '../look/provider';
import type { LookAndFeel } from '../generated/look';

/** A renderer's action as the feed takes it back (the A2UI spec's shape). */
export interface SurfaceActionEvent { name: string; surfaceId: string; sourceComponentId: string; timestamp: string; context: Record<string, unknown> }
export type Envelope = Record<string, unknown>;

export interface SurfacesProps {
  /** The envelopes so far, oldest first; the component processes those it has not seen and passes over SUPERSEDED. */
  envelopes: readonly Envelope[];
  /** Receives every action a person takes on a surface. */
  onAction?: (action: SurfaceActionEvent) => void;
  /** Receives a message the processor refused (the renderer keeps drawing what it accepted). */
  onProblem?: (problem: string) => void;
  /** The look and feel to draw with, and which mode. */
  look?: LookAndFeel;
  mode?: 'light' | 'dark';
  /** Drawn when no surface exists yet. */
  empty?: ReactNode;
}

export function Surfaces({ envelopes, onAction, onProblem, look, mode = 'light', empty }: SurfacesProps) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onProblemRef = useRef(onProblem);
  onProblemRef.current = onProblem;
  const processor = useMemo(() => new MessageProcessor<ComponentApi>(catalogs(), action => { onActionRef.current?.(action as SurfaceActionEvent); }, {
    // web_core hands a RendererErrorMessage ({ error: { code, message, surfaceId } }); a page that draws nothing says why (FIT, 2026-11-07)
    errorHandler: e => { const m = e as { error?: { code?: string; message?: string; surfaceId?: string }; message?: string }; onProblemRef.current?.(m.error ? `${m.error.code ?? 'error'}: ${m.error.message ?? ''}${m.error.surfaceId ? ` (surface ${m.error.surfaceId})` : ''}` : String(m.message ?? JSON.stringify(e))); },
    reportErrorsOnly: true,
  }), []);
  const [surfaces, setSurfaces] = useState<SurfaceModel<ComponentApi>[]>([]);
  const seen = useRef(0);
  const catalogOf = useRef(new Map<string, string>());
  /** The feed's check again, on the renderer's side: a component outside the surface's catalog is reported and left out. */
  const admit = (e: Envelope): Envelope => {
    const create = e.createSurface as { surfaceId?: string; catalogId?: string } | undefined;
    if (create?.surfaceId) catalogOf.current.set(create.surfaceId, create.catalogId ?? '');
    const update = e.updateComponents as { surfaceId?: string; components?: Array<{ id?: string; component?: string }> } | undefined;
    if (!update?.components) return e;
    const catalogId = catalogOf.current.get(update.surfaceId ?? '') ?? '';
    const kept = update.components.filter(c => {
      const ok = declares(catalogId, String(c.component ?? ''));
      if (!ok) onProblemRef.current?.(`unknown component ${c.component} (${c.id}) for catalog ${catalogId}; left out`);
      return ok;
    });
    return kept.length === update.components.length ? e : { ...e, updateComponents: { ...update, components: kept } };
  };
  useEffect(() => {
    const sync = () => setSurfaces([...processor.getSurfaces().values()]);
    const a = processor.onSurfaceCreated(sync);
    const b = processor.onSurfaceDeleted(sync);
    return () => { a.unsubscribe(); b.unsubscribe(); processor.dispose(); };
  }, [processor]);
  useEffect(() => {
    if (envelopes.length < seen.current) seen.current = 0;   // a new stream: start over
    const fresh = envelopes.slice(seen.current);
    seen.current = envelopes.length;
    if (fresh.length) {
      for (const e of fresh) {
        if (e === SUPERSEDED) continue;   // a data write a later one replaced (appendEnvelope)
        try { processor.processMessages(admit(e) as never); } catch (err) { onProblemRef.current?.(String((err as Error).message ?? err)); }
      }
      setSurfaces([...processor.getSurfaces().values()]);
    }
  }, [envelopes, processor]);
  return (
    <LookAndFeelProvider look={look} mode={mode}>
      <MarkdownComponentContext.Provider value={Markdown}>
        <div className="bma-surfaces">
          {surfaces.length === 0 && (empty ?? <div className="bma-empty">No surface yet: nothing from createSurface onwards.</div>)}
          {surfaces.map(s => <section key={s.id} className="bma-surface" data-surface-id={s.id}><A2uiSurface surface={s as unknown as SurfaceModel<ReactCatalogComponent>} /></section>)}
        </div>
      </MarkdownComponentContext.Provider>
    </LookAndFeelProvider>
  );
}
