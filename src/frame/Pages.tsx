/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The surfaces of one app as a page, from the Publish's options:
//   navigation  { kind: tabs | rail, pages: [{ page, title, icon }] } draws the named surfaces as pages a person moves
//               between, the current page in the URL fragment (#page=<id>); a surface it does not name stays below
//   layout      { kind: split, panes: [{ page, size, min, collapsible }] } places whole surfaces in the panes of a split;
//               { kind: conversation, chat, size, kicker, banner, areas: [{ page, label, icon }] } is the standard page of the advanced
//               apps (2026-11-11): a top bar with the app's title and its areas, the chat on the left growing down the
//               page, and the current area's surface on the right, kept in view while the chat grows (kicker, optional:
//               a short line above the title in the bar; banner, optional: one line of plain text, centred, at the very
//               top of the page above the bar and again at its very foot, read once by a screen reader);
//               { kind: geo, map, kicker, windows: [{ page, label, icon, open, dock }] } is the GeoLayout (srad/agentspaces-geo.md
//               §3.3, ./geo): the map full screen under a bar, and each window's surface a card over it
// A layout takes the page when both are set. With neither, the surfaces stack, as they did before these options. Every surface stays
// mounted, so a page a person left keeps its stream, its drafts and its place.
import { createElement, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useBarClaim } from './frame';
import { defineSplit } from '../elements/split';
import { Icon } from './icons';
import { GeoPages, kickerOf, type GeoLayout } from './geo';

export type { GeoLayout, GeoWindowSpec, Dock } from './geo';

export interface NavPage { page: string; title?: string; icon?: string }
export interface Navigation { kind: 'tabs' | 'rail'; pages: NavPage[] }
export interface LayoutPane { page: string; size: number; min?: number; collapsible?: boolean }
export interface SplitLayout { kind: 'split'; panes: LayoutPane[] }
export interface Area { page: string; label: string; icon?: string }
export interface ConversationLayout {
  kind: 'conversation'; chat: string; size?: number; areas: Area[];
  /** A short line above the app's title in the bar (a section, a place, a mode). */
  kicker?: string;
  /** One line of plain text at the very top of the page, above the bar, and again at its very foot; empty draws nothing. */
  banner?: string;
}
export type Layout = SplitLayout | ConversationLayout | GeoLayout;

export interface PagesProps {
  /** The surfaces in the Publish's order. */
  surfaces: readonly string[];
  /** Draws one surface. */
  render(surfaceId: string): ReactNode;
  navigation?: Navigation;
  layout?: Layout;
  /** The key the browser keeps a layout's sizes under. */
  persist?: string;
  /** The app's title and lede, which a conversation draws in its top bar. */
  title?: string;
  lede?: string;
}

const fromHash = () => (typeof location === 'undefined' ? '' : decodeURIComponent((/(?:^#|&)page=([^&]*)/.exec(location.hash) ?? [])[1] ?? ''));

/** The current page: the fragment's when it names one of the pages, else the first. */
export function currentPage(pages: readonly NavPage[], hash: string): string {
  return pages.some(p => p.page === hash) ? hash : pages[0]?.page ?? '';
}

export function Pages({ surfaces, render, navigation, layout, persist, title, lede }: PagesProps) {
  if (layout?.kind === 'geo' && layout.map) return <GeoPages surfaces={surfaces} render={render} layout={{ ...layout, windows: Array.isArray(layout.windows) ? layout.windows : [] }} title={title} lede={lede} persist={persist} />;
  if (layout?.kind === 'conversation' && layout.chat && layout.areas?.length) return <ConversationPages surfaces={surfaces} render={render} layout={layout} title={title} lede={lede} />;
  if (layout?.kind === 'split' && layout.panes.length >= 2) return <LayoutPages surfaces={surfaces} render={render} layout={layout} persist={persist} />;
  if (navigation && navigation.pages.length) return <NavigatedPages surfaces={surfaces} render={render} navigation={navigation} />;
  return <>{surfaces.map(s => <div key={s} className="as-page-stacked">{render(s)}</div>)}</>;
}

function LayoutPages({ surfaces, render, layout, persist }: { surfaces: readonly string[]; render(id: string): ReactNode; layout: SplitLayout; persist?: string }) {
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

/** The longest banner drawn, in characters, as the Publish builder allows: one line on a narrow page. */
export const BANNER_MAX = 120;

/**
 * A layout's banner at the top (a note a screen reader reads) or at the foot (the same words, hidden from a screen
 * reader so they are read once); nothing for an empty or absent one. Plain text: React escapes it.
 */
export function bannerOf(banner: unknown, at: 'top' | 'foot'): ReactNode {
  // a control character (C0, DEL or C1, such as U+0085 NEL) reads as a space too, as the Publish builder refuses one
  const one = typeof banner === 'string' ? banner.replace(/[\s\p{Cc}]+/gu, ' ').trim() : '';
  const words = one.length > BANNER_MAX ? one.slice(0, BANNER_MAX - 1) + '…' : one;
  if (!words) return null;
  return at === 'top'
    ? <div className="as-banner as-banner-top" role="note">{words}</div>
    : <div className="as-banner as-banner-foot" aria-hidden="true">{words}</div>;
}

/**
 * The conversation (2026-11-11): one top bar (the title, the lede, the areas as tabs, the page's tools: it claims the
 * frame's bar as a TitleBar does), the chat's surface on the left growing down the page, and the current area's surface
 * on the right, sticky under the bar. The chat stays the same across areas; the current area is in #page=. Below 900 px
 * the halves stack, the chat first. A new line of the chat brings its message box back into view. A banner draws above
 * the bar and again under the body (AF-18). The title is the page's h1 (D-F11), so a screen reader's outline starts at
 * the app.
 */
function ConversationPages({ surfaces, render, layout, title, lede }: { surfaces: readonly string[]; render(id: string): ReactNode; layout: ConversationLayout; title?: string; lede?: string }) {
  const areas = layout.areas;
  const pages: NavPage[] = areas.map(a => ({ page: a.page, title: a.label, icon: a.icon }));
  const [current, setCurrent] = useState(() => currentPage(pages, fromHash()));
  useEffect(() => {
    const onHash = () => setCurrent(currentPage(pages, fromHash()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [JSON.stringify(pages)]); // eslint-disable-line react-hooks/exhaustive-deps
  const { held, tools } = useBarClaim();
  const tabs = useRef<Array<HTMLElement | null>>([]);
  const chat = useRef<HTMLElement | null>(null);
  const go = (page: string, focus = false) => {
    setCurrent(page);
    if (typeof history !== 'undefined') history.replaceState(null, '', '#page=' + encodeURIComponent(page));
    if (focus) tabs.current[pages.findIndex(p => p.page === page)]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (step) { e.preventDefault(); go(pages[(i + step + pages.length) % pages.length].page, true); }
    else if (e.key === 'Home') { e.preventDefault(); go(pages[0].page, true); }
    else if (e.key === 'End') { e.preventDefault(); go(pages[pages.length - 1].page, true); }
  };
  // the thread grows down the page: a new line brings the message box back into view (never when the person scrolled up)
  useEffect(() => {
    const el = chat.current;
    if (!el || typeof MutationObserver === 'undefined') return undefined;
    let atEnd = true;
    const onScroll = () => { atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160; };
    window.addEventListener('scroll', onScroll, { passive: true });
    const seen = new MutationObserver(() => {
      if (!atEnd) return;
      const box = el.querySelector('form') ?? el.lastElementChild;
      box?.scrollIntoView?.({ block: 'nearest' });
    });
    seen.observe(el, { childList: true, subtree: true });
    return () => { seen.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, []);
  const size = typeof layout.size === 'number' && layout.size >= 0.2 && layout.size <= 0.6 ? layout.size : 0.4;
  const rest = surfaces.filter(s => s !== layout.chat && !areas.some(a => a.page === s));
  return (
    <div className="as-conversation" style={{ '--as-chat-size': `${Math.round(size * 100)}%` } as CSSProperties}>
      {bannerOf(layout.banner, 'top')}
      <header className="as-conversation-bar">
        <div className="as-conversation-title">
          {kickerOf(layout.kicker)}
          <h1 className="as-conversation-name">{title ?? ''}</h1>
          {lede ? <span className="as-conversation-lede">{lede}</span> : null}
        </div>
        {areas.length > 1 ? (
          <div role="tablist" className="as-conversation-areas" aria-label="Areas">
            {pages.map((p, i) => (
              <button key={p.page} ref={b => { tabs.current[i] = b; }} type="button" role="tab" aria-selected={p.page === current} aria-controls={'as-area-' + p.page}
                tabIndex={p.page === current ? 0 : -1} className={p.page === current ? 'as-area-tab current' : 'as-area-tab'} onClick={() => go(p.page)} onKeyDown={e => onKey(e, i)}>
                <Icon name={p.icon} />{p.title}
              </button>
            ))}
          </div>
        ) : null}
        {held ? <span className="as-conversation-tools">{tools}</span> : null}
      </header>
      <div className="as-conversation-body">
        <section ref={chat} className="as-conversation-chat" aria-label="Chat" data-page={layout.chat}>{render(layout.chat)}</section>
        <section className="as-conversation-area" aria-label={pages.find(p => p.page === current)?.title ?? 'Area'}>
          {pages.map(p => (
            <div key={p.page} id={'as-area-' + p.page} role={areas.length > 1 ? 'tabpanel' : undefined} hidden={p.page !== current} data-page={p.page}>{render(p.page)}</div>
          ))}
          {rest.map(s => <div key={s} className="as-page-stacked">{render(s)}</div>)}
        </section>
      </div>
      {bannerOf(layout.banner, 'foot')}
    </div>
  );
}
