// The one chat. Its thread in the viewer's zone and in
// order, the visitor's own thread and its secret (sent with the page's write alone), the progress of a line in the A2A
// words with its steps, "The agent stopped" with Retry when the progress lapses mid-answer, Markdown answers that run
// nothing and whose code copies, attachment and citation chips that open the preview, files attached by the tree's Ask
// about and by a drop, the controls, and a draft that survives a redraw.
process.env.TZ = 'America/New_York';
const { React, mount, ui, click } = await import('./setup.mjs');
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

const SA = '5ec7e7'.repeat(8); const A = 'a5f53b357bd9f7f0c470629b51394da0';
const q3 = { id: 'f-q3', name: 'q3-expenses.csv', mediaType: 'text/csv', bytes: 1840, root: 'r-q3', path: 'data/q3-expenses.csv', by: 'ana' };
const question = { id: 'm-1', key: 'main', from: { kind: 'person', name: 'ana' }, text: 'Where did we overspend?', attachments: ['f-q3'], inReplyTo: '', at: '2026-11-10T14:00:30Z' };
const working = { id: 'progress-m-1', key: 'main', inReplyTo: 'm-1', agent: 'workbench', state: 'working', at: '2026-11-10T14:00:31Z',
  steps: [{ label: 'read q3-expenses.csv', kind: 'read', ref: 'f-q3', at: '2026-11-10T14:00:31Z' }, { label: 'asked the model', kind: 'tool', ref: '', at: '2026-11-10T14:00:32Z' }] };

/** A page whose envelopes grow: `push` adds envelopes and redraws, as the feed's stream does. */
async function page(initial, components = [{ id: 'chat', component: 'Chat', agent: 'workbench', key: 'main', attach: true, controls: ['copy', 'retry', 'stop', 'feedback'], preview: 'preview' },
  { id: 'preview', component: 'FilePreview', file: { path: '/selected/file' } }], catalogId = 'agentspaces-widgets') {
  const actions = [];
  let set;
  const base = [
    { version: 'v0.9.1', createSurface: { surfaceId: 'wb', catalogId } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'wb', components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'wb', path: '/', value: initial } },
  ];
  function Host() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }); }
  const m = await mount(React.createElement(Host));
  const push = async value => { await React.act(async () => { set(e => [...e, { version: 'v0.9.1', updateDataModel: { surfaceId: 'wb', path: '/', value } }]); }); };
  return { ...m, actions, push };
}
const press = async (container, words) => {
  const b = [...container.querySelectorAll('button')].find(x => x.textContent.trim() === words);
  assert.ok(b, `a button "${words}" (${[...container.querySelectorAll('button')].map(x => x.textContent.trim()).join(' | ')})`);
  await click(b);
};
const type = async (input, value) => {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('the thread is in order of time and reply, in the viewer\'s zone, as a log; the visitor sees their own thread', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const rows = [
    { id: 'g-1', key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Hello', inReplyTo: 'm-0', at: '2026-11-10T14:00:00Z' },
    { id: 'm-0', key: 'main:' + A, from: { kind: 'person', name: 'visitor' }, text: 'hi', at: '2026-11-10T14:00:00Z' },
    { id: 'b-1', key: 'main:6cb0cbb61229cf99f27bc9eaa95b0509', from: { kind: 'person', name: 'visitor' }, text: 'another visitor', at: '2026-11-10T14:00:01Z' },
  ];
  // the lines are from today, so each time reads without its day whatever day the test runs on
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-10T20:00:00Z');
  try {
    const { container, unmount } = await page({ conversations: rows });
    const log = container.querySelector('[role="log"]');
    assert.equal(log.getAttribute('aria-live'), 'polite', 'the thread announces new lines politely');
    assert.deepEqual([...log.querySelectorAll('.line .text')].map(t => t.textContent), ['hi', 'Hello'], 'the reply after its line; another visitor\'s thread is not drawn');
    assert.deepEqual([...log.querySelectorAll('.line time')].map(t => t.textContent), ['09:00', '09:00'], 'New York time');
    assert.equal(log.querySelector('.line.person .meta b').textContent, 'you');
    await unmount();
  } finally {
    Date.now = realNow;
  }
});

test('a line goes out through the page\'s write with the secret; a design\'s own writeAction never carries it', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const own = await page({ conversations: [] });
  await type(own.container.querySelector('input[aria-label="message"]'), 'hello');
  await React.act(async () => { own.container.querySelector('form.send').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(own.actions[0].name, 'write');
  assert.deepEqual(own.actions[0].context, { type: 'ChatMessage', entry: { key: 'main', text: 'hello', inReplyTo: '', attachments: [], secret: SA } });
  await own.unmount();
  for (const [component, catalog] of [[{ id: 'chat', component: 'Chat', key: 'main', writeAction: 'ask', suggestions: ['Hello'] }, 'agentspaces-widgets'],
    [{ id: 'chat', component: 'Conversation', lines: '/conversations', key: 'main', writeAction: 'ask' }, 'agentspaces-viz']]) {
    const p = await page({ conversations: [] }, [component], catalog);
    await type(p.container.querySelector('input[aria-label="message"]'), 'hello');
    await React.act(async () => { p.container.querySelector('form.send').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(p.actions[0].name, 'ask', component.component);
    assert.equal(JSON.stringify(p.actions).includes(SA), false, component.component + ' carries no secret into an action');
    assert.equal('secret' in p.actions[0].context.entry, false);
    await p.unmount();
  }
});

test('a line\'s progress reads in the A2A words with its steps, and Stop asks the agent to stop', async () => {
  const { container, actions, push, unmount } = await page({ conversations: [question], files: [q3], progress: [{ ...working, state: 'submitted', steps: [] }] });
  const status = () => container.querySelector('.as-chat-progress[role="status"]');
  assert.equal(status().querySelector('span').textContent, 'submitted');
  await push({ conversations: [question], files: [q3], progress: [working] });
  assert.equal(status().querySelector('span').textContent, 'working: asked the model', 'the last step');
  await press(container, '2 steps');
  assert.deepEqual([...status().querySelectorAll('ol li')].map(li => li.textContent), ['read: read q3-expenses.csv', 'tool: asked the model']);
  await press(container, 'Stop');
  assert.deepEqual(actions.at(-1).context, { line: 'm-1', key: 'main' });
  assert.equal(actions.at(-1).name, 'chat.stop');
  await push({ conversations: [question], files: [q3], progress: [{ ...working, state: 'input-required' }] });
  assert.equal(status().querySelector('span').textContent, 'needs your input');
  await unmount();
});

test('a progress that lapses while working reads "The agent stopped", and Retry asks again in reply to the line', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const { container, actions, push, unmount } = await page({ conversations: [question], files: [q3], progress: [working] });
  await push({ conversations: [question], files: [q3], progress: [] });
  assert.ok(container.querySelector('.as-chat-progress.as-state-stopped'), 'stopped');
  assert.equal(container.querySelector('.as-chat-progress span').textContent, 'The agent stopped');
  await press(container, 'Retry');
  assert.deepEqual(actions.at(-1).context.entry, { key: 'main', text: 'Where did we overspend?', inReplyTo: 'm-1', attachments: ['f-q3'], secret: SA });
  const answer = { id: 'm-2', key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Travel.', inReplyTo: 'm-1', at: '2026-11-10T14:01:00Z' };
  await push({ conversations: [question, answer], files: [q3], progress: [] });
  assert.equal(container.querySelector('.as-chat-progress'), null, 'an answered line shows no progress');
  await push({ conversations: [question, answer], files: [q3], progress: [{ ...working, state: 'completed' }] });
  assert.equal(container.querySelector('.as-chat-progress[role="status"]'), null, 'no status once answered');
  await press(container, '2 steps');
  assert.deepEqual([...container.querySelectorAll('.as-chat-progress ol li')].map(li => li.textContent), ['read: read q3-expenses.csv', 'tool: asked the model'],
    'the steps the agent took stay under the answered line while they stand');
  await unmount();
});

test('a Markdown answer runs nothing, its links are safe, and its code copies', async () => {
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { copied.push(t); } }, configurable: true });
  const md = 'Travel ran **18 percent** over.\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [data](data:text/html,x) [good](https://example.com)\n\n```\nSELECT 1;\n```';
  const answer = { id: 'm-2', key: 'main', from: { kind: 'agent', name: 'workbench' }, text: md, inReplyTo: 'm-1', at: '2026-11-10T14:01:00Z', format: 'text/markdown', cites: [] };
  const { container, unmount } = await page({ conversations: [question, answer], files: [q3] });
  const bubble = container.querySelector('.line.agent .text');
  assert.equal(bubble.querySelector('strong').textContent, '18 percent');
  assert.equal(bubble.querySelector('script'), null, 'no raw HTML');
  const links = [...bubble.querySelectorAll('a')];
  assert.deepEqual(links.map(a => a.getAttribute('href')), ['https://example.com'], 'only the https link has an address');
  assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
  await press(container, 'Copy');
  assert.deepEqual(copied, ['SELECT 1;\n'], 'the code block copies its code');
  await unmount();
});

test('attachment and citation chips name their files and open the preview', async () => {
  const answer = { id: 'm-2', key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Travel.', inReplyTo: 'm-1', at: '2026-11-10T14:01:00Z',
    format: 'text/markdown', cites: [{ file: 'f-q3', path: 'data/q3-expenses.csv', name: 'q3-expenses.csv' }] };
  const { container, unmount } = await page({ conversations: [question, answer], files: [q3] });
  const chips = [...container.querySelectorAll('.as-chat-chip')];
  assert.deepEqual(chips.map(c => c.getAttribute('aria-label')), ['Attachment: q3-expenses.csv', 'Source: q3-expenses.csv']);
  assert.ok(container.textContent.includes('Pick a file to preview'));
  await click(chips[1]);
  assert.ok(container.querySelector('.as-preview-name')?.textContent === 'q3-expenses.csv', 'the citation opens the file in the preview');
  await unmount();
});

test('a file from the tree\'s Ask about and a dropped file ride with the next line', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const { container, actions, unmount } = await page({ conversations: [], files: [q3, { id: 'f-new', name: 'new.md', mediaType: 'text/markdown', bytes: 10, root: 'r-n' }] });
  await React.act(async () => { assert.equal(ui.attachToChat('wb', 'chat', 'f-q3'), true); });
  assert.ok(container.querySelector('.as-chat-pending').textContent.includes('q3-expenses.csv'));
  ui.uploaders.set('wb', async () => ({ status: 202, body: JSON.stringify({ id: 'f-new' }) }));
  const file = new window.File(['# new'], 'new.md', { type: 'text/markdown' });
  await React.act(async () => {
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
    container.querySelector('.as-chat').dispatchEvent(drop);
    await new Promise(r => setTimeout(r, 0));
  });
  assert.ok(container.querySelector('.as-chat-pending').textContent.includes('new.md'), 'the drop is attached');
  await type(container.querySelector('input[aria-label="message"]'), 'compare them');
  await React.act(async () => { container.querySelector('form.send').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual(actions.at(-1).context.entry.attachments, ['f-q3', 'f-new']);
  assert.equal(container.querySelector('.as-chat-pending'), null, 'sent: nothing pending');
  ui.uploaders.delete('wb');
  await unmount();
});

test('an answer\'s controls copy, retry the question, and say good or poor', async () => {
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { copied.push(t); } }, configurable: true });
  const answer = { id: 'm-2', key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Travel.', inReplyTo: 'm-1', at: '2026-11-10T14:01:00Z' };
  const { container, actions, unmount } = await page({ conversations: [question, answer], files: [q3] });
  await press(container, 'Copy');
  assert.deepEqual(copied, ['Travel.']);
  await press(container, 'Retry');
  assert.equal(actions.at(-1).name, 'write');
  assert.equal(actions.at(-1).context.entry.inReplyTo, 'm-1', 'a new line in reply to the same question');
  assert.equal(actions.at(-1).context.entry.text, 'Where did we overspend?');
  await click(container.querySelector('button[aria-label="A poor answer"]'));
  assert.deepEqual([actions.at(-1).name, actions.at(-1).context], ['chat.feedback', { line: 'm-2', key: 'main', value: 'down' }]);
  await unmount();
});

test('a draft survives a redraw of the chat', async () => {
  const first = await page({ conversations: [] });
  await type(first.container.querySelector('input[aria-label="message"]'), 'half a thought');
  await first.unmount();
  const second = await page({ conversations: [] });
  assert.equal(second.container.querySelector('input[aria-label="message"]').value, 'half a thought');
  await second.unmount();
});

test('a host\'s extra draws under each agent line', async () => {
  ui.registerChatExtra((line, ctx) => (line.id === 'm-2' ? React.createElement('span', { className: 'served' }, 'served by ' + String(ctx.get('/served') ?? '')) : null));
  const answer = { id: 'm-2', key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Travel.', inReplyTo: 'm-1', at: '2026-11-10T14:01:00Z' };
  const { container, unmount } = await page({ conversations: [question, answer], files: [q3], served: 'mock-chat' });
  assert.equal(container.querySelector('.line.agent .as-chat-extras .served').textContent, 'served by mock-chat');
  assert.equal(container.querySelectorAll('.line.person .as-chat-extras').length, 0, 'a person\'s line carries none');
  await unmount();
});

