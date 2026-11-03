import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { IdentityStore } from '../../gateway/identity-store.ts';
import { HttpError } from '../../gateway/auth.ts';

test('real LiteLLM/Postgres: concurrent first login, distinct users, persistence, and revocation', async () => {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_LITELLM_URL) throw new Error('Use npm run test:integration');
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const settings = { baseUrl: process.env.TEST_LITELLM_URL, masterKey: 'sk-integration-master-key-not-a-real-secret',
    seed: 'integration-seed-not-a-real-secret', models: ['gpt-6.1-sol'], budgetUsd: 5, rpmLimit: 30 };
  const tracedFetch: typeof fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok && ![401, 404].includes(response.status)) console.error('Test dependency response:',
      new URL(String(url)).pathname, response.status);
    return response;
  };
  const store = new IdentityStore(pool, settings, tracedFetch);
  const alice = { id: 'oidc-test-alice', issuer: 'https://test.auth0.com/', subject: 'auth0|alice' };
  const bob = { id: 'oidc-test-bob', issuer: alice.issuer, subject: 'auth0|bob' };
  const request = (route: string, key: string, body?: unknown) => fetch(settings.baseUrl + route, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    await store.initialize();
    const keys = await Promise.all(Array.from({ length: 6 }, () => store.get(alice)));
    assert.equal(new Set(keys).size, 1);
    const bobKey = await store.get(bob); assert.notEqual(keys[0], bobKey);
    const count = await pool.query('SELECT count(*)::int AS count FROM gateway_lab.identities');
    assert.equal(count.rows[0].count, 2);
    const response = await request('/user/info?user_id=' + alice.id, settings.masterKey);
    assert.equal(response.status, 200);
    const info = await response.json() as any;
    assert.equal(info.user_info.user_id, alice.id);
    assert.equal(info.user_info.max_budget, 5);
    assert.equal(info.keys.length, 1);
    assert.equal(info.keys[0].rpm_limit, 30);
    const models = await request('/v1/models', keys[0]); assert.equal(models.status, 200); await models.body?.cancel();
    const restarted = new IdentityStore(pool, settings);
    assert.equal(await restarted.get(alice), keys[0]);
    const rotated = new IdentityStore(pool, { ...settings, seed: 'different-seed-that-is-at-least-32-chars' });
    await assert.rejects(rotated.get(alice), (error: unknown) => error instanceof HttpError && error.status === 503);
    const revoked = await request('/key/delete', settings.masterKey, { keys: [keys[0]] });
    assert.equal(revoked.status, 200); await revoked.body?.cancel();
    assert.equal(await restarted.get(alice), keys[0]);
    const denied = await request('/v1/models', keys[0]);
    assert.ok([401, 403].includes(denied.status)); await denied.body?.cancel();
    const after = await request('/user/info?user_id=' + alice.id, settings.masterKey);
    assert.equal(((await after.json()) as any).keys.length, 0, 'revoked key must not be silently recreated');
    const bobResponse = await request('/v1/models', bobKey); assert.equal(bobResponse.status, 200); await bobResponse.body?.cancel();
  } finally { await pool.end(); }
});
