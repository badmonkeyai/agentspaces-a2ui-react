/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/LayerMenu (srad/agentspaces-geo.md GEO-M-06): a menu of the layers of the map it names: a toggle each,
// the count of features, and a note when a layer holds fewer than matched (the binding's max, GEO-F-05). It writes the
// same hidden set the map's legend does, so the two agree. The open menu is headed by a kicker: its name and how many
// layers show.
import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentProps } from '../renderer/implementation';
import type { LayerMenuProps } from '../generated/props';
import { useFeatureLayers, useHidden } from './hooks';
import { capped, featuresState } from '../viz/features';

/** The drawing of agentspaces-geo/LayerMenu; the catalog's component loads it on first use. */
export function LayerMenuView({ props, ctx }: ComponentProps<LayerMenuProps>) {
  const mapId = String(props.map ?? '');
  const mapProps = ctx.component(mapId);
  const { layers, state } = useFeatureLayers(ctx, mapId, mapProps);
  const hidden = useHidden(ctx, state.hidden);
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = (index: number) => {
    const next = new Set(hidden);
    if (next.has(index)) next.delete(index); else next.add(index);
    ctx.set(state.hidden, [...next].sort((a, b) => a - b));
  };
  const label = typeof props.label === 'string' && props.label ? props.label : 'Layers';
  // the map's features as a whole (GEO-Q-31): the trigger carries a word while they load or do not read, as a Menu's does,
  // and the open menu says it in full
  const whole = featuresState(layers);
  const word = whole.state === 'loading' ? 'Loading' : whole.state === 'error' ? 'Unavailable' : '';
  return (
    <div className="as-layer-menu" data-component="LayerMenu" ref={root}>
      <button type="button" className="bma-btn" aria-expanded={open} aria-controls={id} aria-busy={whole.state === 'loading' || undefined} onClick={() => setOpen(o => !o)}>
        {label}{word ? <span className="as-menu-note"> {word}</span> : null}
      </button>
      <ul id={id} className="menu" hidden={!open} aria-label={label}>
        {layers.length ? <li className="menu-head" aria-hidden="true"><small className="as-kicker">{label}</small><span className="bma-muted bma-small">{layers.filter(l => !hidden.has(l.index)).length} of {layers.length} shown</span></li> : null}
        {layers.map(l => (
          <li key={l.index}>
            <label>
              <input type="checkbox" checked={!hidden.has(l.index)} onChange={() => toggle(l.index)} />
              <span className="swatch" style={{ background: l.color }} />
              <span className="name">{l.label || l.path}</span>
              <span className="bma-muted bma-small">{capped(l)}</span>
            </label>
            {typeof l.total === 'number' && l.total > l.features.length ? <span className="bma-muted bma-small note">showing the newest {l.features.length.toLocaleString('en')}</span> : null}
          </li>
        ))}
        {layers.length && whole.text ? <li className="bma-muted bma-small note">{whole.text}</li> : null}
        {!layers.length ? <li className="bma-muted bma-small">{mapProps ? 'The map has no layer.' : `No map ${mapId} on the page.`}</li> : null}
      </ul>
    </div>
  );
}
