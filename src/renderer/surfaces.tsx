/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The surfaces of one application drawn from A2UI envelopes: a MessageProcessor over the catalogs, fed the
// envelopes as they arrive (an array that grows: only the new ones are processed), one A2uiSurface per surface the
// agent created, every action handed to the host. The look and feel wraps the surfaces as CSS variables.
//
// An action may call one of the drawing agent's functions (A2UI 1.0's functionCall naming a function no catalog runs,
// GEO-V-07). web_core runs a functionCall in the renderer and knows only the catalogs' functions, so such an action is
// rewritten, as it arrives, into an event under a name only this renderer can make: web_core resolves its arguments
// against the data model on the press, and the press becomes 1.0's callAgentFunction, handed to the host to send. The
// agent's agentFunctionResponse arrives among the envelopes and web_core matches it to the call by its functionCallId.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { agentFunctions } from './implementation';
import { A2uiSurface, MarkdownComponentContext, type ReactCatalogComponent } from '@a2ui/react';
import { MessageProcessor, basicCatalog, type SurfaceModel, type ComponentApi } from '@a2ui/web_core/v1_0';
import { catalogFromDocument, catalogs, declares } from './catalogs';
import { loadGeo } from '../components/geo/load';
import { SUPERSEDED } from './envelopes';
import { Markdown } from '../viz/Markdown';
import { LookAndFeelProvider } from '../look/provider';
import type { LookAndFeel } from '../generated/look';

/** A renderer's action as the feed takes it back (the A2UI spec's shape). */
export interface SurfaceActionEvent { name: string; surfaceId: string; sourceComponentId: string; timestamp: string; context: Record<string, unknown> }
export type Envelope = Record<string, unknown>;

/** A call a component made to the agent that draws its surface: A2UI 1.0's callAgentFunction, which the host sends. */
export interface AgentFunctionCall {
  version: '1.0';
  callAgentFunction: { surfaceId: string; functionCallId: string; callFunction: { '@call': string; args?: Record<string, unknown> } };
}
/** What came of a call: the agent's value, or an error (the agent's, TIMEOUT when no answer came in time, or SEND_FAILED). */
export interface AgentFunctionResult {
  surfaceId: string;
  functionCallId: string;
  function: string;
  value?: unknown;
  error?: { code: string; message: string };
}
/** How long a call waits for its answer before the renderer reports it, unless the host says otherwise. */
export const AGENT_FUNCTION_TIMEOUT_MS = 30_000;

export interface SurfacesProps {
  /** The envelopes so far, oldest first; the component processes those it has not seen and passes over SUPERSEDED. */
  envelopes: readonly Envelope[];
  /** Receives every action a person takes on a surface. */
  onAction?: (action: SurfaceActionEvent) => void;
  /** Receives a message the processor refused (the renderer keeps drawing what it accepted). */
  onProblem?: (problem: string) => void;
  /**
   * Sends a component's call to an agent function (POSTs it to the feed); false or a rejection fails the call at once.
   * Without it, a call fails at once and the problem says the page sends no calls.
   */
  onFunctionCall?: (call: AgentFunctionCall) => void | boolean | Promise<void | boolean>;
  /** Receives what came of each call: its value or its error. A call with no answer in time is also a problem. */
  onFunctionResult?: (result: AgentFunctionResult) => void;
  /** How long a call waits for its answer, in milliseconds (AGENT_FUNCTION_TIMEOUT_MS by default). */
  functionTimeoutMs?: number;
  /** The look and feel to draw with, and which mode. */
  look?: LookAndFeel;
  mode?: 'light' | 'dark';
  /** Drawn when no surface exists yet. */
  empty?: ReactNode;
  /**
   * The catalogs the app may draw with (its AppCard's): a surface on any other catalog is refused here, as the feed
   * refuses it, and named in a problem. The basic catalog is always allowed. Absent: any catalog this renderer holds.
   */
  allowedCatalogs?: readonly string[];
  /**
   * Loads the document of a catalog a surface names that this renderer does not hold (a feed's /catalogs route): its
   * schemas and function declarations join the renderer, so the surface's components are checked and the catalog's
   * functions are routed. A document brings no code: a component this renderer does not implement is still left out.
   * The surface's messages wait for it; a catalog that does not load is a problem and its surface is not drawn.
   */
  loadCatalog?: (catalogId: string) => Promise<Record<string, unknown> | undefined>;
}

/** The surface a message is about. */
function surfaceOf(e: Envelope): string {
  for (const v of Object.values(e)) if (v && typeof v === 'object' && typeof (v as { surfaceId?: unknown }).surfaceId === 'string') return (v as { surfaceId: string }).surfaceId;
  return '';
}

export function Surfaces({ envelopes, onAction, onProblem, onFunctionCall, onFunctionResult, functionTimeoutMs, look, mode = 'light', empty, allowedCatalogs, loadCatalog }: SurfacesProps) {
  const allowedRef = useRef(allowedCatalogs);
  allowedRef.current = allowedCatalogs;
  const loadRef = useRef(loadCatalog);
  loadRef.current = loadCatalog;
  // a surface whose catalog is loading holds its messages; a surface on a refused catalog drops them
  const waiting = useRef(new Map<string, Envelope[]>());
  const refusedSurfaces = useRef(new Set<string>());
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onProblemRef = useRef(onProblem);
  onProblemRef.current = onProblem;
  const onFunctionCallRef = useRef(onFunctionCall);
  onFunctionCallRef.current = onFunctionCall;
  const onFunctionResultRef = useRef(onFunctionResult);
  onFunctionResultRef.current = onFunctionResult;
  const timeoutRef = useRef(functionTimeoutMs);
  timeoutRef.current = functionTimeoutMs;
  // the name an agent function's press travels under inside web_core: random per renderer, so no agent's action names it
  const callPrefix = useMemo(() => `\u0000agent-function:${newCallId()}:`, []);
  const processor = useMemo(() => {
    const p: MessageProcessor<ComponentApi> = new MessageProcessor<ComponentApi>(catalogs(), action => {
      const a = action as SurfaceActionEvent;
      if (typeof a.name === 'string' && a.name.startsWith(callPrefix)) { void callAgent(a.surfaceId, a.name.slice(callPrefix.length), a.context).catch(() => undefined); return; }
      onActionRef.current?.(a);
    }, {
      // web_core hands a RendererErrorMessage ({ error: { code, message, surfaceId } }); a page that draws nothing says why (FIT, 2026-11-07)
      errorHandler: e => { const m = e as { error?: { code?: string; message?: string; surfaceId?: string }; message?: string }; onProblemRef.current?.(m.error ? `${m.error.code ?? 'error'}: ${m.error.message ?? ''}${m.error.surfaceId ? ` (surface ${m.error.surfaceId})` : ''}` : String(m.message ?? JSON.stringify(e))); },
      reportErrorsOnly: true,
      // web_core sends 1.0's callAgentFunction here; the host sends it on, and a send that fails fails the call at once
      outboundListener: m => {
        const call = (m as { callAgentFunction?: unknown }).callAgentFunction;
        if (!call) return;   // a renderer function's response: this renderer takes no agent's callRendererFunction
        const send = onFunctionCallRef.current;
        if (!send) throw new Error('this page sends no agent function calls');
        return Promise.resolve(send(m as unknown as AgentFunctionCall)).then(ok => { if (ok === false) throw new Error('the page could not send the call'); });
      },
    });
    /** One call: sent through web_core, its outcome reported to the host, a call with no answer in time a problem. */
    const callAgent = (surfaceId: string, fn: string, args?: Record<string, unknown>): Promise<unknown> => {
      const functionCallId = newCallId();
      const timeoutMs = timeoutRef.current ?? AGENT_FUNCTION_TIMEOUT_MS;
      const call = { '@call': fn, ...(args && Object.keys(args).length ? { args } : {}) };
      return p.callAgentFunction(surfaceId, call as never, { functionCallId, timeoutMs }).then(value => {
        onFunctionResultRef.current?.({ surfaceId, functionCallId, function: fn, value });
        return value;
      }, (err: unknown) => {
        const e = err as { code?: string; message?: string; details?: { message?: string } };
        // web_core's own errors carry a code (TIMEOUT, or the agent's); a send the host refused is a plain Error
        const code = typeof e.code === 'string' && e.code !== 'NO_LISTENER' ? e.code : 'SEND_FAILED';
        const message = e.details?.message ?? String(e.message ?? err).replace(/^\[[^\]]*\]\s*/, '');
        if (code === 'TIMEOUT') onProblemRef.current?.(`the agent function ${fn} on ${surfaceId} got no answer within ${timeoutMs < 1000 ? `${timeoutMs} ms` : `${Math.round(timeoutMs / 100) / 10} s`}`);
        else if (code === 'SEND_FAILED') onProblemRef.current?.(`the agent function ${fn} on ${surfaceId} was not sent: ${message}`);
        onFunctionResultRef.current?.({ surfaceId, functionCallId, function: fn, error: { code, message } });
        throw Object.assign(new Error(message), { code });
      });
    };
    callers.set(p, callAgent);
    return p;
  }, [callPrefix]);
  const [surfaces, setSurfaces] = useState<SurfaceModel<ComponentApi>[]>([]);
  const seen = useRef(0);
  const catalogOf = useRef(new Map<string, string>());
  /**
   * The feed's check again, on the renderer's side: a component outside the surface's catalog is reported and left out.
   * An action that calls an agent function becomes the event web_core resolves and this renderer turns into the call.
   */
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
    }).map(c => withAgentCalls(c, callPrefix));
    return kept.every((c, i) => c === update.components![i]) && kept.length === update.components.length ? e : { ...e, updateComponents: { ...update, components: kept } };
  };
  // each drawn surface's components call its agent's functions through this renderer (ctx.call)
  useEffect(() => {
    const call = callers.get(processor);
    if (!call) return;
    const ids = surfaces.map(s => s.id);
    for (const id of ids) agentFunctions.set(id, (fn, args) => call(id, fn, args));
    return () => { for (const id of ids) agentFunctions.delete(id); };
  }, [surfaces, processor]);
  // the processor in use, so a cleanup can tell an unmount from React's StrictMode, which runs every effect's cleanup and
  // setup again on the same memoized processor in a development build
  const mounted = useRef<object | null>(null);
  useEffect(() => {
    mounted.current = processor;
    const sync = () => setSurfaces([...processor.getSurfaces().values()]);
    const a = processor.onSurfaceCreated(sync);
    const b = processor.onSurfaceDeleted(sync);
    return () => {
      a.unsubscribe(); b.unsubscribe();
      mounted.current = null;
      // disposing rejects the waiting calls and refuses every later one (DISPOSED) for good, so it waits a microtask:
      // StrictMode's setup runs again before then and keeps the processor; an unmount or a new processor does not
      queueMicrotask(() => { if (mounted.current !== processor) processor.dispose(); });
    };
  }, [processor]);
  useEffect(() => {
    if (envelopes.length < seen.current) seen.current = 0;   // a new stream: start over
    const fresh = envelopes.slice(seen.current);
    seen.current = envelopes.length;
    if (fresh.length) {
      const run = (e: Envelope) => { try { processor.processMessages(admit(e) as never); } catch (err) { onProblemRef.current?.(String((err as Error).message ?? err)); } };
      for (const e of fresh) {
        if (e === SUPERSEDED) continue;   // a data write a later one replaced (appendEnvelope)
        const sid = surfaceOf(e);
        const create = (e as { createSurface?: { catalogId?: string } }).createSurface;
        if (create) refusedSurfaces.current.delete(sid);
        const catalogId = create?.catalogId ?? '';
        // the app's catalogs (its AppCard's), as the feed holds them
        const allowed = allowedRef.current;
        if (create && allowed && catalogId && catalogId !== basicCatalog.id && !allowed.includes(catalogId)) {
          refusedSurfaces.current.add(sid);
          onProblemRef.current?.(`surface ${sid} is on the catalog ${catalogId}, which this app does not name (${allowed.join(', ') || 'none'}); it is not drawn`);
          continue;
        }
        if (refusedSurfaces.current.has(sid)) continue;
        const held = waiting.current.get(sid);
        if (held && !create) { held.push(e); continue; }
        // a surface on the geo catalog: start loading its drawings now, so the map is ready when it first draws
        if (catalogId === 'agentspaces-geo') void loadGeo();
        const load = loadRef.current;
        if (create && catalogId && load && !processor.catalogs.some(c => c.id === catalogId)) {
          const queue: Envelope[] = [e];
          waiting.current.set(sid, queue);
          load(catalogId).then(doc => {
            if (!doc) throw new Error('no document');
            if (!processor.catalogs.some(c => c.id === catalogId)) processor.addCatalog(catalogFromDocument(doc, catalogId) as never);
          }).then(() => {
            waiting.current.delete(sid);
            for (const m of queue) run(m);
            setSurfaces([...processor.getSurfaces().values()]);
          }, (err: unknown) => {
            waiting.current.delete(sid);
            refusedSurfaces.current.add(sid);
            onProblemRef.current?.(`the catalog ${catalogId} of surface ${sid} did not load (${String((err as Error)?.message ?? err)}); it is not drawn`);
          });
          continue;
        }
        run(e);
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

/** Each processor's way to call an agent function, for the surfaces it draws. */
const callers = new WeakMap<object, (surfaceId: string, fn: string, args?: Record<string, unknown>) => Promise<unknown>>();

/** A fresh call id: a UUID where the browser makes one, else the time and a random part. */
function newCallId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return typeof c?.randomUUID === 'function' ? c.randomUUID() : `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The functions every catalog runs in the renderer itself: the basic catalog's (1.0's anyFunction). */
const rendererFunctions = (): ReadonlySet<string> => new Set([...basicCatalog.functions.keys()]);

/**
 * A component whose action properties call an agent function, with each such action an event web_core resolves on the
 * press: the event's name the prefix and the function, its context the call's arguments. An action that names a catalog,
 * an @ system function or a renderer function stays web_core's to run. The component itself when nothing changes.
 */
export function withAgentCalls<C extends Record<string, unknown>>(component: C, prefix: string): C {
  let out: C | undefined;
  for (const [key, value] of Object.entries(component)) {
    const call = (value as { functionCall?: { '@call'?: unknown; args?: unknown; catalogId?: unknown } } | null)?.functionCall;
    const fn = call && typeof call === 'object' ? call['@call'] : undefined;
    if (typeof fn !== 'string' || !fn || fn.startsWith('@') || call!.catalogId !== undefined || rendererFunctions().has(fn)) continue;
    const args = call!.args && typeof call!.args === 'object' && !Array.isArray(call!.args) ? call!.args as Record<string, unknown> : {};
    out ??= { ...component };
    (out as Record<string, unknown>)[key] = { event: { name: prefix + fn, context: args } };
  }
  return out ?? component;
}
