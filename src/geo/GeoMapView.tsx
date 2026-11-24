/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/GeoMap (srad/agentspaces-geo.md GEO-M-01 to M-05, M-08): GeoFeature layers on the map adapter
// that agentspaces-viz/Map uses, loaded on first use. Colours come from a feature's style, else its kind's, else its
// layer's, else the look's categorical hue for the layer's turn; a click selects a feature (a ring) and a click on empty
// map or Escape clears it; the view (pan, zoom, rotation, tilt) is kept per app in the browser, and the design's home
// view is one button away; a legend hides a layer and says when one is capped or the basemap failed. Where the map
// cannot draw (no WebGL, a test), each layer's features are listed, and a row selects its feature. A design's draw option
// adds the draw control (./DrawControl, GEO-F-21) over a drawn map: a circle or a polygon, named, sent as its action.
// A layer with pick (srad/agentspaces-geo.md GEO-M-10) reads the person's pick set (../viz/pick): the picked
// features alone or recoloured, a halo and a chip each, the other layers dimmed, one fit per change the person makes (none
// for one the data makes, none just after a fly the person asked for), the legend's Picked
// group with a remove button per key and Clear, and one polite live region that says each change.
// A legend toggle (srad/agentspaces-geo.md GEO-M-14) shows or hides the legend's layer entries: a pressed button that
// names the entries it controls, the last item of the GeoLayout bar's menu (else the legend's first), the person's
// choice kept per page in the browser over the design's hidden.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { GeoWindow, useDetailsWindow, useGeoFrame } from '../frame/geo';
import { Icon } from '../frame/icons';
import { Empty, FeatureCardView } from './FeatureCardView';
import { useData, type ComponentProps, type Ctx } from '../renderer/implementation';
import { useLook } from '../look/provider';
import type { GeoMapProps } from '../generated/props';
import type { GeoAdapter, GeoView } from '../viz/map-adapter';
import { basemapStyle, plainStyle } from '../viz/basemaps';
import { ageOf, applyPicks, byId, freshFeatures, capped, featuresState, legendKey, legendToggleOf, MAX_PICKED, type MapInsets, inWindow, pickHue, pickKeyOf, sliderGrid, timeSpan, TIME_WINDOWS, viewKey, type Feature, type FeatureLayer } from '../viz/features';
import { usePicks } from '../viz/pick';
import { useFeatureLayers, useHidden } from './hooks';
import { compact } from '../viz/scale';
import { DrawControl, type DrawSurface } from './DrawControl';
import { drawSpec } from './draw';

function storedView(key: string): GeoView | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && Array.isArray(v.center) && v.center.length === 2 && typeof v.zoom === 'number' ? v as GeoView : undefined;
  } catch { return undefined; }
}

/** The person's kept choice for a map's legend entries: shown, hidden, or nothing kept. */
function storedLegend(key: string): boolean | undefined {
  try { const v = localStorage.getItem(key); return v === 'shown' ? true : v === 'hidden' ? false : undefined; } catch { return undefined; }
}

function homeOf(props: GeoMapProps): GeoView | undefined {
  const h = props.home as { center?: unknown; zoom?: unknown } | undefined;
  return h && Array.isArray(h.center) && h.center.length === 2 && typeof h.center[0] === 'number' && typeof h.center[1] === 'number'
    ? { center: [h.center[0], h.center[1]], zoom: typeof h.zoom === 'number' ? h.zoom : 10 } : undefined;
}

/**
 * Writes the selection, and dispatches the design's select action with the feature's id and kind; a hex layer's hexagon
 * (srad/agentspaces-geo.md GEO-M-11) adds its hex id, its centre as [longitude, latitude] and the row it draws.
 */
export function select(ctx: Ctx, path: string, id: string | undefined, action?: string, kind?: string, feature?: Feature) {
  ctx.set(path, id ?? '');
  if (id && action) ctx.dispatch(action, { id, kind: kind ?? '', ...(feature?.hex ? { hex: feature.hex.id, centre: feature.hex.centre, row: feature.hex.row } : {}) });
}

/** The order N steps through a map's features: by label, then id, so the same features step the same way. */
export function stepOrder(features: readonly Feature[]): Feature[] {
  return [...features].sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id) || a.id.localeCompare(b.id));
}

/** Whether a key press belongs to a field (an Escape there is the field's). */
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** What the map's own controls cover at its top (the time strip, the draw control) and its foot (the layer chips), in px. */
export const CONTROLS_TOP = 56;
export const CONTROLS_BOTTOM = 44;
/** How long after a fly starts a change in the docked windows' reach makes the map aim again. */
export const REAIM_MS = 1500;

/**
 * How long a fly-to the person asked for (a row's click, the search, Centre, Enter) keeps the map where it went: no fit
 * (a pick set's change, the first fit) moves the map within it, so what the person just asked to see stays in view.
 */
export const FLY_GUARD_MS = 3000;

/**
 * Where a fly-to or a fit keeps its subject clear of in a GeoLayout: the docked windows (the frame's insets) and the map's
 * own controls over its top and its foot. Outside a GeoLayout nothing more than the adapter's own padding.
 */
export function mapInsets(insets: { left: number; right: number; bottom: number } | undefined): MapInsets | undefined {
  return insets ? { top: CONTROLS_TOP, left: insets.left, right: insets.right, bottom: insets.bottom + CONTROLS_BOTTOM } : undefined;
}

/** The drawing of agentspaces-geo/GeoMap; the catalog's component loads it on first use. */
export function GeoMapView({ props, ctx }: ComponentProps<GeoMapProps>) {
  const { tokens, mode } = useLook();
  const { layers: allLayers, kinds, state } = useFeatureLayers(ctx, props.id, props as unknown as Record<string, unknown>);
  // the time slider (GEO-M-07): a window of the held features' times, its end where the person drags it
  const span = useMemo(() => (props.timeSlider ? timeSpan(allLayers) : undefined), [props.timeSlider, allLayers]);
  const [width, setWidth] = useState(0);
  const [end, setEnd] = useState<number | null>(null);
  const windowEnd = span ? Math.min(span[1], Math.max(span[0], end ?? span[1])) : 0;
  const grid = span ? sliderGrid(span) : undefined;
  const windowed = useMemo(() => (span && width ? inWindow(allLayers, windowEnd, width) : allLayers), [allLayers, span, width, windowEnd]);
  // the pick set (srad/agentspaces-geo.md GEO-M-09, M-10): the layers with pick draw the picked features alone or
  // recoloured, one fit per change of the set; the set is the GeoLayout's, else this surface's /_geo/<map>/picked
  const picks = usePicks(ctx, props.id);
  const pickedKey = picks.picked.join('\n');
  const pickLayers = useMemo(() => allLayers.some(l => l.picks), [allLayers]);
  const pickView = useMemo(() => applyPicks(windowed, picks.picked, tokens.color.categorical), [windowed, pickedKey, tokens.color.categorical]); // eslint-disable-line react-hooks/exhaustive-deps
  const layers = pickView.layers;
  const hidden = useHidden(ctx, state.hidden);
  const selected = useData<string>(ctx, state.selected) || undefined;
  const follow = useData<string>(ctx, state.follow) || undefined;
  const focus = useData<{ id?: string; seq?: number }>(ctx, state.focus);
  const transition = typeof props.transition === 'number' && props.transition >= 0 ? props.transition : 1000;
  const frame = useGeoFrame();
  const details = useDetailsWindow(frame);
  // the docked windows' reach, for a fly-to or a fit: read when one happens, so a window's move refits nothing
  const insets = useRef<MapInsets | undefined>(undefined);
  insets.current = mapInsets(frame?.insets);
  const lastFly = useRef<{ f: Feature; at: number } | undefined>(undefined);
  // the docked windows' reach, as a key: the labels are laid out inside what they leave visible, again when it changes
  const insetsKey = JSON.stringify(insets.current ?? null);
  // the layers whose labels hide while one of their windows is open (a layer's labels.hideWhileOpen)
  const openKey = (frame?.openPages ?? []).join('\n');
  const quietLabels = useMemo(() => {
    const open = new Set(frame?.openPages ?? []);
    return new Set(allLayers.filter(l => l.hideLabelsWhileOpen?.some(p => open.has(p))).map(l => l.index));
  }, [openKey, allLayers]); // eslint-disable-line react-hooks/exhaustive-deps
  // the ids each fitNew layer held at the last drawing
  const heldIds = useRef(new Map<number, Set<string>>());
  // when the person last asked the map to fly (drawn or not), for the fly's guard
  const flewAt = useRef(0);
  const flewLately = () => Date.now() - flewAt.current < FLY_GUARD_MS;
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<GeoAdapter | null>(null);
  const fitted = useRef(false);
  const [status, setStatus] = useState<'loading' | 'map' | 'fallback'>('loading');
  // counts the maps made: a new look or basemap makes a new map while status stays 'map', and the drawing must run again
  const [generation, setGeneration] = useState(0);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [table, setTable] = useState(false);
  const features = useMemo(() => byId(layers), [layers]);
  // every held feature, the ones outside the time window too: a focus or a selection from a watchbox or the search finds
  // its feature here, and the window moves to show it
  const allFeatures = useMemo(() => byId(allLayers), [allLayers]);
  const drawn = useRef(layers);
  drawn.current = layers;
  // the draw control (GEO-F-21): while a shape is drawn, a click on the map is the drawing's, not a selection, and Escape
  // is the drawing's cancel
  const drawKey = JSON.stringify(props.draw ?? null);
  const draw = useMemo(() => drawSpec(props.draw), [drawKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const drawing = useRef(false);
  const [drawRequest, setDrawRequest] = useState(0);
  const drawSurface = useMemo<DrawSurface | undefined>(() => {
    const a = adapter.current;
    if (status !== 'map' || !a) return undefined;
    return {
      center: () => a.view().center,
      pixels: (p, q) => a.pixels(p, q),
      onPointer: l => a.onPointer(l),
      setDrawing: m => { drawing.current = m !== 'off'; a.setDrawing(m === 'pointer'); },
      setSketch: sk => a.setSketch(sk ? { ...sk, color: tokens.color.accent } : undefined),
      focus: () => host.current?.focus(),
    };
  }, [status, generation, tokens.color.accent]);
  const key = viewKey(ctx.surfaceId, props.id);
  const home = homeOf(props);
  const base = basemapStyle(typeof props.basemap === 'string' ? props.basemap : undefined, mode === 'dark', tokens.color.surface);
  useEffect(() => {
    let alive = true;
    // a frame later, so a mount that is undone at once (StrictMode's first pass) makes no map whose workers are then torn down mid-load
    const timer = setTimeout(() => {
      if (!alive || !host.current) return;
      const view = storedView(key) ?? home ?? { center: [0, 20] as [number, number], zoom: 1.5 };
      fitted.current = Boolean(storedView(key) || home);
      import('../viz/map-adapter').then(m => m.createGeoMap(host.current!, { view, dark: mode === 'dark', style: base.style, fallback: plainStyle(tokens.color.surface), onBasemapError: () => { if (alive) setBasemapFailed(true); } }))
        .then(a => {
          if (!alive) { a.dispose(); return; }
          adapter.current = a;
          a.onViewChange(v => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* a private window keeps no view */ } });
          setGeneration(g => g + 1);
          setStatus('map');
        })
        .catch(() => { if (alive) setStatus('fallback'); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); adapter.current?.dispose(); adapter.current = null; };
  }, [mode, base.name]);
  useEffect(() => {
    const a = adapter.current;
    if (status !== 'map' || !a) return;
    a.setFeatures(layers, { kinds, hidden, selected, follow, transition, status: tokens.color.status, overlays: frame?.overlays, accent: tokens.color.accent,
      picks: pickLayers ? { hue: pickView.hue, chips: pickView.chips, dimmed: pickView.dimmed } : undefined, insets: insets.current, quietLabels,
      onSelect: id => { if (!drawing.current) select(ctx, state.selected, id, props.selectAction, id ? allFeatures.get(id)?.feature.kind : undefined, id ? allFeatures.get(id)?.feature : undefined); } });
    // fitted only once a fit happened: a map in a hidden page or window has no size yet, and fits when it gets one; a
    // fly the person just asked for counts as the fit
    if (!fitted.current && flewLately()) fitted.current = true;
    if (!fitted.current) {
      const all = layers.flatMap(l => l.features);
      if (all.length && a.fit(all, insets.current)) fitted.current = true;
    }
    // a fitNew layer's features it did not hold at the last drawing fit the view once (§10.13: Show on a data set flies
    // to its extent); a layer's first arrival is only recorded, and a fly the person just asked for wins
    const fresh = freshFeatures(layers, heldIds.current);
    if (fresh.length && fitted.current && !flewLately() && a.fit(fresh, insets.current, true)) flewAt.current = Date.now();
  }, [status, generation, layers, kinds, hidden, selected, follow, transition, tokens.color.status, frame?.overlays, pickView, insetsKey, quietLabels]);
  // each change of the pick set the person makes fits the view once, over the picked features of the layers whose pick
  // fits (GEO-M-10); a change the data made (a key that left a table's rows) never moves the map, nor does any change
  // within the guard of a fly the person asked for (a click on an alert flew there, then a prune of the pick set, as
  // changing data took keys out of a table's rows, fitted the map back to the remaining picks somewhere else)
  const lastPicked = useRef(pickedKey);
  const pickFits = useRef(0);
  const [, setFitCount] = useState(0);
  useEffect(() => {
    if (pickedKey === lastPicked.current) return;
    lastPicked.current = pickedKey;
    if (!picks.picked.length || !pickView.fit.length || picks.said.byData || flewLately()) return;
    pickFits.current++;
    setFitCount(pickFits.current);
    adapter.current?.fit(pickView.fit, insets.current, true);
  }, [pickedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // a feature a show-picked layer hides, selected through the search (or a watchbox's row), joins the pick set, or the
  // refusal past eight is said (GEO-M-10)
  useEffect(() => {
    if (!selected) return;
    const hit = allFeatures.get(selected);
    const spec = hit?.layer.picks;
    if (!hit || !spec || spec.show !== 'picked') return;
    const k = pickKeyOf(hit.feature, spec.by);
    if (!k || picks.picked.includes(k)) return;
    if (picks.picked.length >= MAX_PICKED) picks.set(picks.picked, `At most ${MAX_PICKED} at a time; clear one first to show ${k}.`);
    else picks.set([...picks.picked, k]);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = host.current;
    if (status !== 'map' || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const a = adapter.current;
      if (fitted.current || !a) return;
      if (flewLately()) { fitted.current = true; return; }
      const all = drawn.current.flatMap(l => l.features);
      if (all.length && a.fit(all, insets.current)) fitted.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, generation]);
  // a watchbox's row in another window focuses a feature here (GEO-W-03)
  useEffect(() => frame?.onFocus(id => {
    if (!allFeatures.has(id)) return;   // a graph's node that is not one of this map's features
    select(ctx, state.selected, id, props.selectAction, allFeatures.get(id)?.feature.kind, allFeatures.get(id)?.feature);
    ctx.set(state.focus, { id, seq: Date.now() });
  }), [frame, allFeatures, state.selected, state.focus]);
  // a search's pick, a watchbox's row or a card's Centre: fly to the feature (GEO-S-02, GEO-W-03); one outside the time
  // window moves the window to end at its time (or to every time, when its time does not parse), so the map shows it
  useEffect(() => {
    const f = focus?.id ? allFeatures.get(focus.id)?.feature : undefined;
    if (!f) return;
    if (span && width && !features.has(f.id)) {
      const t = Date.parse(f.at);
      if (Number.isFinite(t)) setEnd(t >= span[1] ? null : t); else setWidth(0);
    }
    flewAt.current = Date.now();
    if (adapter.current) { adapter.current.flyTo(f, insets.current); lastFly.current = { f, at: Date.now() }; }
  }, [focus?.seq, focus?.id]);
  // a fly often opens a window (the selection's details docks on the right): when the docked windows' reach changes
  // during the flight, the map aims again, so the feature lands clear of the window that just opened
  useEffect(() => {
    const l = lastFly.current;
    if (l && Date.now() - l.at < REAIM_MS && adapter.current) adapter.current.flyTo(l.f, insets.current);
  }, [insetsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editable(e.target) && !drawing.current) select(ctx, state.selected, undefined); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, state.selected]);
  // the keyboard's way to a feature (GEO-Q-40): with the map focused, N and Shift+N step through the shown features in
  // label order, Enter flies to the selected one; Tab still leaves the map, so a map of thousands is no keyboard trap
  const [said, setSaid] = useState('');
  const onCanvasKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // D opens the draw control's shapes on its "at the map's centre" choice (GEO-Q-40)
    if ((e.key === 'd' || e.key === 'D') && draw && drawSurface && !drawing.current) { e.preventDefault(); setDrawRequest(n => n + 1); return; }
    if (drawing.current) return;
    if (e.key === 'Enter' && selected && allFeatures.has(selected)) { e.preventDefault(); ctx.set(state.focus, { id: selected, seq: Date.now() }); return; }
    if (e.key !== 'n' && e.key !== 'N') return;
    e.preventDefault();
    const shown = stepOrder(layers.filter(l => !hidden.has(l.index)).flatMap(l => l.features));
    if (!shown.length) { setSaid('No features shown.'); return; }
    const at = selected ? shown.findIndex(f => f.id === selected) : -1;
    const next = shown[e.shiftKey ? (at <= 0 ? shown.length - 1 : at - 1) : (at + 1) % shown.length];
    select(ctx, state.selected, next.id, props.selectAction, next.kind, next);
    setSaid(`${next.label || next.id}, ${next.kind}${next.severity ? ', ' + next.severity : ''}: ${shown.indexOf(next) + 1} of ${shown.length}. Enter shows it.`);
  };
  const toggle = (index: number) => {
    const next = new Set(hidden);
    if (next.has(index)) next.delete(index); else next.add(index);
    ctx.set(state.hidden, [...next].sort((a, b) => a - b));
  };
  const showTable = table || status === 'fallback';
  // the legend toggle (GEO-M-14): the person's choice, kept per page, else the design's hidden; an entry's own show and
  // hide of its layer is untouched, and the hidden layers are counted on the toggle while the entries are out of sight
  const legendToggle = legendToggleOf(props);
  const legendStore = legendKey(ctx.surfaceId, props.id);
  const [legendChoice, setLegendChoice] = useState<{ key: string; shown: boolean | undefined }>(() => ({ key: legendStore, shown: storedLegend(legendStore) }));
  const chosen = legendChoice.key === legendStore ? legendChoice.shown : storedLegend(legendStore);
  const entriesShown = !legendToggle || (chosen ?? !legendToggle.hidden);
  const entriesId = useId();
  const flipEntries = () => {
    const next = !entriesShown;
    setLegendChoice({ key: legendStore, shown: next });
    try { localStorage.setItem(legendStore, next ? 'shown' : 'hidden'); } catch { /* a private window keeps no choice */ }
  };
  const layersOff = layers.filter(l => hidden.has(l.index)).length;
  const offWords = !entriesShown && layersOff ? `${layersOff} off` : '';
  const toggleTitle = `${entriesShown ? 'Hide' : 'Show'} the map's layers and their counts${layersOff ? ` (${layersOff} layer${layersOff === 1 ? '' : 's'} turned off)` : ''}`;
  const toggleButton = legendToggle ? (inBar: boolean) => (
    <button type="button" className={inBar ? `as-geo-menu-item as-legend-toggle${entriesShown ? ' open' : ''}` : 'bma-btn as-legend-toggle'}
      aria-pressed={entriesShown} aria-controls={entriesId} title={toggleTitle} data-map={props.id} onClick={flipEntries}>
      {inBar ? <Icon name="chart" /> : null}
      <span className={inBar ? 'as-geo-menu-label' : undefined}>{legendToggle.label}{offWords ? <span className="as-legend-off"> · {offWords}</span> : null}</span>
    </button>
  ) : undefined;
  const barToggle = toggleButton && frame?.menuSlot ? createPortal(toggleButton(true), frame.menuSlot) : null;
  // the legend's Picked group (GEO-M-10): a swatch, the key and a remove button each, and Clear; after a remove the focus
  // goes to the next remove button, else the previous, else Clear; after Clear (or the last remove) to the first select
  // table's first checkbox for this map, else the map
  const pickGroup = useRef<HTMLDivElement>(null);
  const refocus = useRef<number | 'clear' | null>(null);
  useEffect(() => {
    const want = refocus.current;
    if (want === null) return;
    refocus.current = null;
    const removes = [...(pickGroup.current?.querySelectorAll<HTMLButtonElement>('button.as-pick-remove') ?? [])];
    const clear = pickGroup.current?.querySelector<HTMLButtonElement>('button.as-pick-clear');
    const tables = typeof document === 'undefined' ? [] : [...document.querySelectorAll<HTMLElement>('[data-pick-map]')];
    const table = (tables.find(t => t.dataset.pickMap === props.id) ?? tables[0])?.querySelector<HTMLInputElement>('input.as-pick-box');
    const target = want === 'clear' ? undefined : removes[want] ?? removes[want - 1] ?? clear;
    (target ?? table ?? host.current)?.focus();
  }, [pickedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const unpick = (k: string, i: number) => {
    const next = picks.picked.filter(x => x !== k);
    refocus.current = next.length ? i : 'clear';
    picks.set(next, next.length ? `Stopped showing ${k}. Showing ${next.length} on the map: ${next.join(', ')}.` : `Stopped showing ${k}; nothing is picked.`);
  };
  const clearPicks = () => { refocus.current = 'clear'; picks.set([], 'The picks were cleared; the map shows every layer.'); };
  const pickedGroup = pickLayers && picks.picked.length ? (
    <div className="as-picked" role="group" aria-label="Picked" ref={pickGroup}>
      <span className="as-picked-title">Picked</span>
      {picks.picked.map((k, i) => (
        <span key={k} className="entry as-picked-entry"><span className="swatch" style={{ background: pickHue(i, tokens.color.categorical) }} />{k}
          <button type="button" className="as-pick-remove" aria-label={`Stop showing ${k}`} title={`Stop showing ${k}`} onClick={() => unpick(k, i)}>×</button></span>
      ))}
      <button type="button" className="bma-btn as-pick-clear" onClick={clearPicks}>Clear</button>
    </div>
  ) : null;
  // the pick set's one polite live region on the map: each change, each refusal past eight, each pruning; a
  // saying equal to the last one ends in a zero-width space, so a screen reader says it again
  const pickSaid = pickLayers && picks.said.text ? picks.said.text + (picks.said.seq % 2 ? '' : '\u200b') : '';
  // in a GeoLayout the map opens the selected feature's card as a window of its own (§3.3; a design names none), and
  // closing it clears the selection
  const selectedFeature = selected ? allFeatures.get(selected)?.feature : undefined;
  // the window's title is the feature's label, and stays the last label known once the feature leaves the data: a raw
  // id is the title only of a feature that never had a label
  const lastLabel = useRef<{ id: string; label: string } | undefined>(undefined);
  if (selectedFeature?.label) lastLabel.current = { id: selectedFeature.id, label: selectedFeature.label };
  const title = selectedFeature?.label || (selected && lastLabel.current?.id === selected ? lastLabel.current.label : '') || selected || '';
  const showCard = Boolean(frame?.detailsSlot && props.details !== false && selected);
  // the card comes up above the layout's windows each time it opens on a feature, and a click on it raises it again
  useEffect(() => { if (showCard) details.raise(); }, [showCard, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  // the layout docks the card in its right column while it shows, so it covers no window there
  const setDetails = frame?.setDetails;
  useEffect(() => { setDetails?.(showCard ? details.state : undefined); }, [setDetails, showCard, details.state]);
  useEffect(() => () => setDetails?.(undefined), [setDetails]);
  const card = frame?.detailsSlot && showCard ? createPortal(
    <GeoWindow id="details" title={title} state={details.state} docked={details.docked} narrow={frame.narrow} stage={frame.stage}
      fitContent onFit={frame.fitDetails ? (_w, h) => frame.fitDetails!(h) : undefined} onChange={details.change} onRaise={details.raise} onClose={() => select(ctx, state.selected, undefined)}>
      <FeatureCardView props={{ id: props.id + 'Details', component: 'FeatureCard', map: props.id }} ctx={ctx} inWindow />
    </GeoWindow>, frame.detailsSlot) : null;
  // the features as a whole (GEO-Q-31): none yet, not arrived yet, or a path that does not read is said in words, on the
  // map or off it, since a blank map says none of them
  const whole = featuresState(allLayers);
  const note = whole.state === 'full' ? null
    : <span className={`as-geomap-note bma-small${whole.state === 'error' ? '' : ' bma-muted'}`} role="status" aria-busy={whole.state === 'loading' || undefined}>{whole.text}</span>;
  return (
    <div className="as-geomap" data-component="GeoMap" data-state={status} data-features={whole.state} data-selected={selected ?? ''} data-watched={frame?.overlays.length ?? 0}
      data-picked={pickLayers ? picks.picked.length : undefined} data-pick-fits={pickLayers ? pickFits.current : undefined}>
      <div className="canvas" ref={host} aria-hidden={status !== 'map'} tabIndex={status === 'map' ? 0 : -1} onKeyDown={onCanvasKey}
        aria-label={`map: arrows pan, + and − zoom, N and Shift+N step through the features, Enter shows the selected one${draw && drawSurface ? ', D draws an area' : ''}`}
        aria-keyshortcuts={draw && drawSurface ? 'N Shift+N Enter D' : 'N Shift+N Enter'} />
      <p className="as-visually-hidden" aria-live="polite">{said}</p>
      {pickLayers ? <p className="as-visually-hidden as-picked-said" aria-live="polite">{pickSaid}</p> : null}
      {props.legend !== false ? (
        <div className="legend" role="group" aria-label="layers">
          {toggleButton && !frame?.menuSlot ? toggleButton(false) : null}
          {pickedGroup}
          <span className="as-legend-entries" id={entriesId} role="group" aria-label="layer filters" hidden={!entriesShown}>
          {layers.map(l => (
            <button type="button" key={l.index} className={`entry${hidden.has(l.index) ? ' off' : ''}`} onClick={() => toggle(l.index)} aria-pressed={!hidden.has(l.index)}
              title={`${l.label || l.path}; click to ${hidden.has(l.index) ? 'show' : 'hide'}`}>
              {l.ramp ? <span className="swatch as-ramp-swatch" style={{ background: `linear-gradient(to right, ${l.ramp.steps.join(', ')})` }} /> : <span className="swatch" style={{ background: l.color }} />}{l.label || l.path}
              {l.ramp ? <span className="bma-muted"> {compact(l.ramp.domain.min)} to {compact(l.ramp.domain.max)},</span> : null} <span className="bma-muted">{capped(l)}</span>
            </button>
          ))}
          </span>
          {home && status === 'map' ? <button type="button" className="bma-btn" onClick={() => adapter.current?.setView(home)}>Home</button> : null}
          {props.table !== false && status === 'map' ? <button type="button" className="bma-btn" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? 'Map' : 'Table'}</button> : null}
          {basemapFailed || !base.known ? <span className="bma-muted bma-small" role="status">{basemapFailed ? 'The basemap did not load; the features are drawn on a plain background.' : `No basemap is named ${String(props.basemap)}; the map draws ${base.name}.`}</span> : null}
          {note}
        </div>
      ) : note || pickedGroup ? <div className="legend">{pickedGroup}{note}</div> : null}
      {status === 'map' ? (
        <div className="controls" role="group" aria-label="map view">
          <button type="button" className="bma-btn" aria-label="zoom in" title="Zoom in (+)" onClick={() => adapter.current?.zoomBy(1)}>+</button>
          <button type="button" className="bma-btn" aria-label="zoom out" title="Zoom out (−)" onClick={() => adapter.current?.zoomBy(-1)}>−</button>
          <button type="button" className="bma-btn" aria-label="north up" title="North up and flat (rotate and tilt with Ctrl and drag)" onClick={() => adapter.current?.resetNorth()}>N</button>
        </div>
      ) : null}
      {draw && drawSurface ? <DrawControl spec={draw} surface={drawSurface} request={drawRequest}
        dispatch={(action, context) => ctx.dispatch(action, context as unknown as Record<string, unknown>)} /> : null}
      {status === 'map' && base.attribution && !basemapFailed ? <span className="attribution bma-small">{base.attribution}</span> : null}
      {span && props.timeSlider ? (
        <div className="time" role="group" aria-label="time window">
          <select aria-label="window" value={width} onChange={e => setWidth(Number(e.target.value))}>{TIME_WINDOWS.map(w => <option key={w.ms} value={w.ms}>{w.label}</option>)}</select>
          {/* the grid ends on the newest time, so the thumb reaches it; at the right end the window follows the newest */}
          <input type="range" aria-label="window ends at" min={grid!.min} max={grid!.max} step={grid!.step} value={windowEnd} disabled={!width}
            onChange={e => { const v = Number(e.target.value); setEnd(v >= span[1] ? null : v); }} />
          <span className="bma-muted bma-small" aria-live="polite">{width ? `${new Date(windowEnd - width).toISOString().slice(11, 16)}–${new Date(windowEnd).toISOString().slice(11, 16)} UTC, ${layers.reduce((n, l) => n + l.features.length, 0)} shown` : 'every time'}</span>
        </div>
      ) : null}
      {showTable ? (
        <div className="table-view">
          {status === 'fallback' ? <span className="bma-muted bma-small">The map cannot draw here; the features of each layer:</span> : null}
          {status === 'loading' ? <span className="bma-muted bma-small">Loading the map…</span> : null}
          {layers.filter(l => !hidden.has(l.index)).map(l => <FeatureTable key={l.index} layer={l} selected={selected} onSelect={id => select(ctx, state.selected, id, props.selectAction, features.get(id)?.feature.kind, features.get(id)?.feature)} />)}
        </div>
      ) : null}
      {card}
      {barToggle}
    </div>
  );
}


/** A layer's features as a table: label, kind, severity, age; a row selects its feature. At most two hundred rows. */
function FeatureTable({ layer, selected, onSelect }: { layer: FeatureLayer; selected?: string; onSelect: (id: string) => void }) {
  // the layer's name labels its table and is no heading: the map sits at any depth of a page's outline, and a heading
  // here would skip levels under the page's own (axe's heading-order)
  const titleId = useId();
  return (
    <div className="layer-table">
      <p className="layer-title" id={titleId}><span className="swatch" style={{ background: layer.color }} />{layer.label || layer.path} <span className="bma-muted bma-small">{capped(layer)} feature{layer.features.length === 1 ? '' : 's'}</span></p>
      {layer.features.length ? (
        <table className="bma-table" aria-labelledby={titleId}>
          <thead><tr><th>Feature</th><th>Kind</th><th>Severity</th><th>Seen</th></tr></thead>
          <tbody>{layer.features.slice(0, 200).map(f => (
            <tr key={f.id} aria-selected={f.id === selected}>
              <td><button type="button" className="as-geo-link" onClick={() => onSelect(f.id)}>{f.label || f.id}</button></td>
              <td>{f.kind}</td><td>{f.severity ? <span className={`bma-status bma-status-${f.severity}`}>{f.severity}</span> : null}</td><td>{ageOf(f.at)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : layer.broken ? <p className="bma-small" role="note">Unavailable: the features at {layer.path} do not read as a list.</p>
        : layer.pending ? <p className="bma-muted bma-small" aria-busy="true">Loading…</p>
        : <Empty glyph="◌" heading="Empty layer" text="No feature yet." />}
    </div>
  );
}
