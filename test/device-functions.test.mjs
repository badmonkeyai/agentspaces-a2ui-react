// A2UI 1.0's catalog functions run on the device. The basic catalog's validate and format with no
// message to the agent; a host's device function a person must start (a location) runs only inside an action the person
// pressed, its answer carried in the action's context, and is refused in a binding, where nobody pressed anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { mount, click, React, ui } from './setup.mjs';

const BASIC = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
let located = 0;
ui.registerFunctions('device-test', [ui.createFunctionImplementation(
  { name: 'whereAmI', returnType: 'object', schema: z.object({}), allowedCallers: 'rendererOnly', requiresUserActivation: true, description: 'the device\'s location, after a press' },
  async () => { located += 1; return { latitude: 50.1, longitude: -1.4 }; })]);
ui.registerAlias('device-test', []);

async function page(envelopes) {
  const heard = { actions: [], problems: [], calls: [] };
  const m = await mount(React.createElement(ui.Surfaces, { envelopes, onAction: a => heard.actions.push(a), onProblem: p => heard.problems.push(p), onFunctionCall: c => { heard.calls.push(c); return true; } }));
  await React.act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return { ...m, heard };
}

test('a field checks and a value formats on the device, with no message to the agent', async () => {
  const { container, heard } = await page([
    { version: '1.0', createSurface: { surfaceId: 'f', catalogId: BASIC } },
    { version: '1.0', updateComponents: { surfaceId: 'f', components: [
      { id: 'root', component: 'Column', children: ['email', 'total'] },
      { id: 'email', component: 'TextField', label: 'Email', value: { '@path': '/email' },
        '@checks': [{ condition: { '@call': 'email', args: { value: { '@path': '/email' } } }, message: 'Write an email address.' }] },
      { id: 'total', component: 'Text', text: { '@call': 'formatCurrency', args: { value: { '@path': '/total' }, currency: 'USD' } } },
    ] } },
    { version: '1.0', updateDataModel: { surfaceId: 'f', path: '/', value: { email: 'not-an-address', total: 12.5 } } },
  ]);
  assert.match(container.textContent, /\$12\.50/);
  assert.match(container.textContent, /Write an email address\./);
  assert.deepEqual(heard.calls, [], 'nothing went to the agent');
  assert.deepEqual(heard.problems, []);
});

test('a location runs only when the person presses, and its answer rides in the action', async () => {
  located = 0;
  const { container, heard } = await page([
    { version: '1.0', createSurface: { surfaceId: 'd', catalogId: 'device-test' } },
    { version: '1.0', updateComponents: { surfaceId: 'd', components: [
      { id: 'root', component: 'Column', children: ['share'] },
      { id: 'share', component: 'Button', child: 'shareText', action: { event: { name: 'located', context: { where: { '@call': 'whereAmI' } } } } },
      { id: 'shareText', component: 'Text', text: 'Share my location' },
    ] } },
  ]);
  assert.equal(located, 0, 'drawing the button asks for nothing');
  const b = [...container.querySelectorAll('button')].find(x => /Share my location/.test(x.textContent));
  assert.ok(b);
  await click(b);
  await React.act(async () => { await new Promise(r => setTimeout(r, 10)); });
  assert.equal(located, 1);
  assert.equal(heard.actions.length, 1);
  assert.equal(heard.actions[0].name, 'located');
  assert.deepEqual(heard.actions[0].context.where, { latitude: 50.1, longitude: -1.4 });
  assert.deepEqual(heard.calls, [], 'the device answered; the agent was not called');
});

test('a binding that calls the location is refused: nobody pressed anything', async () => {
  located = 0;
  const { container, heard } = await page([
    { version: '1.0', createSurface: { surfaceId: 'p', catalogId: 'device-test' } },
    { version: '1.0', updateComponents: { surfaceId: 'p', components: [
      { id: 'root', component: 'Text', text: { '@call': 'formatString', args: { value: 'at ${whereAmI()}' } } },
    ] } },
  ]);
  await React.act(async () => { await new Promise(r => setTimeout(r, 10)); });
  assert.equal(located, 0, 'the location never ran');
  assert.ok(heard.problems.length > 0 || !/50\.1/.test(container.textContent), 'refused, not drawn');
});
