import { defineRailway, image, project, service, volume } from 'railway/iac';
import { readConfig, secret, validateIdentity } from '../scripts/settings.ts';

export default defineRailway(() => {
  const c = readConfig();
  validateIdentity(c);
  const data = volume('postgres-data', { region: c.region, sizeMB: 1024 });
  const db = service('postgres', {
    source: image('postgres:17.6-alpine'), replicas: { [c.region]: 1 },
    volumeMounts: { '/var/lib/postgresql/data': data },
    env: {
      POSTGRES_USER: 'litellm', POSTGRES_DB: 'litellm', POSTGRES_PASSWORD: secret('POSTGRES_PASSWORD'),
      PGDATA: '/var/lib/postgresql/data/pgdata',
      DATABASE_URL: 'postgresql://litellm:${{postgres.POSTGRES_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/litellm',
    },
  });
  const litellm = service('litellm', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    replicas: { [c.region]: 1 }, healthcheck: '/health/liveliness', healthcheckTimeout: 300,
    env: {
      PORT: '4000', DATABASE_URL: db.env.DATABASE_URL,
      ALLOWED_MODELS: JSON.stringify(c.models), OPENAI_API_KEY: secret('OPENAI_API_KEY'),
      LITELLM_MASTER_KEY: secret('LITELLM_MASTER_KEY'), LITELLM_SALT_KEY: secret('LITELLM_SALT_KEY'),
    },
  });
  const gateway = service('gateway', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    replicas: { [c.region]: 1 }, healthcheck: '/readyz', healthcheckTimeout: 300,
    env: {
      PORT: '8080', DATABASE_URL: db.env.DATABASE_URL,
      LITELLM_URL: 'http://${{litellm.RAILWAY_PRIVATE_DOMAIN}}:4000',
      LITELLM_MASTER_KEY: secret('LITELLM_MASTER_KEY'), GATEWAY_KEY_SEED: secret('GATEWAY_KEY_SEED'),
      ALLOWED_MODELS: JSON.stringify(c.models), OIDC_ISSUER: `https://${c.auth0Domain}/`,
      OIDC_AUDIENCE: c.audience, OIDC_CLIENT_ID: c.oauthClientId, OIDC_SCOPE: c.scope,
      USER_BUDGET_USD: String(c.userBudgetUsd), USER_RPM_LIMIT: String(c.userRpmLimit),
    },
  });
  return project(c.projectName, { resources: [data, db, litellm, gateway] });
});
