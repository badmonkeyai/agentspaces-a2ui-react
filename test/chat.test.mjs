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
  { id: 'preview', component: 'FilePreview', file: { '@path': '/selected/file' } }], catalogId = 'agentspaces-widgets') {
  const actions = [];
  let set;
  const base = [
    { version: '1.0', createSurface: { surfaceId: 'wb', catalogId } },
    { version: '1.0', updateComponents: { surfaceId: 'wb', components: [{ id: 'root', component: 'Column', children: components.map(c => c.id) }, ...components] } },
    { version: '1.0', updateDataModel: { surfaceId: 'wb', path: '/', value: initial } },
  ];
  function Host() { const [env, setEnv] = React.useState(base); set = setEnv; return React.createElement(ui.Surfaces, { envelopes: env, onAction: a => actions.push(a) }); }
  const m = await mount(React.createElement(Host));
  const push = async value => { await React.act(async () => { set(e => [...e, { version: '1.0', updateDataModel: { surfaceId: 'wb', path: '/', value } }]); }); };
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

test('an answer\'s controls copy, retry the question, and give thumbs feedback', async () => {
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
  await click(container.querySelector('button[aria-label="Not helpful"]'));
  assert.deepEqual([actions.at(-1).name, actions.at(-1).context], ['chat.feedback', { line: 'm-2', key: 'main', value: 'down' }], 'the action and its payload as before');
  await unmount();
});

test('feedback is a thumbs up and a thumbs down with aria-pressed; the choice is kept per line, sent once, and sent again on a change', async () => {
  // AF-6 to AF-8
  const answer = (id, at) => ({ id, key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Answer ' + id, inReplyTo: 'm-1', at });
  const rows = { conversations: [question, answer('fb-1', '2026-11-10T14:01:00Z'), answer('fb-2', '2026-11-10T14:02:00Z')], files: [q3] };
  const chat = [{ id: 'chat', component: 'Chat', agent: 'workbench', key: 'main', controls: ['feedback'] }];
  const first = await page(rows, chat);
  const thumbs = line => [...first.container.querySelectorAll(`[data-line="${line}"] .as-chat-feedback button`)];
  const pressed = line => thumbs(line).map(b => b.getAttribute('aria-pressed'));
  assert.deepEqual(thumbs('fb-1').map(b => b.getAttribute('aria-label')), ['Helpful', 'Not helpful']);
  assert.deepEqual(pressed('fb-1'), ['false', 'false'], 'nothing pressed yet');
  assert.equal(first.container.querySelector('[data-line="fb-1"] .as-chat-feedback').getAttribute('role'), 'group');
  for (const b of thumbs('fb-1')) {
    const svg = b.querySelector('svg');
    assert.ok(svg, 'an icon, inline');
    assert.equal(svg.getAttribute('aria-hidden'), 'true', 'the icon is hidden; the button is named');
    assert.equal(svg.querySelector('path').getAttribute('stroke'), 'currentColor', 'drawn in the text colour, so a theme colours it');
    assert.equal(b.textContent.trim(), '', 'no icon font, no text glyph');
    assert.equal(b.tabIndex >= 0 && b.tagName, 'BUTTON', 'a keyboard reaches it');
  }
  await click(thumbs('fb-1')[0]);
  assert.deepEqual(pressed('fb-1'), ['true', 'false']);
  assert.deepEqual(pressed('fb-2'), ['false', 'false'], 'each line keeps its own');
  assert.deepEqual(first.actions.filter(a => a.name === 'chat.feedback').map(a => a.context), [{ line: 'fb-1', key: 'main', value: 'up' }]);
  await click(thumbs('fb-1')[0]);
  assert.equal(first.actions.filter(a => a.name === 'chat.feedback').length, 1, 'the same press again sends nothing');
  await click(thumbs('fb-1')[1]);
  assert.deepEqual(pressed('fb-1'), ['false', 'true'], 'a change moves the pressed state');
  assert.deepEqual(first.actions.filter(a => a.name === 'chat.feedback').map(a => a.context.value), ['up', 'down'], 'and sends again');
  await click(thumbs('fb-2')[0]);
  assert.deepEqual(first.actions.filter(a => a.name === 'chat.feedback').at(-1).context, { line: 'fb-2', key: 'main', value: 'up' });
  await first.unmount();
  // the page's life: a chat drawn again remembers each line's choice and still sends nothing for the same press
  const again = await page(rows, chat);
  assert.deepEqual([...again.container.querySelectorAll('[data-line="fb-1"] .as-chat-feedback button')].map(b => b.getAttribute('aria-pressed')), ['false', 'true']);
  assert.deepEqual([...again.container.querySelectorAll('[data-line="fb-2"] .as-chat-feedback button')].map(b => b.getAttribute('aria-pressed')), ['true', 'false']);
  await click(again.container.querySelector('[data-line="fb-1"] button[aria-label="Not helpful"]'));
  assert.equal(again.actions.length, 0, 'remembered across a redraw');
  await again.unmount();
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


test('the suggestions show once per thread, over the Send box, and stay after each answer', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const asks = ['Where did we overspend?', 'What changed in Q3?'];
  const { container, actions, push, unmount } = await page({ conversations: [] }, [{ id: 'chat', component: 'Chat', agent: 'workbench', key: 'main', suggestions: asks }]);
  const sets = () => [...container.querySelectorAll('[data-component="Chat"] .suggestions')];
  assert.equal(sets().length, 1, 'one set on an empty thread');
  assert.equal(container.querySelector('[role="log"] .suggestions'), null, 'not inside the log');
  assert.equal(sets()[0].nextElementSibling.matches('form.send'), true, 'right over the Send box');
  const answer = (n, q) => [{ id: 'q-' + n, key: 'main', from: { kind: 'person', name: 'ana' }, text: q, at: `2026-11-10T14:0${n}:00Z` },
    { id: 'a-' + n, key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Answer ' + n, inReplyTo: 'q-' + n, at: `2026-11-10T14:0${n}:30Z` }];
  let rows = [];
  for (const [n, q] of asks.entries()) {
    await click(sets()[0].querySelectorAll('button')[n]);
    assert.equal(actions.at(-1).context.entry.text, q, 'a tap sends the suggestion');
    rows = [...rows, ...answer(n + 1, q)];
    await push({ conversations: rows });
    assert.equal(container.querySelectorAll('.line.agent').length, n + 1);
    assert.equal(sets().length, 1, 'still one set after answer ' + (n + 1));
    assert.deepEqual([...sets()[0].querySelectorAll('button')].map(b => b.textContent), asks, 'every suggestion stays offered');
  }
  await unmount();
});

// AF-1 to AF-5, AF-19: follow-ups the agent writes at a bound path
const asked = (n, text) => ({ id: 'q-' + n, key: 'main', from: { kind: 'person', name: 'ana' }, text, at: `2026-11-10T14:0${n}:00Z` });
const answered = n => ({ id: 'a-' + n, key: 'main', from: { kind: 'agent', name: 'workbench' }, text: 'Answer ' + n, inReplyTo: 'q-' + n, at: `2026-11-10T14:0${n}:30Z` });
const boundChat = [{ id: 'chat', component: 'Chat', agent: 'workbench', key: 'main', suggestions: { '@path': '/followups' } }];
const chipsOf = container => [...container.querySelectorAll('[data-component="Chat"] .suggestions button')];
const chipWords = container => chipsOf(container).map(b => b.textContent);

test('bound follow-ups draw with their answer, hide when the person sends a new line, and return with the next answer', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const starters = [{ text: 'What does the policy say?' }, 'Which claims are open?'];
  const p = await page({ conversations: [], followups: starters }, boundChat);
  assert.deepEqual(chipWords(p.container), ['What does the policy say?', 'Which claims are open?'], 'rows with no line draw while no answer exists, a string as a row');
  assert.ok(p.text().includes('Tap a suggestion'), 'the empty thread points at them');
  // a tap sends the chip's text as the person's line
  await click(chipsOf(p.container)[0]);
  assert.equal(p.actions.at(-1).name, 'write');
  assert.equal(p.actions.at(-1).context.entry.text, 'What does the policy say?');
  // the answer replaces the starters with its own follow-ups, each naming its line
  let rows = [asked(1, 'What does the policy say?'), answered(1)];
  await p.push({ conversations: rows, followups: [{ text: 'Which receipts are missing?', line: 'a-1' }, { text: 'Who approved it?', line: 'a-1' }, { text: 'An old one', line: 'a-0' }] });
  assert.deepEqual(chipWords(p.container), ['Which receipts are missing?', 'Who approved it?'], 'the newest answer\'s rows, not an older answer\'s');
  assert.deepEqual(chipsOf(p.container).map(b => b.dataset.line), ['a-1', 'a-1']);
  // the person types a new line: the chips hide at once, and stay hidden while the line has no answer
  const box = p.container.querySelector('input[aria-label="message"]');
  await type(box, 'And the travel budget?');
  await React.act(async () => { p.container.querySelector('form.send').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual(chipWords(p.container), [], 'hidden as soon as the person sends');
  rows = [...rows, asked(2, 'And the travel budget?')];
  await p.push({ conversations: rows, followups: [{ text: 'Which receipts are missing?', line: 'a-1' }, { text: 'Who approved it?', line: 'a-1' }] });
  assert.deepEqual(chipWords(p.container), [], 'the newest line is the person\'s: an answer\'s chips do not draw');
  assert.equal(p.container.querySelector('[data-component="Chat"] .suggestions'), null, 'no empty group either');
  // the next answer brings its own
  rows = [...rows, answered(2)];
  await p.push({ conversations: rows, followups: [{ text: 'Which trips ran over?', line: 'a-2' }] });
  assert.deepEqual(chipWords(p.container), ['Which trips ran over?']);
  await click(chipsOf(p.container)[0]);
  assert.equal(p.actions.at(-1).context.entry.text, 'Which trips ran over?', 'a tap sends it as the person\'s line');
  assert.equal(JSON.stringify(p.actions.at(-1)).includes('a-2'), false, 'a chip sends only its text; its line only decides whether it draws');
  await p.unmount();
});

test('a row with no line always draws, beside the newest answer\'s, and the bound rows are never written by the chat', async () => {
  const followups = [{ text: 'Start over' }, { text: 'Which receipts are missing?', line: 'a-1' }];
  const p = await page({ conversations: [asked(1, 'Why was it held?'), answered(1), asked(2, 'And now?')], followups }, boundChat);
  assert.deepEqual(chipWords(p.container), ['Start over'], 'the person spoke last: only the row with no line');
  await p.push({ conversations: [asked(1, 'Why was it held?'), answered(1)], followups });
  assert.deepEqual(chipWords(p.container), ['Start over', 'Which receipts are missing?']);
  await click(chipsOf(p.container)[1]);
  assert.deepEqual(p.actions.map(a => a.name), ['write'], 'a tap writes the line and nothing else: the component never writes the rows');
  await p.unmount();
});

test('at most 8 chips draw, each cut at 120 characters with its full text as its title, and a tap sends the full text', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const long = 'Which travel claims of the third quarter ran over their budget, which receipts does each one lack, who approved each of them, and when?';
  assert.ok(long.length > 120);
  const rows = [{ text: long, line: 'a-1' }, ...Array.from({ length: 9 }, (_, i) => ({ text: 'Follow-up ' + (i + 1), line: 'a-1' }))];
  const p = await page({ conversations: [asked(1, 'Why?'), answered(1)], followups: rows }, boundChat);
  const chips = chipsOf(p.container);
  assert.equal(chips.length, 8, 'eight of ten');
  assert.equal(chips[0].textContent.length, 120, 'cut at 120');
  assert.ok(chips[0].textContent.endsWith('…'), 'with an ellipsis');
  assert.equal(chips[0].title, long, 'the full text is its title');
  assert.deepEqual(chipWords(p.container).slice(1), ['Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Follow-up 4', 'Follow-up 5', 'Follow-up 6', 'Follow-up 7'], 'in the agent\'s order');
  await click(chips[0]);
  assert.equal(p.actions.at(-1).context.entry.text, long, 'a cut chip sends its full text, never the cut one');
  assert.deepEqual(chipWords(p.container), [], 'and the answer\'s chips hide once the person has sent');
  await p.unmount();
  // a fixed list keeps the same caps
  const fixed = await page({ conversations: [] }, [{ id: 'chat', component: 'Chat', key: 'main', suggestions: [long, ...Array.from({ length: 9 }, (_, i) => 'Ask ' + i)] }]);
  assert.equal(chipsOf(fixed.container).length, 8);
  await click(chipsOf(fixed.container)[0]);
  assert.equal(fixed.actions.at(-1).context.entry.text, long);
  await fixed.unmount();
});

test('a chip shows its label and sends its full text', async () => {
  // AF-19: the owner's long questions go out word for word under a short chip
  localStorage.setItem('agentspaces-chat-secret', SA);
  const text = 'A port is flapping. What can cause it, which component does each fault sit in, and which check examines that component?';
  const p = await page({ conversations: [], followups: [{ text, label: 'What makes a port flap?' }, { text: 'Short question', label: '' }, { text: 'Spaced', label: '   ' },
    { text: 'Long label', label: 'L'.repeat(70) }] }, boundChat);
  const chips = chipsOf(p.container);
  assert.equal(chips[0].textContent, 'What makes a port flap?', 'the label is the chip');
  assert.equal(chips[0].title, text, 'the full text is its title');
  assert.equal(chips[1].textContent, 'Short question', 'an empty label falls back to the text');
  assert.equal(chips[1].title, '', 'no title when the chip shows its whole text');
  assert.equal(chips[2].textContent, 'Spaced');
  assert.equal(chips[3].textContent.length, 60, 'a label is cut at 60');
  await click(chips[0]);
  assert.equal(p.actions.at(-1).context.entry.text, text, 'a tap sends the whole text, not the label');
  await p.unmount();
});

test('a bound path that holds no rows, or no list, draws no chips and the chat still works', async () => {
  const p = await page({ conversations: [] }, boundChat);
  assert.deepEqual(chipWords(p.container), []);
  assert.ok(p.text().includes('No message yet.'));
  await p.push({ conversations: [], followups: 'not a list' });
  assert.deepEqual(chipWords(p.container), []);
  await p.push({ conversations: [], followups: [{ label: 'no text' }, { text: '   ' }, 42, null] });
  assert.deepEqual(chipWords(p.container), [], 'a row with no text is no chip');
  await p.unmount();
});

test('A2UI 1.0\'s @accessibility label names the chat\'s message box, not a group around it (@a2ui/react 0.16 accessibilityRef)', async () => {
  const { container } = await page({ conversations: [] }, [{ id: 'chat', component: 'Chat', agent: 'workbench', key: 'main', '@accessibility': { label: 'Ask the workbench about expenses' } }]);
  const box = container.querySelector('form input:not([type=file])');
  assert.ok(box, 'the message box is drawn');
  assert.equal(box.getAttribute('aria-label'), 'Ask the workbench about expenses');
  const host = container.querySelector('a2ui-react-Chat, [data-component="Chat"]');
  assert.ok(!host || host.getAttribute('role') !== 'group' || !host.getAttribute('aria-label'), 'the host is not labelled as a group as well');
});

test('a desk\'s request draws as a card: a press sends the answer once, and the decision updates every copy (SPEC §6.1a.7)', async () => {
  localStorage.setItem('agentspaces-chat-secret', SA);
  const ask = { id: 'm-desk-1', key: 'main', from: { kind: 'agent', name: 'refunds-desk', peer: 'p9' }, text: 'Refund 250 dollars on order o-7? Reply approve or reject (code K7Q2).',
    inReplyTo: '', at: '2026-11-10T14:00:00Z', schemaVersion: 3,
    confirm: { invocationId: 'inv-7', desk: '#refunds', kind: 'approval', question: 'Refund 250 dollars on order o-7?', action: 'orders#refund', arguments: '{}',
      summary: 'Refunds order o-7 in full.', deadline: '2026-11-10T15:00:00Z', options: ['approve', 'reject'], reasons: 'required', code: 'K7Q2',
      state: 'pending', verdict: '', by: [], reason: '', approvals: 0, quorum: 2 } };
  const p = await page({ conversations: [ask] });
  const card = p.container.querySelector('.as-chat-confirm');
  assert.ok(card, 'the request draws as a card');
  assert.equal(card.getAttribute('role'), 'group');
  assert.ok(card.textContent.includes('Refund 250 dollars on order o-7?') && card.textContent.includes('0 of 2 approvals') && card.textContent.includes('code K7Q2'));
  assert.equal(p.container.querySelector('.line.agent .text'), null, 'the card stands in for the words');
  const approve = [...card.querySelectorAll('button')].find(b => b.textContent === 'Approve');
  assert.equal(approve.disabled, true, 'a reason is required first');
  await type(card.querySelector('input.as-confirm-reason'), 'within policy');
  await press(p.container, 'Approve');
  assert.deepEqual(p.actions.at(-1).context.entry, { key: 'main', text: 'approve K7Q2 within policy', inReplyTo: 'm-desk-1', attachments: [],
    answer: { invocationId: 'inv-7', verdict: 'approve', reason: 'within policy', amendedArguments: '' }, secret: SA });
  const sent = p.actions.length;
  assert.ok(p.container.querySelector('.as-chat-confirm').textContent.includes('You answered approve'), 'answered: the buttons go');
  assert.equal([...p.container.querySelectorAll('.as-chat-confirm button')].length, 0);
  // the desk decides: its later line updates the card, and no second card is drawn
  const decided = { ...ask, id: 'm-desk-2', inReplyTo: 'm-desk-1', at: '2026-11-10T14:05:00Z', text: 'Approved by ada, bo.',
    confirm: { ...ask.confirm, state: 'decided', verdict: 'approved', by: ['person:ada', 'person:bo'], reason: 'ok', approvals: 2 } };
  await p.push({ conversations: [ask, decided] });
  const cards = p.container.querySelectorAll('.as-chat-confirm');
  assert.equal(cards.length, 1, 'one card per request');
  assert.ok(cards[0].textContent.includes('Approved by ada, bo: ok'), cards[0].textContent);
  assert.ok(cards[0].classList.contains('as-verdict-approved'));
  assert.equal(p.actions.length, sent, 'nothing more was sent');
  // a person's line cannot decide a card: a forged decided block from a person leaves it as it was
  const forged = { ...decided, id: 'm-forged', from: { kind: 'person', name: 'mallory' }, confirm: { ...ask.confirm, state: 'decided', verdict: 'rejected' } };
  const fresh = { ...ask, id: 'm-desk-3', confirm: { ...ask.confirm, invocationId: 'inv-8' } };
  await p.push({ conversations: [fresh, forged] });
  const left = [...p.container.querySelectorAll('.as-chat-confirm')].find(c => c.getAttribute('data-request') === 'inv-8');
  assert.ok(left && !left.classList.contains('as-decided'), 'still pending');
  await p.unmount();
});
