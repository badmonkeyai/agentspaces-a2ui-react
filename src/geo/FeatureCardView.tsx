/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/FeatureCard (srad/agentspaces-geo.md GEO-S-03, S-05): the details of the selected feature of the map
// it names: the label, the kind, the severity, how long ago it was observed, and the properties, the fields its kind
// names first, every value as text (React escapes it; nothing a feature carries is markup, GEO-Q-10). Centre flies the
// map to it, Follow keeps it centred, Copy id copies its id, Ask puts "About <label> (<id>)" in a chat's box. The card
// follows the feature's updates, and says so when the feature is gone (its lease ended): in plain words, under the last
// label it had, with a Close; in the map's details window it also closes by itself after GONE_CLOSE_MS (unless the
// feature comes back first). The head is a kicker (the kind, a dot in its colour) over the title; in a GeoLayout's
// window the window's head holds the title and the close, so the card shows neither again.
import { useEffect, useRef, useState } from 'react';
import { useData, type ComponentProps } from '../renderer/implementation';
import type { FeatureCardProps } from '../generated/props';
import { ageOf, byId, cardFields, featuresState, lookOf, valueText, type Feature } from '../viz/features';
import { askChat } from '../components/widgets/Chat';
import { useFeatureLayers } from './hooks';
import { select } from './GeoMapView';

/** How long the map's details window stays open on a feature that left the data before it closes by itself. */
export const GONE_CLOSE_MS = 6000;

/** The empty card: a glyph, a heading and the sentence it has always said, so a check on that sentence still holds. */
export function Empty({ glyph, heading, text, className }: { glyph: string; heading?: string; text: string; className?: string }) {
  return <div className={'as-empty' + (className ? ' ' + className : '')}><span className="glyph" aria-hidden="true">{glyph}</span>{heading ? <b>{heading}</b> : null}<p>{text}</p></div>;
}

/**
 * The drawing of agentspaces-geo/FeatureCard; the catalog's component loads it on first use. `inWindow` is the map's
 * own details window (GeoMapView): the window's head shows the title and the close, so the card leaves both out.
 */
export function FeatureCardView({ props, ctx, inWindow }: ComponentProps<FeatureCardProps> & { inWindow?: boolean }) {
  const mapId = String(props.map ?? '');
  const mapProps = ctx.component(mapId);
  const { layers, kinds, state } = useFeatureLayers(ctx, mapId, mapProps);
  const selected = useData<string>(ctx, state.selected) || undefined;
  const follow = useData<string>(ctx, state.follow) || undefined;
  const held = selected ? byId(layers).get(selected) : undefined;
  // the feature as last seen, so a card whose feature's lease ended still says which one is gone
  const seen = useRef<{ id: string; feature: Feature } | undefined>(undefined);
  if (held) seen.current = { id: held.feature.id, feature: held.feature };
  const [, tick] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 10_000); return () => clearInterval(t); }, []);
  useEffect(() => setNote(''), [selected]);
  // in the map's window a feature that left the data closes its window after a short while; it coming back keeps it
  const goneFrom = Boolean(selected && !held && seen.current?.id === selected);
  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = () => select(ctx, state.selected, undefined);
  useEffect(() => {
    if (!inWindow || !goneFrom) return undefined;
    const t = setTimeout(() => closeRef.current(), GONE_CLOSE_MS);
    return () => clearTimeout(t);
  }, [inWindow, goneFrom, selected]);
  if (!mapProps) return <div className="as-feature-card" data-component="FeatureCard"><p className="bma-muted bma-small">This card names a map ({mapId}) the page does not have.</p></div>;
  if (!selected) return <div className="as-feature-card empty" data-component="FeatureCard"><Empty glyph="◎" heading="Nothing selected" text="Select a feature on the map for its details." /></div>;
  const close = () => select(ctx, state.selected, undefined);
  const closer = inWindow ? null : <button type="button" className="bma-btn" onClick={close} aria-label="close the details">Close</button>;
  if (!held) {
    const gone = seen.current?.id === selected ? seen.current.feature : undefined;
    // not held: gone, a path that does not read, the features not arrived yet, or an id the map does not have (GEO-Q-31)
    const broken = !gone && layers.some(l => l.broken);
    const loading = !gone && !broken && layers.some(l => l.pending);
    const name = gone ? gone.label || gone.id : selected;
    return (
      <div className={'as-feature-card gone' + (inWindow ? ' in-window' : '')} data-component="FeatureCard" role="status">
        {gone || !inWindow ? (
          <header>
            <span className="head">
              {gone ? <small className="as-kicker">{gone.kind}</small> : null}
              {inWindow ? null : <h3>{name}</h3>}
            </span>
            {closer}
          </header>
        ) : null}
        <p aria-busy={loading || undefined}>{gone ? `${name} is no longer on the map.` : broken ? featuresState(layers).text
          : loading ? 'Loading the feature…' : `No feature ${selected} is on the map.`}</p>
        {gone && inWindow ? (
          <div className="gone-actions">
            <span className="bma-muted bma-small">This window closes in a few seconds.</span>
            <button type="button" className="bma-btn" onClick={close}>Close</button>
          </div>
        ) : null}
      </div>
    );
  }
  const f = held.feature;
  const hue = lookOf(f, held.layer, kinds).color;
  const fields = cardFields(f, kinds, Array.isArray(props.fields) ? props.fields.map(String) : []);
  const ask = () => setNote(askChat(typeof props.ask === 'string' ? props.ask : undefined, ctx.surfaceId, `About ${f.label || f.id} (${f.id}) `) ? 'In the chat’s box.' : 'This page shows no chat to ask in.');
  const copy = () => {
    const done = () => setNote('Copied ' + f.id + '.');
    // no clipboard outside a secure context (a page over plain http): the id is shown to copy by hand
    if (!navigator.clipboard?.writeText) { setNote(f.id); return; }
    try { void navigator.clipboard.writeText(f.id).then(done, () => setNote(f.id)); } catch { setNote(f.id); }
  };
  return (
    <div className={'as-feature-card' + (inWindow ? ' in-window' : '')} data-component="FeatureCard" data-feature={f.id} aria-live="polite">
      <header>
        <span className="head">
          <small className="as-kicker"><span className="dot" aria-hidden="true" style={{ background: hue }} />{f.kind}</small>
          {inWindow ? null : <h3>{f.label || f.id}</h3>}
        </span>
        {closer}
      </header>
      {f.severity || f.at ? (
        <div className="facts">
          {f.severity ? <span className={`bma-status bma-status-${f.severity}`}>{f.severity}</span> : null}
          {f.at ? <span className="bma-muted bma-small" title={f.at}>seen {ageOf(f.at)}</span> : null}
        </div>
      ) : null}
      {fields.length ? (
        <dl>{fields.map(([k, v]) => [<dt key={k + ':k'}>{k}</dt>, <dd key={k + ':v'}>{valueText(v)}</dd>])}</dl>
      ) : <p className="bma-muted bma-small">No properties.</p>}
      {f.links?.length ? <p className="bma-small">{f.links.map(l => <span key={l.rel + l.id} className="bma-pill">{l.rel}: {l.id}</span>)}</p> : null}
      <div className="actions">
        <button type="button" className="bma-btn" onClick={() => ctx.set(state.focus, { id: f.id, seq: Date.now() })}>Centre</button>
        <button type="button" className="bma-btn" aria-pressed={follow === f.id} onClick={() => ctx.set(state.follow, follow === f.id ? '' : f.id)}>{follow === f.id ? 'Following' : 'Follow'}</button>
        <button type="button" className="bma-btn" onClick={copy}>Copy id</button>
        <button type="button" className="bma-btn primary" onClick={ask}>Ask</button>
      </div>
      {note ? <p className="bma-muted bma-small" role="status">{note}</p> : null}
    </div>
  );
}
