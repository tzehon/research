import pg from 'pg';
import { verifier } from './auth.ts';
import { IdentityStore } from './identity-store.ts';
import { createGateway } from './app.ts';

function required(name: string) {
  const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value;
}
const models: string[] = JSON.parse(required('ALLOWED_MODELS'));
if (!models.length || models.some(m => typeof m !== 'string' || !m)) throw new Error('ALLOWED_MODELS must be a nonempty string array');
const baseUrl = required('LITELLM_URL').replace(/\/$/, '');
const pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 10, connectionTimeoutMillis: 10000 });
pool.on('error', () => console.error('Database pool connection failed'));
const keys = new IdentityStore(pool, {
  baseUrl, models, masterKey: required('LITELLM_MASTER_KEY'), seed: required('GATEWAY_KEY_SEED'),
  budgetUsd: Number(required('USER_BUDGET_USD')), rpmLimit: Number(required('USER_RPM_LIMIT')),
});
await keys.initialize();
const server = createGateway({ baseUrl, models }, {
  keys,
  authenticate: verifier({ issuer: required('OIDC_ISSUER'), audience: required('OIDC_AUDIENCE'),
    clientId: required('OIDC_CLIENT_ID'), scope: required('OIDC_SCOPE') }),
  ready: async () => {
    await pool.query('SELECT 1');
    const response = await fetch(baseUrl + '/health/liveliness', { signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    if (!response.ok) throw new Error('LiteLLM unavailable');
  },
});
server.listen(Number(process.env.PORT ?? 8080), '::', () => console.log('Gateway listening'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => { void pool.end().then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
});
