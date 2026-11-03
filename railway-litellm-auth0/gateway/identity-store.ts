import { createHash, createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError, type Identity } from './auth.ts';

export interface UserKeys { get(identity: Identity): Promise<string> }
export interface KeySettings {
  baseUrl: string; masterKey: string; seed: string; models: string[];
  budgetUsd: number; rpmLimit: number;
}

export function userKey(seed: string, id: string) {
  return 'sk-' + createHmac('sha256', seed).update(id).digest('hex');
}

export class IdentityStore implements UserKeys {
  constructor(private pool: Pool, private settings: KeySettings, private request = fetch) {
    if (settings.seed.length < 32) throw new Error('GATEWAY_KEY_SEED must contain at least 32 characters');
    if (!Number.isFinite(settings.budgetUsd) || settings.budgetUsd <= 0 ||
        !Number.isInteger(settings.rpmLimit) || settings.rpmLimit <= 0) throw new Error('Budget and rate limit must be positive');
  }

  async initialize() {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS gateway_lab;
      CREATE TABLE IF NOT EXISTS gateway_lab.identities (
        id text PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL,
        key_fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(issuer, subject)
      )`);
  }

  private async call(path: string, key: string, body?: unknown) {
    return this.request(this.settings.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  }

  async get(identity: Identity): Promise<string> {
    const key = userKey(this.settings.seed, identity.id);
    const fingerprint = createHash('sha256').update(key).digest('hex');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL lock_timeout = '25s'");
      // Serializes first login across replicas; nothing secret is stored in this table.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity.id]);
      const existing = await db.query('SELECT key_fingerprint FROM gateway_lab.identities WHERE id = $1', [identity.id]);
      if (existing.rowCount) {
        if (existing.rows[0].key_fingerprint !== fingerprint) {
          throw new Error('Gateway key seed changed while retaining database state');
        }
        // Never recreate a deleted/revoked key for an already provisioned identity.
        await db.query('COMMIT');
        return key;
      }
      const info = await this.call('/user/info?user_id=' + encodeURIComponent(identity.id), this.settings.masterKey);
      // The pinned release returns 404 for an unknown user; also tolerate user_info:null.
      const user = info.ok ? await info.json() as { user_info?: unknown } : null;
      if (!info.ok) await info.body?.cancel();
      if (!info.ok && info.status !== 404) throw new Error('LiteLLM user lookup failed');
      if (!user?.user_info) {
        const created = await this.call('/user/new', this.settings.masterKey, {
          user_id: identity.id, user_alias: identity.id,
          user_role: 'internal_user', auto_create_key: false,
          models: this.settings.models, max_budget: this.settings.budgetUsd,
          budget_duration: '30d',
        });
        if (!created.ok) throw new Error('LiteLLM user provisioning failed');
        await created.body?.cancel();
      }
      // Deterministic key lets a retry recover if the process died after key creation.
      const probe = await this.call('/v1/models', key);
      await probe.body?.cancel();
      if (!probe.ok) {
        if (![401, 403].includes(probe.status)) throw new Error('LiteLLM key lookup failed');
        const created = await this.call('/key/generate', this.settings.masterKey, {
          key, user_id: identity.id, key_alias: identity.id,
          models: this.settings.models, key_type: 'llm_api',
          max_budget: this.settings.budgetUsd, budget_duration: '30d', rpm_limit: this.settings.rpmLimit,
        });
        if (!created.ok) throw new Error('LiteLLM key provisioning failed');
        await created.body?.cancel();
      }
      await db.query('INSERT INTO gateway_lab.identities (id, issuer, subject, key_fingerprint) VALUES ($1,$2,$3,$4)',
        [identity.id, identity.issuer, identity.subject, fingerprint]);
      await db.query('COMMIT');
      return key;
    } catch (cause) {
      await db.query('ROLLBACK').catch(() => {});
      throw new HttpError(503, 'User provisioning is unavailable; contact the lab administrator', { cause });
    } finally { db.release(); }
  }
}
