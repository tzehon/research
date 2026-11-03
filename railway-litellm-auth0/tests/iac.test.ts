import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRailwayContext, project } from 'railway/iac';
import program from '../.railway/railway.ts';
import { railwayEnvironment } from '../scripts/railway-cli.ts';

test('IaC declares one private database volume and sends provider credentials only to LiteLLM', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'railway-iac-test-'));
  const saved = { ...process.env };
  try {
    const config = { ...JSON.parse(readFileSync('config.example.json', 'utf8')), auth0Domain: 'tenant.auth0.com', oauthClientId: 'native-id' };
    const file = path.join(dir, 'config.json'); writeFileSync(file, JSON.stringify(config));
    Object.assign(process.env, { LAB_CONFIG_PATH: file, OPENAI_API_KEY: 'sk-test-only',
      LITELLM_MASTER_KEY: 'sk-master-test-only', LITELLM_SALT_KEY: 'salt-test-only',
      POSTGRES_PASSWORD: 'a'.repeat(32), GATEWAY_KEY_SEED: 'b'.repeat(32) });
    const definition = await program(createRailwayContext(), project);
    const resources = definition.resources as any[];
    assert.equal(resources.length, 4);
    assert.equal(resources.filter(r => r.type === 'volume').length, 1);
    const serialized = JSON.stringify(definition);
    assert.equal(serialized.split('sk-test-only').length - 1, 1);
    const gateway = resources.find(r => r.name === 'gateway');
    const postgres = resources.find(r => r.name === 'postgres');
    assert.ok(gateway && postgres);
    assert.ok(!JSON.stringify(gateway).includes('sk-test-only'));
    assert.ok(!JSON.stringify(postgres).includes('tcpProxies'));
    assert.ok(serialized.includes('RAILWAY_PRIVATE_DOMAIN'));
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved); rmSync(dir, { recursive: true, force: true });
  }
});

// Exercise the SDK's actual native-evaluation guard, not just its normal module import.
// These flags and source markers match the evaluator in Railway CLI 5.71.0.
test('native IaC evaluation checks Railway rather than an inherited npm Node launcher', () => {
  const source = `
    const mod = await import(${JSON.stringify(import.meta.resolve('railway/iac'))});
    const partial = mod.partial;
    const graph = { versionCheckPassed: true };
    process.stdout.write(JSON.stringify({ partial, project: graph }));
  `;
  const args = ['--experimental-strip-types', '--input-type=module', '-e', source];
  const inherited = { ...process.env, _: process.execPath };
  const broken = spawnSync(process.execPath, args, { env: inherited, encoding: 'utf8', timeout: 15000 });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /requires Railway CLI 5\.42\.1 or newer/);

  const fixed = spawnSync(process.execPath, args, {
    env: railwayEnvironment(inherited), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.deepEqual(JSON.parse(fixed.stdout), { project: { versionCheckPassed: true } });
  assert.equal(inherited._, process.execPath, 'do not mutate the parent process environment');
});
