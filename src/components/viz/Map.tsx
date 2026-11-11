/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Map: layers over the surface's data drawn by deck.gl on MapLibre behind the adapter, loaded
// on first use: icons that move when a key's position changes, markers, tracks, areas, heat, GeoJSON; alert boxes
// beside their keys (the window pattern), a legend that hides a layer, a table view of the rows (the dataviz rule),
// a highlight and a follow from the data model. Where the map cannot draw (no WebGL, a test), the rows are listed
// so the page still says what is where, and the alert boxes still work.
import { useEffect, useMemo, useRef, useState } from 'react';
import { define, fmt, useData, type Ctx } from '../../renderer/implementation';
import { useLook } from '../../look/provider';
import type { MapProps } from '../../generated/props';
import type { MapAdapter } from '../../viz/map-adapter';
import { layersOf, legendName, number, positioned, severityOf, type LayerSpec, type MapLayer, type Row } from '../../viz/geo';
import { WindowPanel } from '../../viz/WindowPanel';

/** The value at every layer's path, re-rendered when any changes (one subscription per path, in the layers' order). */
function useLayerData(ctx: Ctx, paths: string[]): unknown[] {
  const [values, setValues] = useState<unknown[]>(() => paths.map(p => ctx.get(p)));
  const joined = paths.join('\u0000');
  useEffect(() => {
    setValues(paths.map(p => ctx.get(p)));
    const offs = paths.map((p, i) => ctx.subscribe(p, v => setValues(prev => { const next = prev.slice(); next[i] = v; return next; })));
    return () => offs.forEach(off => off());
  }, [ctx, joined]);
  return values;
}

type Alert = { id?: string; key?: string; severity?: string; title?: string; text?: string; at?: string; acknowledged?: boolean };

export const Map = define<MapProps>('Map', ({ props, ctx }) => {
  const { tokens, mode } = useLook();
  const specs = useMemo(() => (Array.isArray(props.layers) ? (props.layers as LayerSpec[]).filter(l => l && typeof l.path === 'string') : []), [props.layers]);
  const data = useLayerData(ctx, specs.map(l => l.path));
  const layers = useMemo(() => layersOf(specs, p => data[specs.findIndex(s => s.path === p)], tokens.color.categorical), [specs, data, tokens.color.categorical]);
  const highlightValue = useData<unknown>(ctx, typeof props.highlight === 'string' && props.highlight.startsWith('/') ? props.highlight : undefined);
  const highlight = useMemo(() => (Array.isArray(highlightValue) ? highlightValue.map(String) : typeof highlightValue === 'string' && highlightValue ? [highlightValue] : []), [highlightValue]);
  const followValue = useData<unknown>(ctx, typeof props.follow === 'string' && props.follow.startsWith('/') ? props.follow : undefined);
  const follow = typeof followValue === 'string' && followValue ? followValue : undefined;
  const transition = typeof props.transition === 'number' && props.transition >= 0 ? props.transition : 1000;
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapAdapter | null>(null);
  const [state, setState] = useState<'loading' | 'map' | 'fallback'>('loading');
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [table, setTable] = useState(false);
  const [minimized, setMinimized] = useState<Set<string>>(() => new Set());
  const [, setMoved] = useState(0);
  useEffect(() => {
    let alive = true;
    // a frame later, so a mount that is undone at once (StrictMode's first pass) makes no map whose workers are then torn down mid-load
    const timer = setTimeout(() => {
      if (!alive || !host.current) return;
      import('../../viz/map-adapter').then(m => m.createMap(host.current!, { center: props.center as [number, number] | undefined, zoom: props.zoom, dark: mode === 'dark' }))
        .then(a => { if (!alive) { a.dispose(); return; } adapter.current = a; a.onMove(() => setMoved(n => n + 1)); setState('map'); })
        .catch(() => { if (alive) setState('fallback'); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); adapter.current?.dispose(); adapter.current = null; };
  }, [mode]);
  useEffect(() => {
    if (state !== 'map' || !adapter.current) return;
    adapter.current.setLayers(layers, { fit: props.fit !== 'none', transition, highlight, follow, hidden, onMarker: row => ctx.dispatch(props.markerAction, { row }) });
  }, [state, layers, props.fit, props.markerAction, transition, highlight, follow, hidden]);
  // the alert boxes: the rows of every alerts layer, each beside its key's newest position when the map draws
  const alerts = useMemo(() => layers.filter(l => l.kind === 'alerts' && !hidden.has(l.index)).flatMap(l => l.rows.map(r => ({ layer: l, alert: r as Alert, id: String((r as Alert).id ?? `${l.index}-${String((r as Alert).key ?? '')}-${String((r as Alert).title ?? '')}`) }))), [layers, hidden]);
  const positions = useMemo(() => {
    const out = new globalThis.Map<string, { lat: number; lon: number }>();
    layers.filter(l => (l.kind === 'icons' || l.kind === 'markers') && l.key).forEach(l => l.rows.filter(positioned).forEach(r => out.set(String(r[l.key!]), { lat: number(r.lat)!, lon: number(r.lon)! })));
    return out;
  }, [layers]);
  const acknowledge = (a: Alert, id: string) => ctx.dispatch(props.alertAction, { id, key: a.key ?? '', acknowledged: true });
  const box = (entry: { alert: Alert; id: string }) => {
    const a = entry.alert;
    const at = positions.get(String(a.key ?? ''));
    const anchor = state === 'map' && adapter.current && at ? adapter.current.project(at.lat, at.lon) : undefined;
    const sev = severityOf(a.severity);
    return (
      <WindowPanel key={entry.id} testId={entry.id} title={String(a.title ?? a.key ?? 'alert')} status={sev} placement={anchor ? 'anchored' : 'flow'} anchor={anchor} width={260}
        onMinimize={m => setMinimized(prev => { const next = new Set(prev); if (m) next.add(entry.id); else next.delete(entry.id); return next; })}
        actions={props.alertAction && !a.acknowledged ? <button type="button" className="bma-btn primary" onClick={() => acknowledge(a, entry.id)}>Acknowledge</button> : undefined}>
        <span className={`bma-status bma-status-${sev} bma-small`}>{sev}</span>{a.key ? <span className="bma-pill" style={{ marginLeft: 6 }}>{String(a.key)}</span> : null}
        {a.text ? <div className="text">{String(a.text)}</div> : null}
        {a.at ? <div className="bma-muted bma-small">{String(a.at)}</div> : null}
        {props.alertAction && a.acknowledged ? <span className="bma-muted bma-small">acknowledged</span> : null}
      </WindowPanel>
    );
  };
  const open = alerts.filter(e => !minimized.has(e.id));
  const bar = alerts.filter(e => minimized.has(e.id));
  const visible = layers.filter(l => !hidden.has(l.index) && l.kind !== 'alerts');
  const showTable = table || state === 'fallback';
  return (
    <div className="bma-map" data-component="Map" data-state={state}>
      <div className="canvas" ref={host} aria-hidden={state !== 'map'} />
      {state === 'map' ? <div className="boxes">{open.map(box)}</div> : null}
      {props.legend !== false ? (
        <div className="legend" role="group" aria-label="layers">
          {layers.map(l => (
            <button type="button" key={l.index} className={`entry${hidden.has(l.index) ? ' off' : ''}`} onClick={() => setHidden(prev => { const next = new Set(prev); if (next.has(l.index)) next.delete(l.index); else next.add(l.index); return next; })} aria-pressed={!hidden.has(l.index)} title={`${l.kind} layer; click to ${hidden.has(l.index) ? 'show' : 'hide'}`}>
              <span className="swatch" style={{ background: l.color }} />{legendName(l)} <span className="bma-muted">{l.kind === 'geojson' ? '' : l.rows.length}</span>
            </button>
          ))}
          {props.table !== false && state === 'map' ? <button type="button" className="bma-btn" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? 'Map' : 'Table'}</button> : null}
          {bar.length ? <span className="bar">{bar.map(e => <button type="button" key={e.id} className="bma-btn" onClick={() => setMinimized(prev => { const next = new Set(prev); next.delete(e.id); return next; })} aria-label={'restore ' + String(e.alert.title ?? e.id)}>{String(e.alert.title ?? e.alert.key ?? e.id)}</button>)}</span> : null}
        </div>
      ) : null}
      {state !== 'map' ? <div className="boxes-flow">{alerts.map(box)}</div> : null}
      {showTable ? (
        <div className="table-view">
          {state === 'fallback' ? <span className="bma-muted bma-small">{'The map cannot draw here; the rows of each layer:'}</span> : null}
          {state === 'loading' ? <span className="bma-muted bma-small">Loading the map…</span> : null}
          {visible.map(l => <LayerTable key={l.index} layer={l} onRow={props.markerAction ? row => ctx.dispatch(props.markerAction, { row }) : undefined} action={props.markerAction} />)}
        </div>
      ) : null}
    </div>
  );
});

const SKIP = new Set(['polygon', 'geometry', 'track', 'findings']);

/** The rows of one layer as a table: the fields of its first rows as columns, at most two hundred rows. */
function LayerTable({ layer, onRow, action }: { layer: MapLayer; onRow?: (row: Row) => void; action?: string }) {
  if (layer.kind === 'geojson') return <p className="bma-muted bma-small">{legendName(layer)}: a GeoJSON layer{layer.geojson ? '' : ' (no data yet)'}.</p>;
  const columns: string[] = [];
  layer.rows.slice(0, 50).forEach(r => Object.keys(r).forEach(k => { if (!SKIP.has(k) && !columns.includes(k) && typeof r[k] !== 'object') columns.push(k); }));
  return (
    <div className="layer-table">
      <h4><span className="swatch" style={{ background: layer.color }} />{legendName(layer)} <span className="bma-muted bma-small">{layer.kind}, {layer.rows.length} row{layer.rows.length === 1 ? '' : 's'}</span></h4>
      {layer.rows.length ? (
        <table className="bma-table">
          <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}{onRow ? <th /> : null}</tr></thead>
          <tbody>{layer.rows.slice(0, 200).map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{fmt(r[c])}</td>)}{onRow ? <td><button type="button" className="bma-btn" onClick={() => onRow(r)}>{action}</button></td> : null}</tr>)}</tbody>
        </table>
      ) : <p className="bma-muted bma-small">No row yet.</p>}
    </div>
  );
}
