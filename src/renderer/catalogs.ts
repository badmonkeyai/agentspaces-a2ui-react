/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The catalogs a surface may name: the A2UI basic catalog is web_core's, and each other catalog is
// the basic components plus its own, since a surface names one catalog and lays its components out with Column and
// Row. This package draws agentspaces-viz; a host registers the components of its own catalogs, and the open
// components it still draws (HOSTED), with registerComponents. A catalog may draw another's components beside its own
// (an old id, such as a platform's alias of agentspaces-viz), named with registerAlias.
import { Catalog, type ComponentApi, type FunctionImplementation } from '@a2ui/web_core/v1_0';
import { basicCatalog } from '@a2ui/web_core/v1_0';
import { OPEN_IMPLEMENTATIONS } from '../generated/registry';
import type { Implementation } from './implementation';

const registered: Record<string, Record<string, Implementation>> = Object.fromEntries(Object.entries(OPEN_IMPLEMENTATIONS).map(([id, impls]) => [id, { ...impls }]));
/**
 * A surface on agentspaces-widgets draws the components of agentspaces-viz beside its own: the
 * application components sit in the open frame, a TitleBar over a Split of a FileTree, a FilePreview and a Chat.
 */
// a surface on agentspaces-geo draws both beside the map: the chat, the file tree and the charts its windows hold
// (srad/agentspaces-geo.md §3.3)
const aliases: Record<string, string[]> = { 'agentspaces-widgets': ['agentspaces-viz'], 'agentspaces-geo': ['agentspaces-viz', 'agentspaces-widgets'] };
let built: Catalog<ComponentApi>[] | undefined;

/** The A2UI basic catalog's id. */
export const BASIC_ID: string = basicCatalog.id;

/** Adds a host's implementations to a catalog (a new one, or an open one whose components it draws); call before the first draw. */
export function registerComponents(catalogId: string, implementations: Record<string, Implementation>): void {
  registered[catalogId] = { ...(registered[catalogId] ?? {}), ...implementations };
  built = undefined;
}

const deviceFunctions: Record<string, FunctionImplementation[]> = {};

/**
 * Adds a host's renderer functions to a catalog (A2UI 1.0's catalog functions): functions that run on the device, such as a
 * formatter or a location. A function a person must start (a location, a photo) says {@code requiresUserActivation} and
 * {@code allowedCallers: 'rendererOnly'}; web_core then runs it only inside an action a person pressed, and refuses it in
 * a binding or a check. The catalog's document declares each function, so the feed lets a surface call it; a function
 * of the same name as a basic one replaces nothing. Call before the first draw.
 */
export function registerFunctions(catalogId: string, functions: readonly FunctionImplementation[]): void {
  const basicFns = new Set([...basicCatalog.functions.keys()]);
  const kept = (deviceFunctions[catalogId] ?? []).filter(f => !functions.some(n => n.name === f.name));
  deviceFunctions[catalogId] = [...kept, ...functions.filter(f => !basicFns.has(f.name))];
  built = undefined;
}

/** Lets a surface on {@code catalogId} draw the components of the catalogs named, beside its own. */
export function registerAlias(catalogId: string, draws: readonly string[]): void {
  aliases[catalogId] = [...new Set([...(aliases[catalogId] ?? []), ...draws])];
  built = undefined;
}

const own = (catalogId: string) => [catalogId, ...(aliases[catalogId] ?? [])];
const basicNames = () => new Set([...basicCatalog.components.keys()]);

/** The catalog instances for a MessageProcessor. */
export function catalogs(): Catalog<ComponentApi>[] {
  if (built) return built;
  const basic = [...basicCatalog.components.values()] as ComponentApi[];
  const functions = [...basicCatalog.functions.values()];
  const ids = [...new Set([...Object.keys(registered), ...Object.keys(aliases), ...Object.keys(deviceFunctions)])];
  const others = ids.map(id => {
    const ours = own(id).flatMap(c => Object.values(registered[c] ?? {})) as unknown as ComponentApi[];
    const names = new Set(ours.map(c => c.name));
    // the basic catalog's functions, and the device functions a host registered for this catalog or one it draws
    const device = own(id).flatMap(c => deviceFunctions[c] ?? []).filter((f, i, all) => all.findIndex(g => g.name === f.name) === i);
    return new Catalog<ComponentApi>(id, basicCatalog.protocolVersion, [...basic.filter(c => !names.has(c.name)), ...ours], [...functions, ...device]);
  });
  built = [basicCatalog as unknown as Catalog<ComponentApi>, ...others];
  return built;
}

/** Whether a surface on the named catalog draws a component: one of the basic catalog's, or one implemented for the catalog or a catalog it draws. */
export function declares(catalogId: string, component: string): boolean {
  return basicNames().has(component) || own(catalogId).some(c => Boolean(registered[c]?.[component]));
}

/**
 * A catalog a surface names that this renderer does not hold, from its document (a feed's /catalogs route): the basic
 * components and functions, as every catalog here carries them, and the document's own schemas and function
 * declarations. Schemas only: a component this renderer does not implement is left out when a surface draws it, and a
 * function the document declares without code here goes to the drawing agent (A2UI 1.0's routing).
 */
export function catalogFromDocument(doc: Record<string, unknown>, catalogId: string): Catalog<ComponentApi> {
  const loaded = Catalog.fromJson(doc, undefined, catalogId);
  const names = basicNames();
  const fnNames = new Set([...basicCatalog.functions.keys()]);
  return new Catalog<ComponentApi>(catalogId, basicCatalog.protocolVersion,
    [...basicCatalog.components.values(), ...[...loaded.components.values()].filter(c => !names.has(c.name))] as ComponentApi[],
    [...basicCatalog.functions.values(), ...[...loaded.functions.values()].filter(f => !fnNames.has(f.name))] as never);
}
