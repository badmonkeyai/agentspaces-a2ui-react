/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// How a component is implemented: a React function over its catalog properties and a
// small context onto the surface (read and subscribe to the data model by JSON pointer, dispatch an action, draw a
// child), registered with @a2ui/react as a binderless implementation so the surface, the data model, the validation,
// and the action channel are web_core's and the drawing is ours. Nothing a component receives is ever placed in the
// DOM as markup: React escapes every string, so nothing an agent writes executes.
import { Fragment, createElement, useEffect, useState, type FC, type ReactNode } from 'react';
import { createBinderlessComponentImplementation, type ReactComponentImplementation } from '@a2ui/react';
import { ChildListSchema, ComponentIdSchema, DataModel, type ComponentContext } from '@a2ui/web_core/v1_0';
import { z } from 'zod';

export type Implementation = ReactComponentImplementation;

/** What a component may do with its surface. */
export interface Ctx {
  /** The surface's id and the component's id. */
  surfaceId: string;
  componentId: string;
  /** A value of the data model at a pointer (relative pointers resolve against the component's scope). */
  get<T = unknown>(path: string | undefined): T | undefined;
  /** Writes a value into the data model at a pointer (a form's field, a table's sort). */
  set(path: string, value: unknown): void;
  /** Subscribes to a pointer; returns the unsubscribe. */
  subscribe(path: string, onChange: (value: unknown) => void): () => void;
  /** Dispatches a named action with its context; the host posts it back as a SurfaceAction. */
  dispatch(name: string | undefined, context?: Record<string, unknown>): void;
  /**
   * Calls one of the drawing agent's functions (A2UI 1.0's callAgentFunction) with literal arguments and resolves with
   * its answer; rejects with the agent's error, when no answer comes in time, or when the page sends no calls.
   */
  call(fn: string, args?: Record<string, unknown>): Promise<unknown>;
  /**
   * Hands a file to the page's uploader for this surface (the feed's upload route) with the lawful basis and a progress
   * callback; the feed's answer, or false when the page has none.
   */
  upload(file: File, opts?: UploadOptions): Promise<UploadAnswer | false>;
  /**
   * Where a shared file's bytes are, for a link (download) or for a preview (view); empty when the page has no feed.
   */
  fileUrl(file: FileRef, view?: boolean): string;
  /** A shared file's text for a preview: the page's file source, or a fetch of its view URL; refused when neither answers. */
  fileText(file: FileRef): Promise<string>;
  /** The properties of another component of the surface (a FileTree finds where its FilePreview reads its file). */
  component(id: string | undefined): Record<string, unknown> | undefined;
  /** Draws a child component by id. */
  child(id: string | undefined): ReactNode;
  /** Whether the surface holds a component of that id (a design that names a missing child says so). */
  has(id: string | undefined): boolean;
  /**
   * @a2ui/react 0.16: give it to the element a person operates (an input), and the component's `@accessibility` label and
   * description name that element, with `aria-invalid` while a check fails. Without it, the host element is labelled as a
   * group around the component.
   */
  accessibilityRef?: (element: Element | null) => void;
  /** @a2ui/react 0.16: give it to the element that shows validation errors; the {@link accessibilityRef} element is described by it. */
  validationErrorsRef?: (element: Element | null) => void;
}

/** What a drop hands the uploader beside the file: the lawful basis to send as X-Attest, progress from 0 to 1, and its path in the tree. */
export interface UploadOptions { attest?: string; onProgress?: (fraction: number) => void; /** where in the app's tree the file lands (SharedFile v2 path) */ path?: string }
/** The feed's answer to an upload: its status, its body (the JSON error of a refusal), and Retry-After in seconds. */
export interface UploadAnswer { status: number; body: string; retryAfter?: number }
/** The page registers how a surface uploads (a published page shares files through the feed); keyed by surface id. */
export const uploaders = new Map<string, (file: File, opts?: UploadOptions) => Promise<UploadAnswer | void>>();

/** A shared file as a link or a preview needs it: its id, its root on the content swarm, its name and media type. */
export interface FileRef { id?: string; root?: string; name?: string; mediaType?: string }
/**
 * Where a surface's shared files are: the URL of a file's bytes, for a download or for a
 * preview, and, when the page has its own way, the text of a file; keyed by surface id like {@link uploaders}.
 */
export interface FileSource { url(file: FileRef, view: boolean): string; text?(file: FileRef): Promise<string> }
export const fileSources = new Map<string, FileSource>();
/** How a surface calls its agent's functions, keyed by surface id: set by Surfaces while the surface is drawn. */
export const agentFunctions = new Map<string, (fn: string, args?: Record<string, unknown>) => Promise<unknown>>();

/**
 * The page's own state (srad/agentspaces-geo.md GEO-D-12): a data model path under {@link PAGE_PATH} is the page's, not
 * the surface's, so every surface the page draws reads and writes the same value there: a heatmap's selected in one
 * window filters a GeoMap layer and a DataTable drawn by others (the windows of a GeoLayout are surfaces of their own). It
 * lives in the browser's memory only, as the pick set does: never a space, storage, the URL or an action, and a reload
 * empties it.
 */
export const PAGE_PATH = '/_page/';
let pageRoot: Record<string, unknown> = {};
const pageListeners = new Map<string, Set<(v: unknown) => void>>();
const pageParts = (path: string) => path.split('/').filter(Boolean).map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
/** The page's value at a pointer under {@link PAGE_PATH}. */
export function pageGet<T = unknown>(path: string): T | undefined {
  let v: unknown = pageRoot;
  for (const k of pageParts(path)) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v as T | undefined;
}
/** Writes the page's value at a pointer under {@link PAGE_PATH}, and tells every surface that reads it, or a part of it. */
export function pageSet(path: string, value: unknown): void {
  const parts = pageParts(path);
  if (!parts.length) return;
  const next: Record<string, unknown> = { ...pageRoot };
  let at = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const was = at[parts[i]];
    const copy = was && typeof was === 'object' && !Array.isArray(was) ? { ...(was as Record<string, unknown>) } : {};
    at[parts[i]] = copy;
    at = copy;
  }
  if (value === undefined) delete at[parts[parts.length - 1]];
  else at[parts[parts.length - 1]] = value;
  pageRoot = next;
  for (const [p, fns] of [...pageListeners]) {
    if (p === path || p.startsWith(path + '/') || path.startsWith(p + '/')) for (const fn of [...fns]) fn(pageGet(p));
  }
}
function pageSubscribe(path: string, onChange: (v: unknown) => void): () => void {
  const fns = pageListeners.get(path) ?? new Set<(v: unknown) => void>();
  fns.add(onChange);
  pageListeners.set(path, fns);
  return () => { fns.delete(onChange); if (!fns.size) pageListeners.delete(path); };
}
/** Empties the page's state (a test's fresh page). */
export function resetPageState(): void {
  pageRoot = {};
  for (const [p, fns] of [...pageListeners]) for (const fn of [...fns]) fn(pageGet(p));
}
const onPage = (path: string) => path === PAGE_PATH.slice(0, -1) || path.startsWith(PAGE_PATH);

type A11yRefs = Pick<Ctx, 'accessibilityRef' | 'validationErrorsRef'>;

function ctxOf(context: ComponentContext, buildChild: (id: string, basePath?: string) => ReactNode, refs: A11yRefs = {}): Ctx {
  const model = context.dataContext.dataModel;
  const base = context.dataContext.path;
  const absolute = (path: string) => DataModel.resolvePath(path, base);
  const surfaceOf = () => (context.dataContext.surface as { id?: string } | undefined)?.id ?? '';
  return {
    surfaceId: (context.dataContext.surface as { id?: string } | undefined)?.id ?? '',
    componentId: context.componentModel.id,
    get: <T,>(path: string | undefined) => {
      if (path === undefined || path === null || path === '') return undefined;
      const at = absolute(String(path));
      return onPage(at) ? pageGet<T>(at) : model.get<T>(at);
    },
    set: (path, value) => { const at = absolute(path); if (onPage(at)) pageSet(at, value); else model.set(at, value); },
    subscribe: (path, onChange) => {
      const at = absolute(path);
      if (onPage(at)) return pageSubscribe(at, onChange);
      const s = model.subscribe(at, onChange);
      return () => s.unsubscribe();
    },
    dispatch: (name, extra) => { if (name) void context.dispatchAction({ event: { name, context: extra ?? {} } }); },
    call: (fn, args) => {
      const caller = agentFunctions.get(surfaceOf());
      return caller ? caller(fn, args) : Promise.reject(new Error('this page sends no agent function calls'));
    },
    upload: async (file, opts) => {
      const up = uploaders.get((context.dataContext.surface as { id?: string } | undefined)?.id ?? '');
      if (!up) return false;
      return (await up(file, opts)) ?? { status: 202, body: '' };
    },
    fileUrl: (file, view = false) => fileSources.get(surfaceOf())?.url(file, view) ?? '',
    fileText: async file => {
      const source = fileSources.get(surfaceOf());
      if (source?.text) return source.text(file);
      const url = source?.url(file, true) ?? '';
      if (!url) throw new Error('this page reads no file');
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status === 413 ? 'too large to preview' : `the feed answered ${r.status}`);
      return r.text();
    },
    component: id => {
      const c = id ? (context.dataContext.surface as { componentsModel?: { get(id: string): { properties?: Record<string, unknown> } | undefined } } | undefined)?.componentsModel?.get(id) : undefined;
      return c?.properties;
    },
    child: id => (id ? buildChild(id) : null),
    has: id => Boolean(id && (context.dataContext.surface as { componentsModel?: { get(id: string): unknown } } | undefined)?.componentsModel?.get(id)),
    accessibilityRef: refs.accessibilityRef,
    validationErrorsRef: refs.validationErrorsRef,
  };
}

/** The props a component receives: its catalog properties as the agent wrote them, and the context. */
export interface ComponentProps<P> { props: P; ctx: Ctx }

/**
 * Defines a component: the catalog name, the React function that draws it, the names of the properties that reference
 * one child component, those that reference a list of them, and the lists of objects whose keys reference one child each. The schema is open otherwise: the feed validated the component against its
 * catalog before it reached a renderer, and the drawing tolerates what it does not know.
 */
export function define<P extends { id: string; component: string }>(name: string, Render: FC<ComponentProps<P>>, children: readonly string[] = [], childLists: readonly string[] = [],
  nested: Readonly<Record<string, readonly string[]>> = {}): Implementation {
  // a property that names a child component (or a list of them) is marked as a child reference (web_core
  // instantiates a component only where a reference points at it; without the mark a Window's child would not exist
  // to draw)
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of children) shape[c] = ComponentIdSchema.optional();
  for (const c of childLists) shape[c] = ChildListSchema.optional();
  // a list of objects whose named keys reference one child each (a Split's panes): web_core walks it as nested references
  for (const [list, keys] of Object.entries(nested)) shape[list] = z.array(z.object(Object.fromEntries(keys.map(k => [k, ComponentIdSchema.optional()]))).passthrough()).optional();
  const api = { name, schema: z.object(shape).passthrough() };
  return createBinderlessComponentImplementation(api, ({ context, buildChild, accessibilityRef, validationErrorsRef }) => {
    const [, bump] = useState(0);
    useEffect(() => {
      const sub = context.componentModel.onUpdated.subscribe(() => bump(n => n + 1));
      return () => sub.unsubscribe();
    }, [context.componentModel]);
    const props = { id: context.componentModel.id, component: context.componentModel.type, ...context.componentModel.properties } as P;
    // 1.0's envelope keys (@accessibility, @metadata) are web_core's, on the component model, not among its properties
    const ctx = ctxOf(context, buildChild, { accessibilityRef, validationErrorsRef });
    const drawn = createElement(Render, { props, ctx });
    const skeleton = skeletonOf(context.componentModel.metadata);
    return skeleton ? createElement(Skeleton, { kind: skeleton, ctx }, drawn) : drawn;
  });
}

/** The kinds of skeleton a component may declare; any other word draws the plain block. */
export const SKELETONS = ['text', 'rows', 'card', 'chart'] as const;

/**
 * A component's declared skeleton (A2UI 1.0 @metadata, extension {@code skeleton}): the shape shown in its place until
 * the surface's data arrives, so a page streaming its first data shows where things will be rather than empty words.
 */
export function skeletonOf(metadata: { extensions?: Readonly<Record<string, unknown>> } | undefined): string | undefined {
  const k = metadata?.extensions?.skeleton;
  return typeof k === 'string' && k ? k : undefined;
}

/** The skeleton until the surface's data has arrived, then the component; busy and named "Loading" meanwhile. */
function Skeleton({ kind, ctx, children }: { kind: string; ctx: Ctx; children?: ReactNode }) {
  const arrived = useArrived(ctx);
  if (arrived) return createElement(Fragment, null, children);
  const shape = (SKELETONS as readonly string[]).includes(kind) ? kind : 'block';
  const bars = shape === 'rows' ? 4 : shape === 'text' ? 2 : 1;
  return createElement('div', { className: `as-skeleton as-skeleton-${shape}`, 'aria-busy': 'true', role: 'status', 'data-skeleton': shape },
    createElement('span', { className: 'as-visually-hidden' }, 'Loading'),
    ...Array.from({ length: bars }, (_, i) => createElement('span', { key: i, className: 'bar', 'aria-hidden': 'true' })));
}

/** A value of the data model at a pointer, re-rendered when it changes. */
export function useData<T = unknown>(ctx: Ctx, path: string | undefined): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => ctx.get<T>(path));
  useEffect(() => {
    if (!path) return;
    setValue(ctx.get<T>(path));
    return ctx.subscribe(path, v => setValue(v as T | undefined));
  }, [ctx, path]);
  return value;
}

/**
 * Whether the surface's data has arrived: its data model holds a value of its own (a key that does not start with _, the
 * renderer's own state such as /_geo). A feed writes every binding of a page in its first write, so once the data has
 * arrived a path that holds nothing has no binding, or none that answered: a list there shows its empty words, not a
 * busy one that never ends.
 */
export function useArrived(ctx: Ctx): boolean {
  const read = () => { const root = ctx.get<Record<string, unknown>>('/'); return Boolean(root && typeof root === 'object' && Object.keys(root).some(k => !k.startsWith('_'))); };
  const [arrived, setArrived] = useState<boolean>(read);
  useEffect(() => {
    if (arrived) return undefined;
    if (read()) { setArrived(true); return undefined; }
    return ctx.subscribe('/', () => { if (read()) setArrived(true); });
  }, [ctx, arrived]); // eslint-disable-line react-hooks/exhaustive-deps
  return arrived;
}

/** The rows at a pointer as an array (an object's values when it is a map, nothing when it is absent). */
export function useRows<T = Record<string, unknown>>(ctx: Ctx, path: string | undefined): T[] {
  const v = useData<unknown>(ctx, path);
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') return Object.values(v as Record<string, T>);
  return [];
}

/** A number for a display: integers as they are, others with two decimals at most. */
export function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  return String(v);
}
