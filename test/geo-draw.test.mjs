// agentspaces-geo/GeoMap's draw control (srad/agentspaces-geo.md GEO-F-21, GEO-Q-40). No WebGL runs here, so the drawing's
// state machine and geometry are tested as pure functions, and the control as DOM over a stand-in map that feeds it the
// pointer in longitude and latitude: the action's context for a circle (a 64-vertex ring, closed, 6 decimals, the centre
// and the radius) and a polygon (its corners, closed), Escape and Cancel sending nothing, maxVertices, the name required,
// trimmed and at most 80 characters, the keyboard's circle at the map's centre, and markup in a name shown as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, key, click, React, ui } from './setup.mjs';

const g = await ui.loadGeo();
const decimals = x => (String(x).split('.')[1] ?? '').length;
const closed = ring => ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
const turn = ring => ring.slice(0, -1).reduce((s, p, i) => s + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0);

test('the draw option reads with the catalog\'s defaults, and without an action there is no control', () => {
  assert.equal(ui.drawSpec(undefined), undefined);
  assert.equal(ui.drawSpec({ shapes: ['circle'] }), undefined, 'no action');
  assert.equal(ui.drawSpec({ action: '  ' }), undefined, 'a blank action');
  assert.deepEqual(ui.drawSpec({ action: 'area.add' }), { action: 'area.add', shapes: ['circle', 'polygon'], label: 'Draw an area', maxVertices: 100 });
  assert.deepEqual(ui.drawSpec({ action: 'a', shapes: ['polygon', 'hexagon'], label: 'Mark a zone', maxVertices: 6 }), { action: 'a', shapes: ['polygon'], label: 'Mark a zone', maxVertices: 6 });
  assert.equal(ui.drawSpec({ action: 'a', maxVertices: 1000 }).maxVertices, 200, 'at most 200');
  assert.equal(ui.drawSpec({ action: 'a', maxVertices: 1 }).maxVertices, 3, 'at least 3');
  assert.equal(ui.drawSpec({ action: 'a', maxVertices: 4.5 }).maxVertices, 100, 'not a whole number: the default');
});

test('a circle is a geodesic ring of 64 vertices, closed, counter-clockwise, every coordinate to 6 decimals', () => {
  const center = [-3.0123456789, 53.4087654321];
  const ring = ui.circleRing(center, 2500);
  assert.equal(ring.length, 65, '64 vertices and the closing point');
  assert.ok(closed(ring));
  assert.ok(turn(ring) > 0, 'counter-clockwise (GeoJSON\'s right-hand rule)');
  for (const p of ring) {
    assert.ok(decimals(p[0]) <= 6 && decimals(p[1]) <= 6, String(p));
    assert.ok(Math.abs(ui.distanceMeters(center, p) - 2500) < 0.5, 'each vertex on the circle: ' + ui.distanceMeters(center, p));
  }
  assert.equal(new Set(ring.slice(0, -1).map(String)).size, 64, 'no two vertices meet');
  const tiny = ui.circleRing([0, 0], ui.RADIUS_MIN_M);
  assert.equal(new Set(tiny.slice(0, -1).map(String)).size, 64, 'the least radius still has 64 distinct vertices');
  assert.equal(ui.radiusText(812.4), '812 m');
  assert.equal(ui.radiusText(2345), '2.35 km');
  assert.equal(ui.radiusText(45_600), '45.6 km');
});

test('a polygon\'s ring is closed, rounded, its repeated corners dropped and turned counter-clockwise', () => {
  const cw = [[0.1234567, 0], [0, 0.1], [0.1, 0.1], [0.1, 0.10000001]];
  const ring = ui.polygonRing(cw);
  assert.equal(ring.length, 4, 'three distinct corners and the closing point: ' + JSON.stringify(ring));
  assert.ok(closed(ring) && turn(ring) > 0);
  assert.deepEqual(ring[0], [0.123457, 0]);
  assert.equal(ui.polygonRing([[0, 0], [1, 1], [0, 0]]), undefined, 'two distinct corners make no polygon');
  assert.deepEqual(ui.wrapLon(190), -170);
});

test('the machine: a polygon by clicks, Backspace, a double-click\'s second click, the first corner closing, maxVertices', () => {
  let s = ui.DRAW_IDLE;
  const go = (e, max = 4) => { const r = ui.drawStep(s, e, max); s = r.state; return r.say; };
  assert.match(go({ type: 'start', shape: 'polygon' }), /^Drawing a polygon/);
  go({ type: 'up', at: [0, 0], moved: false });
  go({ type: 'up', at: [1, 0], moved: false });
  go({ type: 'up', at: [1, 0], moved: false, nearLast: true });
  assert.equal(s.corners.length, 2, 'a click on the corner just placed adds none');
  go({ type: 'up', at: [5, 5], moved: true });
  assert.equal(s.corners.length, 2, 'a drag is no corner');
  assert.match(go({ type: 'close' }), /at least 3 corners: 2 so far/);
  assert.equal(s.phase, 'polygon');
  go({ type: 'up', at: [1, 1], moved: false });
  assert.match(go({ type: 'undo' }), /Corner removed: 2 corners/);
  go({ type: 'up', at: [1, 1], moved: false });
  go({ type: 'up', at: [0, 1], moved: false });
  assert.equal(s.corners.length, 4);
  assert.match(go({ type: 'up', at: [0.5, 2], moved: false }), /At most 4 corners/);
  assert.equal(s.corners.length, 4, 'maxVertices holds');
  go({ type: 'up', at: [0, 0], moved: false, nearFirst: true });
  assert.equal(s.phase, 'name', 'a click on the first corner closes');
  const c = ui.drawContext(s, '  North pier  ');
  assert.deepEqual(c, { shape: 'polygon', name: 'North pier', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } });
  assert.equal(ui.drawContext(s, '   '), undefined, 'a name is required');
  assert.equal(ui.drawContext(s, 'x'.repeat(81)), undefined, 'at most 80 characters');
  go({ type: 'cancel' });
  assert.equal(s.phase, 'idle');
});

test('the machine: a circle by a drag or by two clicks, never smaller than the least radius', () => {
  let s = ui.DRAW_IDLE;
  const go = e => { const r = ui.drawStep(s, e); s = r.state; return r.say; };
  go({ type: 'start', shape: 'circle' });
  go({ type: 'down', at: [0, 0] });
  go({ type: 'move', at: [0, 0.01] });
  assert.ok(Math.abs(s.radius - 1112) < 1, 'the radius follows the drag: ' + s.radius);
  assert.match(go({ type: 'up', at: [0, 0.01], moved: true }), /A circle of radius 1\.11 km/);
  assert.equal(s.phase, 'name');
  go({ type: 'cancel' });
  go({ type: 'start', shape: 'circle' });
  go({ type: 'down', at: [0, 0] });
  assert.match(go({ type: 'up', at: [0, 0], moved: false }), /Click a second point/);
  go({ type: 'down', at: [0, 0.00001] });
  assert.match(go({ type: 'up', at: [0, 0.00001], moved: false }), /Too small/);
  assert.equal(s.phase, 'circle');
  go({ type: 'up', at: [0.02, 0], moved: false });
  assert.equal(s.phase, 'name');
  const c = ui.drawContext(s, 'Anchorage');
  assert.equal(c.shape, 'circle');
  assert.deepEqual(c.center, [0, 0]);
  assert.ok(Math.abs(c.radiusMeters - 2223.9) < 0.2, String(c.radiusMeters));
  assert.equal(c.geometry.coordinates[0].length, 65);
});

/** A stand-in map: the centre, a pixel a thousandth of a degree, the pointer fed by hand, and a record of the calls. */
function standIn(center = [-3.0123456789, 53.4087654321]) {
  const calls = { drawing: [], sketches: [], focus: 0 };
  let listener;
  const surface = {
    center: () => center,
    pixels: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 1000,
    onPointer: l => { listener = l; return () => { if (listener === l) listener = undefined; }; },
    setDrawing: m => calls.drawing.push(m),
    setSketch: s => calls.sketches.push(s),
    focus: () => { calls.focus++; },
  };
  const at = p => ({ at: p, x: p[0] * 1000, y: -p[1] * 1000 });
  const pointer = async (type, p) => { await React.act(async () => { assert.ok(listener, 'the control hears the pointer while placing'); listener({ type, ...at(p) }); }); };
  return { surface, calls, pointer, listening: () => Boolean(listener) };
}

async function control(spec, request = 0, map = standIn(), more = {}) {
  const sent = [];
  const props = { spec: ui.drawSpec(spec), surface: map.surface, dispatch: (action, context) => sent.push({ action, context }), request, ...more };
  let rerender;
  function Host() { const [p, setP] = React.useState(props); rerender = setP; return React.createElement(g.DrawControl, p); }
  const m = await mount(React.createElement(Host));
  const button = words => [...m.container.querySelectorAll('button')].find(b => b.textContent.trim() === words);
  // a field by its label's words: the label names it (for=), as a screen reader finds it
  const input = label => { const l = [...m.container.querySelectorAll('label')].find(x => x.textContent.trim() === label); return l ? document.getElementById(l.htmlFor) : undefined; };
  const type = async (el, value) => { await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
  const said = () => m.container.querySelector('[aria-live="polite"].as-visually-hidden').textContent;
  const ask = async n => { await React.act(async () => { rerender(p => ({ ...p, request: n })); }); };
  return { ...m, sent, button, input, type, said, ask, map };
}

test('the note of what Save sent goes after a few seconds and when a new drawing starts; a screen reader heard it', async () => {
  assert.ok(g.SENT_NOTE_MS >= 3000 && g.SENT_NOTE_MS <= 8000, 'a few seconds by default: ' + g.SENT_NOTE_MS);
  const c = await control({ action: 'area.add', label: 'Mark a zone' }, 0, standIn(), { noteMs: 80 });
  const drawOne = async name => {
    await click(c.button('Mark a zone'));
    await click(c.button('Circle'));
    await c.map.pointer('down', [0, 0]); await c.map.pointer('move', [0, 0.01]); await c.map.pointer('up', [0, 0.01]);
    await c.type(c.input('Name'), name);
    await click(c.button('Save'));
  };
  await drawOne('Station area');
  assert.equal(c.container.querySelector('.draw-sent').textContent, 'Sent “Station area”.');
  assert.equal(c.said(), 'Sent "Station area".', 'the live line says it');
  await React.act(async () => { await new Promise(r => setTimeout(r, 160)); });
  assert.equal(c.container.querySelector('.draw-sent'), null, 'the note went by itself');
  assert.equal(c.said(), '', 'and the live line with it, so the next Save is heard afresh');
  await drawOne('Second area');
  assert.ok(c.container.querySelector('.draw-sent'));
  await click(c.button('Mark a zone'));
  assert.equal(c.container.querySelector('.draw-sent'), null, 'opening the shapes for a new drawing clears it at once');
  await c.unmount();
});

test('a circle drawn by a drag is named and sent: the context, the radius shown, the overlay cleared, focus back on the map', async () => {
  const c = await control({ action: 'area.add', label: 'Mark a zone' });
  const toggle = c.button('Mark a zone');
  assert.ok(toggle, 'the control is a button in the design\'s words');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await click(toggle);
  await click(c.button('Circle'));
  assert.equal(c.map.calls.drawing.at(-1), 'pointer', 'the map stops panning while the shape is placed');
  assert.match(c.said(), /^Drawing a circle/, 'a screen reader hears the mode');
  await c.map.pointer('down', [-3.01, 53.4]);
  await c.map.pointer('move', [-3.01, 53.41]);
  assert.match(c.container.querySelector('.draw-readout').textContent, /^Radius 1\.11 km$/, 'the radius while drawing');
  assert.equal(c.map.calls.sketches.at(-1).geometry.type, 'Polygon', 'the circle shows as an overlay while it is drawn');
  await c.map.pointer('up', [-3.01, 53.41]);
  assert.match(c.said(), /A circle of radius 1\.11 km\. Name it/, 'a screen reader hears the radius');
  const name = c.input('Name');
  assert.equal(document.activeElement, name, 'the name field takes the focus');
  await c.type(name, '  Pier <img src=x onerror=alert(1)> <b>four</b>  ');
  await click(c.button('Save'));
  assert.equal(c.sent.length, 1);
  const { action, context } = c.sent[0];
  assert.equal(action, 'area.add');
  assert.equal(context.shape, 'circle');
  assert.equal(context.name, 'Pier <img src=x onerror=alert(1)> <b>four</b>', 'trimmed, otherwise as typed');
  assert.equal(context.geometry.type, 'Polygon');
  const ring = context.geometry.coordinates[0];
  assert.equal(ring.length, 65, '64 vertices and the closing point');
  assert.ok(closed(ring));
  assert.ok(ring.every(p => decimals(p[0]) <= 6 && decimals(p[1]) <= 6));
  assert.deepEqual(context.center, [-3.01, 53.4]);
  assert.ok(Math.abs(context.radiusMeters - 1111.9) < 0.2, String(context.radiusMeters));
  assert.deepEqual(Object.keys(context).sort(), ['center', 'geometry', 'name', 'radiusMeters', 'shape']);
  assert.ok(ring.every(p => Math.abs(ui.distanceMeters(context.center, p) - context.radiusMeters) < 0.5), 'the ring agrees with the centre and the radius it travels with');
  assert.equal(c.map.calls.sketches.at(-1), undefined, 'after Save the overlay clears');
  assert.equal(c.map.calls.drawing.at(-1), 'off');
  assert.equal(c.map.calls.focus, 1, 'focus returns to the map');
  const note = c.container.querySelector('.draw-sent');
  assert.equal(note.textContent, 'Sent “Pier <img src=x onerror=alert(1)> <b>four</b>”.', 'the name shows as text');
  assert.equal(c.container.querySelector('img, b'), null, 'never as markup');
  assert.ok(!c.map.listening(), 'the control stops hearing the pointer');
  await c.unmount();
});

test('a polygon by clicks closes on a double-click, Enter or the first corner; Backspace takes a corner back', async () => {
  const c = await control({ action: 'area.add', shapes: ['polygon'] });
  await click(c.button('Draw an area'));
  assert.equal(c.button('Circle'), undefined, 'only the shapes the design allows');
  await click(c.button('Polygon'));
  const clickAt = async p => { await c.map.pointer('down', p); await c.map.pointer('up', p); };
  await clickAt([10, 50]);
  await clickAt([10.1, 50]);
  await clickAt([10.05, 50.2]);
  await key(document.body, 'Backspace');
  assert.match(c.said(), /Corner removed: 2 corners/);
  await clickAt([10.1, 50.1]);
  await clickAt([10.1, 50.1]);   // a double-click's second click
  await c.map.pointer('dblclick', [10.1, 50.1]);
  assert.ok(c.input('Name'), 'the double-click closed it');
  await c.type(c.input('Name'), 'Quay');
  await click(c.button('Save'));
  assert.deepEqual(c.sent[0].context, { shape: 'polygon', name: 'Quay', geometry: { type: 'Polygon', coordinates: [[[10, 50], [10.1, 50], [10.1, 50.1], [10, 50]]] } });
  // Enter, and a click on the first corner
  await click(c.button('Draw an area'));
  await click(c.button('Polygon'));
  for (const p of [[0, 0], [0, 1], [1, 1]]) await clickAt(p);
  await key(document.body, 'Enter');
  assert.ok(c.input('Name'), 'Enter closed it');
  await click(c.button('Cancel'));
  await click(c.button('Draw an area'));
  await click(c.button('Polygon'));
  for (const p of [[0, 0], [0, 1], [1, 1], [0.0001, 0.0001]]) await clickAt(p);
  assert.ok(c.input('Name'), 'a click on the first corner closed it');
  assert.match(c.container.querySelector('.draw-readout').textContent, /Polygon, 3 corners/);
  await c.unmount();
});

test('Escape while placing and Cancel while naming send nothing, and focus returns to the map', async () => {
  const c = await control({ action: 'area.add' });
  await click(c.button('Draw an area'));
  await click(c.button('Polygon'));
  await c.map.pointer('down', [0, 0]); await c.map.pointer('up', [0, 0]);
  await key(document.body, 'Escape');
  assert.equal(c.container.querySelector('[data-draw]').dataset.draw, 'idle');
  assert.equal(c.map.calls.sketches.at(-1), undefined, 'the overlay clears');
  assert.equal(c.map.calls.focus, 1);
  await click(c.button('Draw an area'));
  await click(c.button('Circle'));
  await c.map.pointer('down', [0, 0]); await c.map.pointer('move', [0, 0.1]); await c.map.pointer('up', [0, 0.1]);
  await c.type(c.input('Name'), 'Not this one');
  await click(c.button('Cancel'));
  assert.equal(c.map.calls.focus, 2);
  await click(c.button('Draw an area'));
  await click(c.button('Circle'));
  await c.map.pointer('down', [0, 0]); await c.map.pointer('move', [0, 0.1]); await c.map.pointer('up', [0, 0.1]);
  await key(c.input('Name'), 'Escape');
  assert.equal(c.container.querySelector('[data-draw]').dataset.draw, 'idle', 'Escape in the name field cancels too');
  assert.deepEqual(c.sent, [], 'nothing was sent');
  assert.equal(c.container.querySelector('.draw-sent'), null);
  await c.unmount();
});

test('maxVertices stops the corners, and the name is required, trimmed and at most 80 characters', async () => {
  const c = await control({ action: 'area.add', maxVertices: 3 });
  await click(c.button('Draw an area'));
  await click(c.button('Polygon'));
  for (const p of [[0, 0], [1, 0], [1, 1], [0, 1]]) { await c.map.pointer('down', p); await c.map.pointer('up', p); }
  assert.match(c.said(), /At most 3 corners/);
  assert.match(c.container.querySelector('.draw-hint').textContent, /3 of at most 3 corners/);
  await click(c.button('Finish'));
  const name = c.input('Name');
  await c.type(name, '    ');
  await click(c.button('Save'));
  assert.equal(c.container.querySelector('[role="alert"]').textContent, 'Give the area a name.');
  assert.equal(name.getAttribute('aria-invalid'), 'true');
  await c.type(name, 'x'.repeat(81));
  await click(c.button('Save'));
  assert.equal(c.container.querySelector('[role="alert"]').textContent, 'A name is at most 80 characters.');
  assert.deepEqual(c.sent, []);
  await c.type(name, ' Triangle ');
  await click(c.button('Save'));
  assert.equal(c.sent[0].context.name, 'Triangle');
  assert.equal(c.sent[0].context.geometry.coordinates[0].length, 4, 'three corners and the closing point');
  await c.unmount();
});

test('from the keyboard, D\'s request opens the map\'s centre choice, and a circle there takes its radius in a field (GEO-Q-40)', async () => {
  const c = await control({ action: 'area.add' });
  await c.ask(1);
  const centre = c.button('Circle at the map\'s centre');
  assert.equal(document.activeElement, centre, 'the centre choice has the focus');
  await click(centre);
  const radius = c.input('Radius in metres');
  assert.equal(document.activeElement, radius, 'the radius field takes the focus');
  assert.equal(radius.value, '1000');
  assert.match(c.said(), /A circle at the map's centre, radius 1\.00 km/);
  await c.type(radius, '5');
  assert.equal(radius.getAttribute('aria-invalid'), 'true', 'under the least radius');
  await c.type(radius, '2500');
  assert.match(c.container.textContent, /2\.50 km/);
  await c.type(c.input('Name'), 'Around the centre');
  await click(c.button('Save'));
  const { context } = c.sent[0];
  assert.deepEqual(context.center, [-3.012346, 53.408765], 'the centre to 6 decimals');
  assert.equal(context.radiusMeters, 2500);
  assert.equal(context.geometry.coordinates[0].length, 65);
  assert.equal(c.map.calls.drawing.includes('pointer'), false, 'the keyboard\'s circle never takes the pointer');
  await c.unmount();
});

test('a GeoMap with a draw option draws as before where the map cannot draw', async () => {
  const actions = [];
  const envelopes = [
    { version: '1.0', createSurface: { surfaceId: 's', catalogId: 'agentspaces-geo' } },
    { version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'root', component: 'Column', children: ['m'] }, { id: 'm', component: 'GeoMap', layers: [{ path: '/f' }], draw: { action: 'area.add' } }] } },
    { version: '1.0', updateDataModel: { surfaceId: 's', path: '/', value: { f: [] } } },
  ];
  const m = await mount(React.createElement(ui.Surfaces, { envelopes, onAction: a => actions.push(a) }));
  const el = m.container.querySelector('[data-component="GeoMap"]');
  assert.equal(el.dataset.state, 'fallback');
  assert.equal(m.container.querySelector('.as-geomap-draw'), null, 'no control where no shape can be drawn');
  assert.doesNotMatch(el.querySelector('.canvas').getAttribute('aria-label'), /D draws/);
  assert.deepEqual(actions, []);
  await m.unmount();
});
