// GEO-V-07: a component's action may call one of the drawing agent's functions (A2UI 1.0's callAgentFunction). The
// press hands the host 1.0's callAgentFunction with the arguments resolved against the data model; the agent's
// agentFunctionResponse, arriving among the envelopes, settles the call by its functionCallId; a call with no answer in
// time is reported; a renderer's own function stays the renderer's, and a page that sends no calls fails one at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, click, React, ui } from './setup.mjs';

const BASIC = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

function harbour(action) {
  return [
    { version: '1.0', createSurface: { surfaceId: 'port', catalogId: BASIC } },
    { version: '1.0', updateComponents: { surfaceId: 'port', components: [
      { id: 'root', component: 'Column', children: ['lookUp'] },
      { id: 'lookUp', component: 'Button', child: 'lookUpText', action },
      { id: 'lookUpText', component: 'Text', text: 'Look up' },
    ] } },
    { version: '1.0', updateDataModel: { surfaceId: 'port', path: '/', value: { selected: 'Aurora' } } },
  ];
}

const BERTH_OF = { functionCall: { '@call': 'berthOf', args: { vessel: { '@path': '/selected' }, limit: 3 } } };

/** Surfaces whose envelopes the test appends to, with what the host heard. */
async function page(envelopes, props = {}) {
  const heard = { calls: [], results: [], problems: [], actions: [] };
  let setLog;
  function Host() {
    const [log, set] = React.useState(envelopes);
    setLog = set;
    return React.createElement(ui.Surfaces, {
      envelopes: log, onAction: a => heard.actions.push(a), onProblem: p => heard.problems.push(p),
      onFunctionCall: c => { heard.calls.push(c); return props.send ? props.send(c) : true; },
      onFunctionResult: r => heard.results.push(r), functionTimeoutMs: props.timeout,
    });
  }
  const host = React.createElement(props.noHost ? NoHost : Host);
  const m = await mount(props.strict ? React.createElement(React.StrictMode, null, host) : host);
  function NoHost() {
    const [log, set] = React.useState(envelopes);
    setLog = set;
    return React.createElement(ui.Surfaces, { envelopes: log, onAction: a => heard.actions.push(a), onProblem: p => heard.problems.push(p), onFunctionResult: r => heard.results.push(r) });
  }
  const append = async e => { await React.act(async () => { setLog(prev => [...prev, e]); }); await React.act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
  const settle = async (ms = 0) => { await React.act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
  return { ...m, heard, append, settle };
}

const button = c => [...c.querySelectorAll('button')].find(b => b.textContent.includes('Look up'));

test('a press calls the agent function with its arguments resolved, and the answer settles it', async () => {
  const p = await page(harbour(BERTH_OF));
  await click(button(p.container));
  await p.settle();
  assert.equal(p.heard.calls.length, 1);
  const call = p.heard.calls[0];
  assert.equal(call.version, '1.0');
  assert.equal(call.callAgentFunction.surfaceId, 'port');
  assert.deepEqual(call.callAgentFunction.callFunction, { '@call': 'berthOf', args: { vessel: 'Aurora', limit: 3 } });
  const id = call.callAgentFunction.functionCallId;
  assert.ok(typeof id === 'string' && id.length > 0);
  assert.equal(p.heard.actions.length, 0, 'a call is no action of the host');
  // an answer for another call settles nothing
  await p.append({ version: '1.0', agentFunctionResponse: { functionCallId: 'not-ours', value: 1 } });
  assert.equal(p.heard.results.length, 0);
  await p.append({ version: '1.0', agentFunctionResponse: { functionCallId: id, value: { berth: 'B4' } } });
  assert.deepEqual(p.heard.results, [{ surfaceId: 'port', functionCallId: id, function: 'berthOf', value: { berth: 'B4' } }]);
  assert.deepEqual(p.heard.problems, []);
  // the agent's error: reported to the host as the call's outcome, not as a renderer problem
  await click(button(p.container));
  await p.settle();
  const second = p.heard.calls[1].callAgentFunction.functionCallId;
  assert.notEqual(second, id, 'each press is a call of its own');
  await p.append({ version: '1.0', agentFunctionResponse: { functionCallId: second, error: { code: 'NOT_FOUND', message: 'No vessel Aurora in port.' } } });
  assert.deepEqual(p.heard.results[1], { surfaceId: 'port', functionCallId: second, function: 'berthOf', error: { code: 'NOT_FOUND', message: 'No vessel Aurora in port.' } });
  assert.deepEqual(p.heard.problems, []);
  await p.unmount();
});

test('a call with no answer in time is reported, and a late answer changes nothing', async () => {
  const p = await page(harbour(BERTH_OF), { timeout: 40 });
  await click(button(p.container));
  await p.settle(80);
  assert.equal(p.heard.results.length, 1);
  assert.equal(p.heard.results[0].error.code, 'TIMEOUT');
  assert.ok(p.heard.problems.some(x => x.includes('berthOf') && x.includes('no answer within 40 ms')), p.heard.problems.join('; '));
  await p.append({ version: '1.0', agentFunctionResponse: { functionCallId: p.heard.calls[0].callAgentFunction.functionCallId, value: 'late' } });
  assert.equal(p.heard.results.length, 1, 'the late answer settles nothing');
  await p.unmount();
});

test('a send the host refuses, and a page with no host for calls, fail the call at once', async () => {
  const refused = await page(harbour(BERTH_OF), { send: () => false });
  await click(button(refused.container));
  await refused.settle();
  assert.equal(refused.heard.results[0].error.code, 'SEND_FAILED');
  assert.ok(refused.heard.problems.some(x => x.includes('was not sent')));
  await refused.unmount();
  const none = await page(harbour(BERTH_OF), { noHost: true });
  await click(button(none.container));
  await none.settle();
  assert.equal(none.heard.results[0].error.code, 'SEND_FAILED');
  assert.ok(none.heard.problems.some(x => x.includes('sends no agent function calls')), none.heard.problems.join('; '));
  await none.unmount();
});

test("a renderer's own function and an event stay as they were", async () => {
  assert.deepEqual(ui.withAgentCalls({ id: 'b', action: { functionCall: { '@call': 'openUrl', args: { url: 'https://example.org' } } } }, 'P:').action.functionCall['@call'], 'openUrl');
  const event = { id: 'b', action: { event: { name: 'go' } } };
  assert.equal(ui.withAgentCalls(event, 'P:'), event, 'nothing changed, the same component');
  assert.deepEqual(ui.withAgentCalls({ id: 'b', action: { functionCall: { '@call': 'berthOf' } } }, 'P:').action, { event: { name: 'P:berthOf', context: {} } });
  assert.equal(ui.withAgentCalls({ id: 'b', action: { functionCall: { '@call': 'x', catalogId: 'c' } } }, 'P:').action.functionCall['@call'], 'x', 'a call naming a catalog stays web_core\'s');
  // an ordinary press still reaches the host as an action
  const p = await page(harbour({ event: { name: 'acknowledge', context: { vessel: { '@path': '/selected' } } } }));
  await click(button(p.container));
  await p.settle();
  assert.equal(p.heard.calls.length, 0);
  assert.equal(p.heard.actions[0].name, 'acknowledge');
  assert.deepEqual(p.heard.actions[0].context, { vessel: 'Aurora' });
  await p.unmount();
});

// A custom component that calls the agent itself through ctx.call and draws the answer. The host takes only a function
// some component action of the surface names (a call to any other is refused before it reaches the agent), so the
// surface also draws a button that names tideAt.
ui.registerComponents('test-tides', {
  TideReading: ui.define('TideReading', ({ ctx }) => {
    const [reading, setReading] = React.useState('');
    const read = () => ctx.call('tideAt', { hour: 9 }).then(v => setReading(`tide ${v} m`), e => setReading(`failed ${e.code ?? e.message}`));
    return React.createElement('button', { type: 'button', className: 'tide', onClick: read }, reading || 'Read the tide');
  }),
});

test('a component calls through ctx.call and draws the answer', async () => {
  const envelopes = [
    { version: '1.0', createSurface: { surfaceId: 'port', catalogId: 'test-tides' } },
    { version: '1.0', updateComponents: { surfaceId: 'port', components: [
      { id: 'root', component: 'Column', children: ['reading', 'tide'] },
      { id: 'reading', component: 'TideReading' },
      { id: 'tide', component: 'Button', child: 'tideText', action: { functionCall: { '@call': 'tideAt', args: { hour: 9 } } } },
      { id: 'tideText', component: 'Text', text: 'Tide at nine' },
    ] } },
  ];
  const p = await page(envelopes);
  assert.ok(ui.agentFunctions.get('port'), 'the drawn surface has a caller');
  const reading = p.container.querySelector('button.tide');
  assert.ok(reading, p.container.innerHTML);
  await click(reading);
  await p.settle();
  const sent = p.heard.calls.at(-1).callAgentFunction;
  assert.equal(sent.surfaceId, 'port');
  assert.deepEqual(sent.callFunction, { '@call': 'tideAt', args: { hour: 9 } });
  await p.append({ version: '1.0', agentFunctionResponse: { functionCallId: sent.functionCallId, value: 2.4 } });
  await p.settle();
  assert.equal(p.container.querySelector('button.tide').textContent, 'tide 2.4 m');
  assert.deepEqual(p.heard.results.at(-1), { surfaceId: 'port', functionCallId: sent.functionCallId, function: 'tideAt', value: 2.4 });
  await p.unmount();
  assert.equal(ui.agentFunctions.get('port'), undefined, 'the caller goes with the surface');
});

// React's StrictMode runs every effect's cleanup and setup again in a development build, on the same memoized processor:
// the cleanup must not dispose it, or every call fails at once with DISPOSED and nothing is sent (review of 2026-11-13)
test('under StrictMode a press still sends the call and the answer settles it', async () => {
  const p = await page(harbour(BERTH_OF), { strict: true });
  await click(button(p.container));
  await p.settle();
  assert.equal(p.heard.calls.length, 1, `the call was sent; results: ${JSON.stringify(p.heard.results)}`);
  const id = p.heard.calls[0].callAgentFunction.functionCallId;
  await p.append({ version: '1.0', agentFunctionResponse: { functionCallId: id, value: { berth: 'B4' } } });
  assert.deepEqual(p.heard.results, [{ surfaceId: 'port', functionCallId: id, function: 'berthOf', value: { berth: 'B4' } }]);
  // an unmount still disposes it: a call waiting then is settled, not left to time out on a page that is gone
  await click(button(p.container));
  await p.settle();
  await p.unmount();
  await p.settle();
  assert.equal(p.heard.results.length, 2);
  assert.equal(p.heard.results[1].error.code, 'CANCELLED');
  assert.deepEqual(p.heard.problems, []);
});
