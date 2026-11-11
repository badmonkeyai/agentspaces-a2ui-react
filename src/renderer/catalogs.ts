/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The catalogs a surface may name: the A2UI basic catalog is web_core's, and each other catalog is
// the basic components plus its own, since a surface names one catalog and lays its components out with Column and
// Row. This package draws agentspaces-viz; a host registers the components of its own catalogs, and the open
// components it still draws (HOSTED), with registerComponents. A catalog may draw another's components beside its own
// (an old id, such as a platform's alias of agentspaces-viz), named with registerAlias.
import { Catalog, type ComponentApi } from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/web_core/v0_9/basic_catalog';
import { OPEN_IMPLEMENTATIONS } from '../generated/registry';
import type { Implementation } from './implementation';

const registered: Record<string, Record<string, Implementation>> = Object.fromEntries(Object.entries(OPEN_IMPLEMENTATIONS).map(([id, impls]) => [id, { ...impls }]));
/**
 * A surface on agentspaces-widgets draws the components of agentspaces-viz beside its own: the
 * application components sit in the open frame, a TitleBar over a Split of a FileTree, a FilePreview and a Chat.
 */
const aliases: Record<string, string[]> = { 'agentspaces-widgets': ['agentspaces-viz'] };
let built: Catalog<ComponentApi>[] | undefined;

/** The A2UI basic catalog's id. */
export const BASIC_ID: string = basicCatalog.id;

/** Adds a host's implementations to a catalog (a new one, or an open one whose components it draws); call before the first draw. */
export function registerComponents(catalogId: string, implementations: Record<string, Implementation>): void {
  registered[catalogId] = { ...(registered[catalogId] ?? {}), ...implementations };
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
  const ids = [...new Set([...Object.keys(registered), ...Object.keys(aliases)])];
  const others = ids.map(id => {
    const ours = own(id).flatMap(c => Object.values(registered[c] ?? {})) as unknown as ComponentApi[];
    const names = new Set(ours.map(c => c.name));
    return new Catalog<ComponentApi>(id, basicCatalog.protocolVersion, [...basic.filter(c => !names.has(c.name)), ...ours], functions);
  });
  built = [basicCatalog as unknown as Catalog<ComponentApi>, ...others];
  return built;
}

/** Whether a surface on the named catalog draws a component: one of the basic catalog's, or one implemented for the catalog or a catalog it draws. */
export function declares(catalogId: string, component: string): boolean {
  return basicNames().has(component) || own(catalogId).some(c => Boolean(registered[c]?.[component]));
}
