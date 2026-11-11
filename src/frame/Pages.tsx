/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The surfaces of one app as a page, from the Publish's options:
//   navigation  { kind: tabs | rail, pages: [{ page, title, icon }] } draws the named surfaces as pages a person moves
//               between, the current page in the URL fragment (#page=<id>); a surface it does not name stays below
//   layout      { kind: split, panes: [{ page, size, min, collapsible }] } places whole surfaces in the panes of a split
// A layout takes the page when both are set. With neither, the surfaces stack, as they did before these options. Every surface stays
// mounted, so a page a person left keeps its stream, its drafts and its place.
import { createElement, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { defineSplit } from '../elements/split';
import { Icon } from './icons';

export interface NavPage { page: string; title?: string; icon?: string }
export interface Navigation { kind: 'tabs' | 'rail'; pages: NavPage[] }
export interface LayoutPane { page: string; size: number; min?: number; collapsible?: boolean }
export interface Layout { kind: 'split'; panes: LayoutPane[] }

export interface PagesProps {
  /** The surfaces in the Publish's order. */
  surfaces: readonly string[];
  /** Draws one surface. */
  render(surfaceId: string): ReactNode;
  navigation?: Navigation;
  layout?: Layout;
  /** The key the browser keeps a layout's sizes under. */
  persist?: string;
}

const fromHash = () => (typeof location === 'undefined' ? '' : decodeURIComponent((/(?:^#|&)page=([^&]*)/.exec(location.hash) ?? [])[1] ?? ''));

/** The current page: the fragment's when it names one of the pages, else the first. */
export function currentPage(pages: readonly NavPage[], hash: string): string {
  return pages.some(p => p.page === hash) ? hash : pages[0]?.page ?? '';
}

export function Pages({ surfaces, render, navigation, layout, persist }: PagesProps) {
  if (layout?.kind === 'split' && layout.panes.length >= 2) return <LayoutPages surfaces={surfaces} render={render} layout={layout} persist={persist} />;
  if (navigation && navigation.pages.length) return <NavigatedPages surfaces={surfaces} render={render} navigation={navigation} />;
  return <>{surfaces.map(s => <div key={s} className="as-page-stacked">{render(s)}</div>)}</>;
}

function LayoutPages({ surfaces, render, layout, persist }: { surfaces: readonly string[]; render(id: string): ReactNode; layout: Layout; persist?: string }) {
  defineSplit();
  const panes = layout.panes.slice(0, 3);
  const rest = surfaces.filter(s => !panes.some(p => p.page === s));
  return (
    <>
      {createElement('agentspaces-split', { class: 'as-split as-page-split', persist: persist ? 'layout/' + persist : undefined,
        panes: JSON.stringify(panes.map(p => ({ id: p.page, size: p.size, min: p.min ?? 0, collapsible: Boolean(p.collapsible), label: p.page }))) },
      panes.map((p, i) => <div key={p.page} slot={'pane-' + i} className="as-split-pane" role="group" aria-label={p.page} data-page={p.page}>{render(p.page)}</div>))}
      {rest.map(s => <div key={s} className="as-page-stacked">{render(s)}</div>)}
    </>
  );
}

function NavigatedPages({ surfaces, render, navigation }: { surfaces: readonly string[]; render(id: string): ReactNode; navigation: Navigation }) {
  const pages = navigation.pages;
  const [current, setCurrent] = useState(() => currentPage(pages, fromHash()));
  useEffect(() => {
    const onHash = () => setCurrent(currentPage(pages, fromHash()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [JSON.stringify(pages)]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabs = useRef<Array<HTMLElement | null>>([]);
  const go = (page: string, focus = false) => {
    setCurrent(page);
    if (typeof history !== 'undefined' && typeof location !== 'undefined') history.replaceState(null, '', '#page=' + encodeURIComponent(page));
    if (focus) tabs.current[pages.findIndex(p => p.page === page)]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const next: Record<string, number> = navigation.kind === 'tabs' ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
    const step = next[e.key];
    if (step) { e.preventDefault(); go(pages[(i + step + pages.length) % pages.length].page, true); }
    else if (e.key === 'Home') { e.preventDefault(); go(pages[0].page, true); }
    else if (e.key === 'End') { e.preventDefault(); go(pages[pages.length - 1].page, true); }
  };
  const rest = surfaces.filter(s => !pages.some(p => p.page === s));
  const panel = (p: NavPage) => (
    <section key={p.page} id={'as-page-' + p.page} className="as-page" role={navigation.kind === 'tabs' ? 'tabpanel' : undefined} aria-label={p.title ?? p.page}
      hidden={p.page !== current} data-page={p.page}>
      {render(p.page)}
    </section>
  );
  if (navigation.kind === 'tabs') {
    return (
      <div className="as-pages as-pages-tabs">
        <div role="tablist" className="as-tabs" aria-label="Pages">
          {pages.map((p, i) => (
            <button key={p.page} ref={el => { tabs.current[i] = el; }} type="button" role="tab" aria-selected={p.page === current} aria-controls={'as-page-' + p.page}
              tabIndex={p.page === current ? 0 : -1} className={p.page === current ? 'as-tab current' : 'as-tab'} onClick={() => go(p.page)} onKeyDown={e => onKey(e, i)}>
              <Icon name={p.icon} />{p.title ?? p.page}
            </button>
          ))}
        </div>
        {pages.map(panel)}
        {rest.map(s => <div key={s} className="as-page-stacked">{render(s)}</div>)}
      </div>
    );
  }
  return (
    <div className="as-pages as-pages-rail">
      <nav className="as-rail" aria-label="Pages">
        <ul>
          {pages.map((p, i) => (
            <li key={p.page}>
              <a ref={el => { tabs.current[i] = el; }} href={'#page=' + encodeURIComponent(p.page)} aria-current={p.page === current ? 'page' : undefined}
                className={p.page === current ? 'as-rail-item current' : 'as-rail-item'} onClick={e => { e.preventDefault(); go(p.page); }} onKeyDown={e => onKey(e, i)}>
                <Icon name={p.icon} />{p.title ?? p.page}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="as-rail-pages">{pages.map(panel)}{rest.map(s => <div key={s} className="as-page-stacked">{render(s)}</div>)}</div>
    </div>
  );
}
