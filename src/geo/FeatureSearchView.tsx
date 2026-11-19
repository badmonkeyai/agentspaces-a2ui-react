/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/FeatureSearch (srad/agentspaces-geo.md GEO-S-01, S-02): a box over the features of the map it names,
// by label, id and the named properties, as a person types (150 ms after the last key), ignoring case and accents, with
// up to ten results showing the kind and the label. Picking one, or Enter for the first, selects it and flies the map
// to it (a point at zoom 14, a line or a polygon fitted to its bounds). The arrows move through the results; Escape
// empties the box.
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useGeoFrame } from '../frame/geo';
import type { ComponentProps } from '../renderer/implementation';
import type { FeatureSearchProps } from '../generated/props';
import { featuresState, searchFeatures, type SearchHit } from '../viz/features';
import { useFeatureLayers } from './hooks';
import { select } from './GeoMapView';

/** The debounce of GEO-S-01. */
export const SEARCH_DEBOUNCE_MS = 150;

/** The drawing of agentspaces-geo/FeatureSearch; the catalog's component loads it on first use. */
export function FeatureSearchView({ props, ctx }: ComponentProps<FeatureSearchProps>) {
  const mapId = String(props.map ?? '');
  const mapProps = ctx.component(mapId);
  const { layers, state } = useFeatureLayers(ctx, mapId, mapProps);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => { const t = setTimeout(() => { setQuery(text); setActive(0); }, SEARCH_DEBOUNCE_MS); return () => clearTimeout(t); }, [text]);
  const fields = useMemo(() => (Array.isArray(props.fields) ? props.fields.map(String) : []), [props.fields]);
  const hits = useMemo(() => searchFeatures(layers, query, fields, 10), [layers, query, fields]);
  const placeholder = typeof props.placeholder === 'string' && props.placeholder ? props.placeholder : 'Search the map';
  // the map's features as a whole (GEO-Q-31): with nothing to search, the empty box says why in its placeholder, and its
  // description says it in full; the box keeps its size, since in a GeoLayout it sits in the top bar. When one layer's
  // path does not read but another's features do, the box still searches those, so its placeholder says only part is
  // there and its border takes the warning colour, which stays while a person types: a hidden description alone would
  // leave a sighted person nothing to tell it from a full map
  const whole = useMemo(() => featuresState(layers), [layers]);
  const nothing = layers.every(l => !l.features.length);
  const shownPlaceholder = !nothing ? (whole.state === 'error' ? `${placeholder} (some unavailable)` : placeholder)
    : whole.state === 'loading' ? 'Loading the features…' : whole.state === 'error' ? 'Unavailable' : 'No feature yet';
  const pick = (h: SearchHit | undefined) => {
    if (!h) return;
    select(ctx, state.selected, h.feature.id, typeof mapProps?.selectAction === 'string' ? mapProps.selectAction : undefined, h.feature.kind);
    ctx.set(state.focus, { id: h.feature.id, seq: Date.now() });
    setText(''); setQuery('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter picks what the arrows chose, else the first result; it does not wait for the debounce, and over results the
    // debounce has not drawn yet the arrows chose nothing, so it picks the first
    const fresh = text === query;
    const now = fresh ? hits : searchFeatures(layers, text, fields, 10);
    if (e.key === 'Enter') { e.preventDefault(); pick(now[fresh ? Math.min(active, Math.max(0, now.length - 1)) : 0]); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, Math.max(0, hits.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Escape') { setText(''); setQuery(''); }
  };
  const open = query.trim() !== '' && text.trim() !== '';
  // in a GeoLayout the search draws in the top bar (GEO-L-02), still reading this surface's map
  const frame = useGeoFrame();
  const box = (
    <div className="as-feature-search" data-component="FeatureSearch" data-state={whole.state}>
      <label className="as-visually-hidden" htmlFor={listId + 'q'}>{placeholder}</label>
      <input id={listId + 'q'} type="search" value={text} placeholder={shownPlaceholder} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-describedby={whole.text ? listId + 'state' : undefined} aria-busy={whole.state === 'loading' || undefined}
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined} onChange={e => { setText(e.target.value); setActive(0); }} onKeyDown={onKey} />
      {whole.text ? <span id={listId + 'state'} className="as-visually-hidden">{whole.text}</span> : null}
      {open ? (
        <ul id={listId} role="listbox" className="results">
          {hits.length ? hits.map((h, i) => (
            <li key={h.feature.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}>
              <span className="label">{h.feature.label || h.feature.id}</span> <span className="bma-muted bma-small">{h.feature.kind}</span>
            </li>
          )) : <li className="bma-muted bma-small" role="option" aria-disabled="true" aria-selected={false}>No feature matches “{query}”.</li>}
        </ul>
      ) : null}
      {!mapProps ? <p className="bma-muted bma-small">This search names a map ({mapId}) the page does not have.</p> : null}
    </div>
  );
  return frame?.searchSlot ? createPortal(box, frame.searchSlot) : box;
}
