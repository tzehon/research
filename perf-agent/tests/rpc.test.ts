import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rpc, publicEvent } from '../src/rpc.ts';
test('initialize acknowledgement is ordered; IDs match out-of-order replies and interleaved events', async () => {
  const sent: any[] = [];
  const rpc = new Rpc((m) => sent.push(m));
  const init = rpc.initialize();
  assert.equal(sent[0].method, 'initialize');
  assert.equal(sent.length, 1);
  rpc.receive(JSON.stringify({ id: sent[0].id, result: { userAgent: 'test' } }));
  await init;
  assert.equal(sent[1].method, 'initialized');
  const a = rpc.request('a'),
    b = rpc.request('b');
  let event = false;
  rpc.once('notification', () => (event = true));
  rpc.receive('{"method":"turn/started","params":{}}');
  rpc.receive(JSON.stringify({ id: sent[3].id, result: 'B' }));
  rpc.receive(JSON.stringify({ id: sent[2].id, result: 'A' }));
  assert.equal(await a, 'A');
  assert.equal(await b, 'B');
  assert.equal(event, true);
  rpc.disconnect();
});
test('server approval requests are separate from response matching', async () => {
  const rpc = new Rpc(() => {});
  let requested: any;
  rpc.on('request', (r) => (requested = r));
  rpc.receive(
    '{"id":7,"method":"item/commandExecution/requestApproval","params":{"reason":"escalation"}}'
  );
  assert.equal(requested.params.reason, 'escalation');
  rpc.disconnect();
});
test('RPC errors, timeout, malformed frames and process exit reject pending requests', async () => {
  const rpc = new Rpc(() => {});
  const error = rpc.request('test');
  rpc.receive('{"id":1,"error":{"code":-1,"message":"denied"}}');
  await assert.rejects(error, /denied/);
  await assert.rejects(rpc.request('slow', {}, 5), /outcome unknown/);
  const pending = rpc.request('in-flight');
  rpc.receive('not-json');
  await assert.rejects(pending, /Malformed/);
  await assert.rejects(rpc.request('after-close'), /disconnected/);
});
test('hidden reasoning never reaches dashboard, including turn completion payloads', () => {
  assert.equal(
    publicEvent({
      method: 'item/started',
      params: { item: { type: 'reasoning', content: ['secret'] } },
    }),
    null
  );
  const output = publicEvent({
    method: 'turn/completed',
    params: {
      turn: { id: 'x', status: 'completed', items: [{ type: 'reasoning', content: ['secret'] }] },
    },
  });
  assert.ok(!JSON.stringify(output).includes('secret'));
});
