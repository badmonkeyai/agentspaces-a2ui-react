/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/Watchbox (srad/agentspaces-geo.md GEO-W-01 to W-06): the features at a path, newest first. Each row
// has the severity as a ring and a word (never colour alone, GEO-Q-41), the label, the kind, the age, and the property
// line the design names. A new arrival slides in with the look's highlight; when the person has scrolled down, a pill says
// how many are new instead. A click on a row selects its feature: in a GeoLayout the layout's map flies to it and opens
// its card; otherwise the map the watchbox names on its own surface does. A watchbox may watch an area (a box or a
// polygon feature): it lists the features inside it, draws the area on the layout's map, and marks a feature's arrival
// inside as an entry. It says when nothing has come yet (the design's emptyText, else that it waits), and when the feed
// stopped. A row's label shows in full up to four lines (the whole of it in the row's title and accessible name), and the
// age sits on the meta line, so it takes none of the label's width. A row the design marks done (done.field truthy on the
// feature) is drawn calmer, says the field's value on its meta line, and keeps only the actions done.keep names. An
// action with pick (GEO-W-08) sets the map's pick set from a feature property in place of a dispatch. With sort
// (srad/agentspaces-geo.md GEO-W-07) the rows keep a feature property's order, ties newest first.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useArrived, type ComponentProps } from '../renderer/implementation';
import type { WatchboxProps } from '../generated/props';
import { useGeoFrame } from '../frame/geo';
import { ageOf, areaOf, featureOf, geoState, inArea, isWatchboxDone, keysOf, kindMatches, MAX_PICKED, propertyLine, staleText, watchboxDone, watchboxDoneText, watchRows, type Feature } from '../viz/features';
import { usePicks } from '../viz/pick';
import { usePaths } from './hooks';
import { Empty } from './FeatureCardView';

/** How long an arrival keeps the look's highlight (GEO-W-02). */
export const ARRIVAL_MS = 1600;

const rowsOf = (v: unknown): Feature[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>) : []).map(featureOf).filter((f): f is Feature => Boolean(f));

export function WatchboxView({ props, ctx }: ComponentProps<WatchboxProps>) {
  const path = typeof props.path === 'string' ? props.path : '';
  const areaPath = typeof props.areaPath === 'string' && props.areaPath.startsWith('/') ? props.areaPath : path;
  const [rowsValue, areaValue] = usePaths(ctx, useMemo(() => [path, areaPath], [path, areaPath]));
  const all = useMemo(() => rowsOf(rowsValue), [rowsValue]);
  const arrived = useArrived(ctx);
  // the area by its value: a polygon feature's geometry, or the box; a new object each render would redraw the map's area
  // and loop through the layout's frame
  const areaFeature = useMemo(() => (typeof props.areaFeature === 'string' && props.areaFeature ? rowsOf(areaValue).find(f => f.id === props.areaFeature) : undefined),
    [areaValue, props.areaFeature]);
  const areaKey = JSON.stringify([props.area ?? null, areaFeature?.geometry ?? null, areaFeature?.label ?? '']);
  const area = useMemo(() => areaOf(props.area, areaFeature), [areaKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = typeof props.kind === 'string' ? props.kind : undefined;
  const max = typeof props.max === 'number' && props.max > 0 ? Math.min(5000, props.max) : 200;
  const fields = Array.isArray(props.fields) ? props.fields.map(String) : [];
  const actions = Array.isArray(props.actions) ? (props.actions as Array<{ name?: unknown; label?: unknown; pick?: { from?: unknown } }>).filter(a => typeof a?.name === 'string' && typeof a?.label === 'string')
    .map(a => ({ name: a.name as string, label: a.label as string, from: a.pick && typeof a.pick.from === 'string' && a.pick.from ? a.pick.from : undefined })) : [];
  // a row action with pick sets the map's pick set from a feature property, in place of a dispatch (GEO-W-08)
  const picks = usePicks(ctx, typeof props.map === 'string' ? props.map : undefined);
  const pickFrom = (f: Feature, from: string) => {
    const keys = keysOf(f.properties[from]);
    const listed = picks.listed();
    const known = listed ? keys.filter(k => listed.has(k)) : keys;
    const shown = known.slice(0, MAX_PICKED);
    const unlisted = keys.filter(k => !known.includes(k)), past = known.slice(MAX_PICKED);
    const said = !keys.length ? `${f.label || f.id} names none to show; nothing is picked.`
      : (shown.length ? `Showing ${shown.length} on the map: ${shown.join(', ')}.` : 'Nothing to show on the map.')
        + (unlisted.length ? ` Not in the table, so left out: ${unlisted.join(', ')}.` : '')
        + (past.length ? ` At most ${MAX_PICKED} at a time, so left out: ${past.join(', ')}.` : '');
    picks.set(shown, said);
  };
  const doneKey = JSON.stringify(props.done ?? null);
  const done = useMemo(() => watchboxDone(props.done), [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const emptyText = typeof props.emptyText === 'string' && props.emptyText.trim() ? props.emptyText.trim() : '';
  const matching = useMemo(() => all.filter(f => kindMatches(kind, f.kind) && f.id !== props.areaFeature && (!area || inArea(f, area))), [all, kind, area, props.areaFeature]);
  // sort (srad/agentspaces-geo.md GEO-W-07): a feature property's order in place of newest first
  const sort = typeof props.sort === 'string' && props.sort ? props.sort : undefined;
  const rows = useMemo(() => watchRows(matching, max, sort), [matching, max, sort]);
  const frame = useGeoFrame();
  // the area on the layout's map, while the watchbox is drawn (GEO-W-04)
  const overlayKey = ctx.surfaceId + '/' + ctx.componentId;
  useEffect(() => {
    if (!frame || !area) return undefined;
    frame.setOverlay(overlayKey, { geometry: area.geometry, label: area.label || String(props.label ?? '') });
    return () => frame.setOverlay(overlayKey, undefined);
  }, [frame?.setOverlay, areaKey, overlayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // arrivals and entries: what was seen before, and where each feature was (inside the area or not)
  const seen = useRef<Set<string> | null>(null);
  const wasInside = useRef(new Map<string, boolean>());
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(0);
  const [entered, setEntered] = useState<Set<string>>(() => new Set());
  const list = useRef<HTMLOListElement>(null);
  const lastChange = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    lastChange.current = Date.now();
    const ids = rows.map(f => f.id);
    // a feature that left the bound data (its lease ended) is forgotten, so its return is a new arrival (GEO-W-02), and
    // its place in or out of the area starts over
    const held = new Set(all.map(f => f.id));
    if (seen.current) for (const id of seen.current) if (!held.has(id)) seen.current.delete(id);
    for (const id of wasInside.current.keys()) if (!held.has(id)) wasInside.current.delete(id);
    if (!seen.current) { seen.current = new Set(ids); }
    else {
      const arrived = ids.filter(id => !seen.current!.has(id));
      arrived.forEach(id => seen.current!.add(id));
      if (arrived.length) {
        const scrolled = (list.current?.scrollTop ?? 0) > 4;
        if (scrolled) setPending(n => n + arrived.length);
        else {
          setFresh(prev => new Set([...prev, ...arrived]));
          setTimeout(() => setFresh(prev => { const next = new Set(prev); arrived.forEach(id => next.delete(id)); return next; }), ARRIVAL_MS);
        }
      }
    }
    if (area) {
      const now = new Set<string>();
      for (const f of all.filter(x => kindMatches(kind, x.kind) && x.id !== props.areaFeature)) {
        const inside = inArea(f, area);
        const before = wasInside.current.get(f.id);
        if (inside && before === false) now.add(f.id);
        wasInside.current.set(f.id, inside);
      }
      if (now.size) setEntered(prev => new Set([...prev, ...now]));
    }
  }, [rowsValue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t); }, []);
  const pick = (f: Feature) => {
    if (frame) { frame.focus(f.id); return; }
    const map = typeof props.map === 'string' ? props.map : '';
    if (!map) return;
    const s = geoState(map);
    ctx.set(s.selected, f.id);
    ctx.set(s.focus, { id: f.id, seq: Date.now() });
  };
  const showNew = () => { list.current?.scrollTo?.({ top: 0 }); if (list.current) list.current.scrollTop = 0; setPending(0); };
  const waiting = String(props.label || kind || 'features').replace(/\*$/, '');
  const stale = staleText(lastChange.current, typeof props.expectSeconds === 'number' ? props.expectSeconds : undefined);
  return (
    <div className="as-watchbox" data-component="Watchbox" data-rows={rows.length}>
      {area ? <p className="as-watchbox-area bma-muted bma-small">Watching {area.label || 'an area'}: {rows.length} inside.</p> : null}
      {stale ? <p className="as-watchbox-stale bma-small" role="status">{stale}</p> : null}
      {pending ? <button type="button" className="bma-btn as-watchbox-new" onClick={showNew}>{pending} new</button> : null}
      {rows.length ? (
        <ol ref={list} className="as-watchbox-list" aria-label={'watching ' + waiting} onScroll={e => { if ((e.currentTarget.scrollTop ?? 0) <= 4 && pending) setPending(0); }}>
          {rows.map(f => {
            const finished = isWatchboxDone(f, done);
            const label = f.label || f.id;
            const line = propertyLine(f, finished && done ? fields.filter(k => k !== done.field) : fields);
            const shown = finished && done ? actions.filter(a => done.keep.has(a.name)) : actions;
            return (
              <li key={f.id} className={`as-watchbox-row${fresh.has(f.id) ? ' arrived' : ''}${finished ? ' done' : ''}`} data-feature={f.id} data-done={finished || undefined}>
                <button type="button" className="as-watchbox-pick" onClick={() => pick(f)} title={label}>
                  <span className="line1">
                    {f.severity ? <span className={`as-sev as-sev-${f.severity}`}><span className="ring" aria-hidden="true" />{f.severity}</span> : null}
                    <b className="label">{label}</b>
                    {entered.has(f.id) ? <span className="bma-pill as-watchbox-entry">entered</span> : null}
                  </span>
                  <span className="line2 bma-muted bma-small">
                    <span className="meta">
                      {finished && done ? <><span className="done-text">{watchboxDoneText(f, done)}</span> · </> : null}
                      <span className="kind">{f.kind}</span>{line ? <> · {line}</> : null}
                    </span>
                    <span className="age" title={f.at}>{ageOf(f.at)}</span>
                  </span>
                  <span className="as-visually-hidden">: show on the map</span>
                </button>
                {shown.length ? <span className="as-watchbox-actions">{shown.map(a => (
                  <button key={a.name} type="button" className="bma-btn" data-pick={a.from ? '' : undefined} onClick={() => (a.from ? pickFrom(f, a.from) : ctx.dispatch(a.name, { id: f.id, kind: f.kind }))}>{a.label}</button>
                ))}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : rowsValue === undefined && !arrived ? <p className="as-watchbox-loading bma-muted bma-small" aria-busy="true">Loading {waiting}…</p>
        // a value that is no list or map of rows is said (GEO-Q-31), not drawn as a quiet watch; once the page's data has
        // arrived, a path it lacks is a quiet watch, not one that loads for ever
        : rowsValue !== undefined && (!rowsValue || typeof rowsValue !== 'object') ? <p className="as-watchbox-unavailable bma-small" role="note">Unavailable: the features at {path} do not read as a list.</p>
        : emptyText ? <Empty className="as-watchbox-empty" glyph="◌" text={emptyText} />
        : <Empty className="as-watchbox-empty" glyph="◌" heading="All quiet" text={`Nothing yet. Waiting for ${waiting}.`} />}
    </div>
  );
}
