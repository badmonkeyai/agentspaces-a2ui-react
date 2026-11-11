// The DOM for the open renderer's tests: happy-dom as the global window, React's act environment on, and draw(), which
// renders Surfaces over envelopes into a container and flushes React.
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });
for (const k of Object.getOwnPropertyNames(window)) {
  if (k in globalThis || k === 'undefined' || k === 'globalThis') continue;
  try { Object.defineProperty(globalThis, k, { get: () => window[k], configurable: true }); } catch { /* read-only */ }
}
for (const k of ['window', 'document', 'navigator', 'location', 'history', 'localStorage']) Object.defineProperty(globalThis, k, { value: k === 'window' ? window : window[k], configurable: true, writable: true });
for (const k of ['Event', 'CustomEvent', 'EventTarget', 'MessageEvent', 'ErrorEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent', 'PointerEvent', 'UIEvent', 'AbortSignal', 'AbortController', 'HTMLElement', 'customElements']) {
  if (window[k]) Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
export const ui = await import('../dist/index.js');
export { React };

/** Renders an element; returns the container and the unmount. */
export async function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => { root.render(element); });
  await React.act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return { container, text: () => container.textContent ?? '', unmount: async () => { await React.act(async () => root.unmount()); container.remove(); } };
}

/** Renders Surfaces over the envelopes; returns the container, the actions taken, and the problems the processor met. */
export async function draw(envelopes, options = {}) {
  const actions = [];
  const problems = [];
  const surfaces = React.createElement(ui.Surfaces, { envelopes, onAction: a => actions.push(a), onProblem: p => problems.push(p), mode: options.mode ?? 'light' });
  const m = await mount(options.wrap ? options.wrap(surfaces) : surfaces);
  return { ...m, actions, problems };
}

export function envelope(surfaceId, components, data, catalogId = 'agentspaces-viz') {
  const out = [
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
    { version: 'v0.9.1', updateComponents: { surfaceId, components: [{ id: 'root', component: 'Column', children: components.filter(c => !c.inner).map(c => c.id) }, ...components.map(({ inner, ...c }) => c)] } },
  ];
  if (data) out.push({ version: 'v0.9.1', updateDataModel: { surfaceId, path: '/', value: data } });
  return out;
}

/** A key press on an element, flushed. */
export async function key(el, k, more = {}) {
  await React.act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more })); });
}

export async function click(el) {
  await React.act(async () => { el.click(); });
}
