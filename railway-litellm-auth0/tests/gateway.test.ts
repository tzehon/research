import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, type JWTVerifyGetKey } from 'jose';
import { verifier, HttpError } from '../gateway/auth.ts';
import { userKey } from '../gateway/identity-store.ts';
import { createGateway } from '../gateway/app.ts';

const settings = { issuer: 'https://tenant.auth0.com/', audience: 'https://gateway-lab', clientId: 'codex-native', scope: 'llm:invoke' };
let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
before(async () => {
  const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256' }] });
});
async function token(overrides: Record<string, unknown> = {}, signingKey = privateKey) {
  return new SignJWT({ iss: settings.issuer, aud: settings.audience, sub: 'auth0|alice',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
    azp: settings.clientId, scope: 'openid llm:invoke', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(signingKey);
}
async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return 'http://127.0.0.1:' + (server.address() as { port: number }).port;
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }

test('same authenticated subject has stable identity across token refresh; users remain separate', async () => {
  const verify = verifier(settings, keys);
  const alice = await verify('Bearer ' + await token());
  const refreshed = await verify('Bearer ' + await token({ iat: Math.floor(Date.now() / 1000) + 1 }));
  const bob = await verify('Bearer ' + await token({ sub: 'auth0|bob' }));
  assert.equal(alice.id, refreshed.id); assert.notEqual(alice.id, bob.id);
  assert.equal(userKey('a'.repeat(32), alice.id), userKey('a'.repeat(32), refreshed.id));
  assert.notEqual(userKey('a'.repeat(32), alice.id), userKey('a'.repeat(32), bob.id));
});

for (const [name, overrides, status] of [
  ['expired token', { exp: 1 }, 401], ['wrong issuer', { iss: 'https://other.auth0.com/' }, 401],
  ['wrong audience / ID token', { aud: settings.clientId }, 401], ['wrong client', { azp: 'other' }, 403],
  ['missing scope', { scope: 'openid' }, 403], ['machine token', { sub: 'abc@clients' }, 403],
  ['missing expiry', { exp: undefined }, 401], ['future token', { nbf: 9999999999 }, 401],
] as const) test(`reject ${name}`, async () => {
  await assert.rejects(verifier(settings, keys)('Bearer ' + await token(overrides)), (e: unknown) => e instanceof HttpError && e.status === status);
});
test('reject invalid signature, missing token, and duplicate header', async () => {
  const other = await generateKeyPair('RS256'); const verify = verifier(settings, keys);
  await assert.rejects(verify('Bearer ' + await token({}, other.privateKey)));
  await assert.rejects(verify(undefined));
  await assert.rejects(verify('Bearer token, Bearer token'));
});

test('forward SSE incrementally and strip client credentials/attribution', async () => {
  let forwarded: any;
  let finish!: () => void;
  const hold = new Promise<void>(resolve => { finish = resolve; });
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    forwarded = { headers: req.headers, body: JSON.parse(raw) };
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Set-Cookie': 'internal=secret' });
    res.write('event: response.output_text.delta\ndata: {"delta":"hello"}\n\n');
    await hold;
    res.end('event: response.completed\ndata: {"response":{"status":"completed"}}\n\n');
  });
  const upstreamUrl = await listen(upstream);
  const gateway = createGateway({ baseUrl: upstreamUrl, models: ['lab-model'] }, {
    authenticate: verifier(settings, keys), keys: { get: async () => 'sk-private-user-key' }, ready: async () => {},
  });
  const url = await listen(gateway);
  try {
    const response = await fetch(url + '/v1/responses', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Gateway-Token': 'Bearer ' + await token(),
      Authorization: 'Bearer private-chatgpt-token', Cookie: 'session=private', 'ChatGPT-Account-ID': 'private-account',
    }, body: JSON.stringify({ model: 'lab-model', input: 'hello', stream: true, api_key: 'attacker-key',
      api_base: 'https://attacker.invalid', user: 'someone-else', metadata: { user_api_key_user_id: 'someone-else' }, store: true }) });
    const reader = response.body!.getReader();
    const first = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SSE was buffered')), 1000).unref())]);
    assert.match(new TextDecoder().decode(first.value), /response.output_text.delta/);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(forwarded.headers.authorization, 'Bearer sk-private-user-key');
    for (const h of ['x-gateway-token', 'cookie', 'chatgpt-account-id']) assert.equal(forwarded.headers[h], undefined);
    for (const field of ['api_key', 'api_base', 'metadata']) assert.equal(forwarded.body[field], undefined);
    assert.match(forwarded.body.user, /^oidc-/); assert.equal(forwarded.body.store, false);
    finish(); let rest = ''; while (true) { const c = await reader.read(); if (c.done) break; rest += new TextDecoder().decode(c.value); }
    assert.match(rest, /response.completed/);
  } finally { finish(); await close(gateway); await close(upstream); }
});

test('block admin routes, model overrides, missing tokens, and oversized requests before upstream', async () => {
  let count = 0;
  const gateway = createGateway({ baseUrl: 'http://unused', models: ['lab-model'], maxBodyBytes: 128 }, {
    authenticate: verifier(settings, keys), keys: { get: async () => { count++; return 'sk-test'; } }, ready: async () => {},
  });
  const url = await listen(gateway);
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Gateway-Token': 'Bearer ' + await token() };
    assert.equal((await fetch(url + '/key/generate', { method: 'POST', headers, body: '{}' })).status, 404);
    assert.equal((await fetch(url + '/v1/models')).status, 401);
    assert.equal((await fetch(url + '/v1/responses', { method: 'POST', headers, body: '{"model":"other"}' })).status, 403);
    assert.equal((await fetch(url + '/v1/responses', { method: 'POST', headers, body: JSON.stringify({ model: 'lab-model', input: 'x'.repeat(200) }) })).status, 413);
    assert.equal(count, 0);
  } finally { await close(gateway); }
});

test('preserve rate-limit status and Retry-After through gateway', async () => {
  const gateway = createGateway({ baseUrl: 'http://unused', models: ['lab-model'] }, {
    authenticate: verifier(settings, keys), keys: { get: async () => 'sk-test' }, ready: async () => {},
    request: async () => new Response('{"error":{"message":"rate limited"}}', { status: 429, headers: { 'Retry-After': '20', 'Content-Type': 'application/json' } }),
  });
  const url = await listen(gateway);
  try {
    const response = await fetch(url + '/v1/models', { headers: { 'X-Gateway-Token': 'Bearer ' + await token() } });
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '20');
  } finally { await close(gateway); }
});
