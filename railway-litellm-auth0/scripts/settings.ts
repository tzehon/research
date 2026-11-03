import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const local = path.join(root, '.local');
export interface LabConfig {
  projectName: string; region: string; volumeSizeMB?: number; models: string[]; defaultModel: string;
  auth0Domain: string; oauthClientId: string; audience: string; scope: string;
  redirectPort: number; gatewayUrl: string; userBudgetUsd: number; userRpmLimit: number;
}
export function readConfig(): LabConfig {
  const c = JSON.parse(readFileSync(process.env.LAB_CONFIG_PATH ?? path.join(local, 'config.json'), 'utf8')) as LabConfig;
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(c.projectName)) throw new Error('Use a projectName of 3–41 lowercase letters, digits, and hyphens');
  if (!Array.isArray(c.models) || !c.models.length || c.models.some(m => typeof m !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(m))) throw new Error('models must contain OpenAI model IDs');
  if (!c.models.includes(c.defaultModel)) throw new Error('defaultModel must be in models');
  if (!/^[a-zA-Z0-9.-]+\.auth0\.com$/.test(c.auth0Domain)) throw new Error('Use your Auth0 tenant domain, without https://');
  if (!Number.isInteger(c.redirectPort) || c.redirectPort < 1024 || c.redirectPort > 65535) throw new Error('Invalid callback port');
  if (!(c.userBudgetUsd > 0) || !Number.isInteger(c.userRpmLimit) || c.userRpmLimit <= 0) throw new Error('Budgets and rate limits must be positive');
  if (!c.audience || !c.scope || /\s/.test(c.scope)) throw new Error('Set audience and one scope');
  if (c.volumeSizeMB !== undefined && (!Number.isInteger(c.volumeSizeMB) || c.volumeSizeMB < 500)) throw new Error('volumeSizeMB must be an integer of at least 500, within your Railway plan limit');
  return c;
}
export function validateIdentity(c: LabConfig) {
  if (c.auth0Domain.startsWith('YOUR-') || c.oauthClientId.startsWith('SET-') || !c.oauthClientId) {
    throw new Error('Configure Auth0 first: set auth0Domain, then run auth0-apply (or supply a public native client ID)');
  }
}
export function secret(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env`);
  if (name === 'POSTGRES_PASSWORD' && !/^[A-Za-z0-9_-]{32,}$/.test(value)) throw new Error('Use the generated URL-safe POSTGRES_PASSWORD (at least 32 characters)');
  return value;
}
