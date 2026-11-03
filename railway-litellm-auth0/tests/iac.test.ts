import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRailwayContext, project } from 'railway/iac';
import program from '../.railway/railway.ts';

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
