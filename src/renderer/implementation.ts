/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// How a component is implemented: a React function over its catalog properties and a
// small context onto the surface (read and subscribe to the data model by JSON pointer, dispatch an action, draw a
// child), registered with @a2ui/react as a binderless implementation so the surface, the data model, the validation,
// and the action channel are web_core's and the drawing is ours. Nothing a component receives is ever placed in the
// DOM as markup: React escapes every string, so nothing an agent writes executes.
import { createElement, useEffect, useState, type FC, type ReactNode } from 'react';
import { createBinderlessComponentImplementation, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { ChildListSchema, ComponentIdSchema, DataModel, type ComponentContext } from '@a2ui/web_core/v0_9';
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

function ctxOf(context: ComponentContext, buildChild: (id: string, basePath?: string) => ReactNode): Ctx {
  const model = context.dataContext.dataModel;
  const base = context.dataContext.path;
  const absolute = (path: string) => DataModel.resolvePath(path, base);
  const surfaceOf = () => (context.dataContext.surface as { id?: string } | undefined)?.id ?? '';
  return {
    surfaceId: (context.dataContext.surface as { id?: string } | undefined)?.id ?? '',
    componentId: context.componentModel.id,
    get: <T,>(path: string | undefined) => (path === undefined || path === null || path === '' ? undefined : model.get<T>(absolute(String(path)))),
    set: (path, value) => { model.set(absolute(path), value); },
    subscribe: (path, onChange) => { const s = model.subscribe(absolute(path), onChange); return () => s.unsubscribe(); },
    dispatch: (name, extra) => { if (name) void context.dispatchAction({ event: { name, context: extra ?? {} } }); },
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
  return createBinderlessComponentImplementation(api, ({ context, buildChild }) => {
    const [, bump] = useState(0);
    useEffect(() => {
      const sub = context.componentModel.onUpdated.subscribe(() => bump(n => n + 1));
      return () => sub.unsubscribe();
    }, [context.componentModel]);
    const props = { id: context.componentModel.id, component: context.componentModel.type, ...context.componentModel.properties } as P;
    return createElement(Render, { props, ctx: ctxOf(context, buildChild) });
  });
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
