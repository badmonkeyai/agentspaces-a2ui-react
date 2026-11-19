/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-geo/GeoMap's draw control (srad/agentspaces-geo.md GEO-F-21): a button in the design's words opens the
// shapes the design allows. A circle is a press at the centre and a drag (or a second click) for the radius, its radius
// shown as it grows; a polygon is a click per corner, closed by a double-click, Enter, Finish or a click on the first
// corner, Backspace taking the last corner back. From the keyboard, a circle at the map's centre takes its radius in a
// field (GEO-Q-40). A drawn shape asks for a name (1 to 80 characters, plain text), and Save dispatches the design's
// action with the shape as GeoJSON; Escape or Cancel at any point dispatches nothing. Whatever is drawn or typed is shown
// as text, never markup. After Save a note says what was sent for SENT_NOTE_MS (a new drawing clears it sooner); a
// screen reader hears it through the control's live line. The map is reached through a DrawSurface, so the control is
// tested as DOM over a stand-in map.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { IDLE, drawContext, drawStep, nameOf, radiusText, sketchOf, NAME_MAX, RADIUS_MAX_M, RADIUS_MIN_M,
  type DrawContext, type DrawEvent, type DrawSpec, type DrawState, type LonLat } from './draw';

/** The pointer on the map, in longitude and latitude and in CSS pixels. */
export interface DrawPointer { type: 'down' | 'move' | 'up' | 'dblclick'; at: LonLat; x: number; y: number }

/** What the control needs of a map. */
export interface DrawSurface {
  /** The map's centre now, or nothing where the map has none. */
  center(): LonLat | undefined;
  /** The screen distance between two places, in CSS pixels. */
  pixels(a: LonLat, b: LonLat): number;
  /** Hears the map's pointer while a shape is placed; returns the unsubscribe. */
  onPointer(listener: (e: DrawPointer) => void): () => void;
  /** 'pointer' while a shape is placed (the map stops panning), 'name' while it is named, 'off' after. */
  setDrawing(mode: 'off' | 'pointer' | 'name'): void;
  /** Draws the shape so far over the map, or clears it. */
  setSketch(sketch: { geometry: { type: string; coordinates: unknown }; corners: LonLat[] } | undefined): void;
  /** Gives the map the keyboard focus. */
  focus(): void;
}

/** How far a press may travel and stay a click; how near a click is to a corner to be on it (CSS pixels). */
export const CLICK_PX = 5;
export const CORNER_PX = 10;
/** The radius the keyboard's circle starts with, in metres. */
export const KEYBOARD_RADIUS_M = 1000;
/** How long the note of what Save sent stays, in milliseconds. */
export const SENT_NOTE_MS = 5000;

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const pressable = (t: EventTarget | null) => t instanceof HTMLElement && /^(BUTTON|A|SUMMARY)$/.test(t.tagName);

export function DrawControl({ spec, surface, dispatch, request = 0, noteMs = SENT_NOTE_MS }: {
  spec: DrawSpec;
  surface: DrawSurface;
  dispatch: (action: string, context: DrawContext) => void;
  /** A new number opens the shapes with the map's centre choice focused (the map's D key). */
  request?: number;
  /** How long the note of what Save sent stays (SENT_NOTE_MS). */
  noteMs?: number;
}) {
  const [state, setState] = useState<DrawState>(IDLE);
  const current = useRef<DrawState>(IDLE);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState('');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [radiusField, setRadiusField] = useState(String(KEYBOARD_RADIUS_M));
  const [sent, setSent] = useState('');
  // each Save starts the note's time afresh, so a second fence's note stays its full time
  const [sentAt, setSentAt] = useState(0);
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(() => {
      setSent('');
      // the live line said the same: cleared with it, so a later identical Save is heard again
      setSaid(s => (s.startsWith('Sent ') ? '' : s));
    }, noteMs);
    return () => clearTimeout(t);
  }, [sent, sentAt, noteMs]);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const centreChoice = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const ids = useId();
  const circle = spec.shapes.includes('circle');
  const polygon = spec.shapes.includes('polygon');
  const placing = state.phase === 'circle' || state.phase === 'polygon';
  const naming = state.phase === 'name';

  const apply = (e: DrawEvent) => {
    const r = drawStep(current.current, e, spec.maxVertices);
    current.current = r.state;
    setState(r.state);
    if (r.say) setSaid(r.say);
    return r.state;
  };
  const finish = (words: string) => {
    current.current = IDLE;
    setState(IDLE);
    setName(''); setNameError(''); setRadiusField(String(KEYBOARD_RADIUS_M));
    setSaid(words);
    surface.focus();
  };
  const cancel = () => { setSent(''); finish('Drawing cancelled.'); };
  const start = (shape: 'circle' | 'polygon') => { setOpen(false); setSent(''); apply({ type: 'start', shape }); };
  const toggle = () => { setSent(''); setOpen(o => !o); };
  const atCentre = () => {
    const c = surface.center();
    if (!c) return;
    setOpen(false); setSent('');
    setRadiusField(String(KEYBOARD_RADIUS_M));
    apply({ type: 'atCentre', center: c, radius: KEYBOARD_RADIUS_M });
  };

  // the map's D key: the shapes open on the map's centre choice (or the first shape, where circles are not allowed)
  const wantCentre = useRef(false);
  const [asked, setAsked] = useState(0);
  // only a request made after the control is drawn opens it: a control drawn again (a new map) keeps its shapes shut
  const lastRequest = useRef(request);
  useEffect(() => {
    if (request === lastRequest.current) return;
    lastRequest.current = request;
    if (!request || placing || naming) return;
    wantCentre.current = true;
    setSent('');
    setOpen(true);
    setAsked(n => n + 1);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    (wantCentre.current && centreChoice.current ? centreChoice.current : firstChoice.current)?.focus();
    wantCentre.current = false;
  }, [open, asked]);

  // the map stops panning while a shape is placed, and hears the pointer
  const mode = placing ? 'pointer' : naming ? 'name' : 'off';
  useEffect(() => { surface.setDrawing(mode); }, [surface, mode]);
  useEffect(() => () => { surface.setDrawing('off'); surface.setSketch(undefined); }, [surface]);
  useEffect(() => { surface.setSketch(sketchOf(state)); }, [surface, state]);
  useEffect(() => {
    if (!placing) return undefined;
    return surface.onPointer(p => {
      const s = current.current;
      if (p.type === 'down') { down.current = { x: p.x, y: p.y }; apply({ type: 'down', at: p.at }); return; }
      if (p.type === 'move') { apply({ type: 'move', at: p.at }); return; }
      if (p.type === 'dblclick') { if (s.phase === 'polygon') apply({ type: 'close' }); return; }
      const from = down.current;
      down.current = undefined;
      const moved = from ? Math.hypot(p.x - from.x, p.y - from.y) >= CLICK_PX : false;
      const corners = s.phase === 'polygon' ? s.corners : [];
      apply({ type: 'up', at: p.at, moved,
        nearFirst: corners.length > 0 && surface.pixels(p.at, corners[0]) <= CORNER_PX,
        nearLast: corners.length > 0 && surface.pixels(p.at, corners[corners.length - 1]) <= CLICK_PX });
    });
  }, [surface, placing]); // eslint-disable-line react-hooks/exhaustive-deps

  // the keys while drawing: Escape cancels at any point; while placing, Enter closes a polygon and Backspace takes back a corner
  useEffect(() => {
    if (!placing && !naming && !open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (open && !placing && !naming) { setOpen(false); trigger.current?.focus(); return; }
        cancel();
        return;
      }
      if (!placing || editable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' && !pressable(e.target) && current.current.phase === 'polygon') { e.preventDefault(); apply({ type: 'close' }); }
      if (e.key === 'Backspace' && current.current.phase === 'polygon') { e.preventDefault(); apply({ type: 'undo' }); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placing, naming, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // a drawn shape asks for its name: the keyboard's circle starts at its radius, the others at the name
  useEffect(() => {
    if (naming) (firstField.current ?? nameField.current)?.focus();
  }, [naming]);

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    const s = current.current;
    if (s.phase !== 'name') return;
    if (!nameOf(name)) {
      setNameError(name.trim() ? `A name is at most ${NAME_MAX} characters.` : 'Give the area a name.');
      nameField.current?.focus();
      return;
    }
    if (s.shape === 'circle' && s.keyboard) {
      const r = Number(radiusField);
      if (!Number.isFinite(r) || r < RADIUS_MIN_M || r > RADIUS_MAX_M) { firstField.current?.focus(); return; }
    }
    const context = drawContext(s, name);
    if (!context) return;
    dispatch(spec.action, context);
    setSent(context.name);
    setSentAt(n => n + 1);
    finish(`Sent "${context.name}".`);
  };

  const radiusBad = (() => { const r = Number(radiusField); return !radiusField.trim() || !Number.isFinite(r) || r < RADIUS_MIN_M || r > RADIUS_MAX_M; })();
  const hint = state.phase === 'circle'
    ? !state.center ? 'Circle: press at the centre.' : state.dragging ? 'Drag to set the radius.' : 'Click a second point for the radius.'
    : state.phase === 'polygon'
      ? `Polygon: ${state.corners.length} of at most ${spec.maxVertices} corners. Double-click, Enter or the first corner closes it.`
      : '';
  return (
    <div className="as-geomap-draw" data-draw={state.phase} role="group" aria-label={spec.label}>
      {/* the control's button stays where it is while a shape is drawn and named, so what it opens (the shapes, the hint,
          the name form) always opens below it, never over what sits beside it at the map's top (the time strip) */}
      <button ref={trigger} type="button" className="bma-btn draw-toggle" aria-expanded={open || state.phase !== 'idle'} aria-controls={ids + 'shapes'}
        disabled={state.phase !== 'idle'} onClick={toggle}>{spec.label}</button>
      {open && state.phase === 'idle' ? (
        <div id={ids + 'shapes'} className="draw-panel" role="group" aria-label="shapes">
          {circle ? <button ref={firstChoice} type="button" className="bma-btn" onClick={() => start('circle')}>Circle</button> : null}
          {polygon ? <button ref={circle ? undefined : firstChoice} type="button" className="bma-btn" onClick={() => start('polygon')}>Polygon</button> : null}
          {circle ? <button ref={centreChoice} type="button" className="bma-btn" onClick={atCentre}>Circle at the map&apos;s centre</button> : null}
        </div>
      ) : null}
      {placing ? (
        <div className="draw-panel">
          <p className="draw-hint bma-small">{hint}</p>
          {state.phase === 'circle' && state.center ? <p className="draw-readout bma-small">Radius {radiusText(state.radius)}</p> : null}
          <span className="draw-buttons">
            {state.phase === 'polygon' ? <button type="button" className="bma-btn" onClick={() => apply({ type: 'close' })}>Finish</button> : null}
            <button type="button" className="bma-btn" onClick={cancel}>Cancel</button>
          </span>
        </div>
      ) : null}
      {state.phase === 'name' ? (
        <form className="draw-panel" aria-label="name the area" noValidate onSubmit={save}>
          {state.shape === 'circle' && state.keyboard ? (
            <span className="draw-field bma-small">
              <label htmlFor={ids + 'r'}>Radius in metres</label>
              <input id={ids + 'r'} ref={firstField} type="number" inputMode="decimal" min={RADIUS_MIN_M} max={RADIUS_MAX_M} step="any" value={radiusField} aria-invalid={radiusBad || undefined}
                aria-describedby={ids + 'radius'} onChange={e => { setRadiusField(e.target.value); apply({ type: 'radius', meters: Number(e.target.value) }); }} />
              <span id={ids + 'radius'} className="bma-muted" aria-live="polite">{radiusBad ? `From ${RADIUS_MIN_M} m to ${radiusText(RADIUS_MAX_M)}.` : radiusText(state.radius)}</span>
            </span>
          ) : <p className="draw-readout bma-small">{state.shape === 'circle' ? `Circle, radius ${radiusText(state.radius)}` : `Polygon, ${state.corners.length} corners`}</p>}
          <span className="draw-field bma-small">
            <label htmlFor={ids + 'n'}>Name</label>
            <input id={ids + 'n'} ref={nameField} type="text" maxLength={NAME_MAX} required aria-required="true" autoComplete="off" value={name} aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? ids + 'name' : undefined} onChange={e => { setName(e.target.value); if (nameError) setNameError(''); }} />
          </span>
          {nameError ? <p id={ids + 'name'} className="draw-error bma-small" role="alert">{nameError}</p> : null}
          <span className="draw-buttons">
            <button type="submit" className="bma-btn">Save</button>
            <button type="button" className="bma-btn" onClick={cancel}>Cancel</button>
          </span>
        </form>
      ) : null}
      {sent && state.phase === 'idle' ? <p className="draw-sent bma-small bma-muted">Sent &ldquo;{sent}&rdquo;.</p> : null}
      <p className="as-visually-hidden" aria-live="polite">{said}</p>
    </div>
  );
}
