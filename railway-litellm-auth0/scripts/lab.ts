import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { root, local, readConfig, validateIdentity, type LabConfig } from './settings.ts';

process.chdir(root);
mkdirSync(local, { recursive: true, mode: 0o700 });
const command = process.argv[2] ?? 'help';
const railwayBin = path.join(root, 'node_modules/.bin/railway');
const statePath = path.join(local, 'railway-state.json');
const save = (file: string, value: unknown) => {
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(file, 0o600);
};
function run(exe: string, args: string[], capture = false): string {
  if (capture) return execFileSync(exe, args, { cwd: root, env: process.env, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim();
  const r = spawnSync(exe, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${path.basename(exe)} failed (exit ${r.status})`);
  return '';
}
function rw(args: string[], capture = false) { return run(railwayBin, args, capture); }
function state() {
  if (!existsSync(statePath)) throw new Error('No owned project state. Run railway-create first.');
  return JSON.parse(readFileSync(statePath, 'utf8')) as { projectId: string; projectName: string; environmentId: string };
}
function status() { return JSON.parse(rw(['status', '--json'], true)); }
function assertTarget(c: LabConfig) {
  const s = state(); const live = status();
  if (live.id !== s.projectId || live.name !== s.projectName || c.projectName !== s.projectName) {
    throw new Error('The linked project does not match this lab’s recorded project; refusing to modify it');
  }
  return s;
}
function terraform(c: LabConfig, operation: string) {
  if (process.env.AUTH0_DOMAIN !== c.auth0Domain) throw new Error('AUTH0_DOMAIN must match auth0Domain in .local/config.json');
  const vars = path.join(local, 'auth0.tfvars.json');
  save(vars, { name: c.projectName, audience: c.audience, scope: c.scope, redirect_port: c.redirectPort });
  const args = [`-chdir=${path.join(root, 'infra/auth0')}`];
  run('terraform', [...args, 'init', '-input=false']);
  run('terraform', [...args, operation, `-var-file=${vars}`]);
  if (operation === 'apply') {
    c.oauthClientId = run('terraform', [...args, 'output', '-raw', 'client_id'], true);
    save(path.join(local, 'config.json'), c);
    console.log('Saved the native OAuth client ID. Create test users in the lab Auth0 connection shown by Terraform.');
  }
}

try {
  if (command === 'help') {
    console.log(`Commands:
  init                 Generate local configuration and stable internal secrets
  auth0-plan           Preview the dedicated Auth0 application, API, and connection
  auth0-apply           Apply Auth0 resources and save the native client ID
  auth0-destroy        Destroy ONLY the Auth0 resources owned by this Terraform state
  railway-create       Create and record a fresh Railway project
  plan                 Preview Railway infrastructure changes
  up                   Apply infrastructure, upload both services, create gateway domain
  down --confirm ID    Delete this lab's recorded Railway project and all its data
  codex-config         Generate a standalone Codex TOML for review
  codex-install        Back up and switch your actual Codex TOML to this lab
  codex-restore        Restore original TOML, refusing to overwrite subsequent edits
  smoke                Browser OAuth + streaming, refresh, and tool-loop checks (uses API credit)
  status               Show recorded Railway project and public gateway URL
See README.md for first-time setup and validation.`);
  } else if (command === 'init') {
    const file = path.join(local, 'config.json');
    if (!existsSync(file)) save(file, JSON.parse(readFileSync(path.join(root, 'config.example.json'), 'utf8')));
    if (!existsSync(path.join(root, '.env'))) {
      writeFileSync(path.join(root, '.env'), `OPENAI_API_KEY=\nLITELLM_MASTER_KEY=sk-${randomBytes(32).toString('hex')}\nLITELLM_SALT_KEY=${randomBytes(32).toString('hex')}\nGATEWAY_KEY_SEED=${randomBytes(32).toString('hex')}\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nAUTH0_DOMAIN=\nAUTH0_CLIENT_ID=\nAUTH0_CLIENT_SECRET=\n`, { mode: 0o600 });
    }
    console.log('Local config and secrets are ready. Edit .local/config.json and .env; existing files were preserved.');
  } else if (command.startsWith('codex-')) {
    const action = { 'codex-config': 'render', 'codex-install': 'install', 'codex-restore': 'restore' }[command];
    if (!action) throw new Error('Unknown Codex command');
    if (action !== 'restore') validateIdentity(readConfig());
    run('python3', ['scripts/codex-config.py', action]);
  } else {
    const c = readConfig();
    if (command.startsWith('auth0-')) {
      const op = command.slice(6);
      if (!['plan', 'apply', 'destroy'].includes(op)) throw new Error('Unknown Auth0 command');
      terraform(c, op);
    } else if (command === 'railway-create') {
      validateIdentity(c);
      if (existsSync(statePath)) throw new Error('Lab already owns a project. Use up or down, not another create.');
      // railway init always creates a new project; never adopt an arbitrary linked project.
      rw(['init', '--name', c.projectName]);
      const live = status();
      const environments = live.environments?.edges?.map((e: any) => e.node) ?? [];
      const environment = environments.find((e: any) => e.name === 'production');
      if (!live.id || live.name !== c.projectName || !environment?.id) throw new Error('Project was created but its ID/environment could not be recorded. Inspect railway status --json before retrying.');
      save(statePath, { projectId: live.id, projectName: live.name, environmentId: environment.id });
      console.log('Recorded project ' + live.id);
    } else if (command === 'plan' || command === 'up') {
      validateIdentity(c);
      const s = assertTarget(c);
      rw(['config', command === 'plan' ? 'plan' : 'apply', '--file', path.join(root, '.railway/railway.ts'),
        '--environment', s.environmentId, ...(command === 'up' ? ['--yes'] : [])]);
      if (command === 'up') {
        rw(['up', 'litellm', '--path-as-root', '--service', 'litellm', '--project', s.projectId, '--environment', s.environmentId, '--ci']);
        rw(['up', '.', '--path-as-root', '--service', 'gateway', '--project', s.projectId, '--environment', s.environmentId, '--ci']);
        const domains = JSON.parse(rw(['domain', '--service', 'gateway', '--project', s.projectId, '--environment', s.environmentId, '--port', '8080', '--json'], true));
        const domain = domains.domain ?? domains.domains?.[0]?.domain ?? domains.domains?.[0];
        if (typeof domain !== 'string') throw new Error('Inspect railway domain list --service gateway --json; set gatewayUrl in .local/config.json');
        const domainUrl = new URL(domain.startsWith('https://') ? domain : 'https://' + domain);
        if (!domainUrl.hostname.endsWith('.up.railway.app') || domainUrl.username || domainUrl.password) throw new Error('Unexpected Railway domain');
        c.gatewayUrl = domainUrl.origin;
        save(path.join(local, 'config.json'), c);
        let ready = false;
        for (let i = 0; i < 60; i++) {
          try { const r = await fetch(c.gatewayUrl + '/readyz', { signal: AbortSignal.timeout(5000) }); await r.body?.cancel(); if (r.ok) { ready = true; break; } } catch {}
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        if (!ready) throw new Error('Deployment not ready after five minutes. Inspect Railway logs; project state was retained for retry.');
        console.log(`Gateway is ready: ${c.gatewayUrl}\nNext: npm run lab -- codex-config`);
      }
    } else if (command === 'down') {
      const s = assertTarget(c);
      if (process.argv[3] !== '--confirm' || process.argv[4] !== s.projectId) throw new Error(`Deletion removes ALL project services and data. Run: npm run lab -- down --confirm ${s.projectId}`);
      rw(['delete', '--project', s.projectId, '--yes']);
      unlinkSync(statePath); c.gatewayUrl = ''; save(path.join(local, 'config.json'), c);
      console.log('Railway project deleted. Auth0 and your local Codex config remain; use codex-restore as needed.');
    } else if (command === 'smoke') {
      const { smoke } = await import('./smoke.ts'); await smoke(c);
    } else if (command === 'status') {
      console.log(JSON.stringify({ ...state(), gatewayUrl: c.gatewayUrl }, null, 2));
    } else throw new Error('Unknown command. Run npm run lab -- help');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Command failed');
  process.exitCode = 1;
}
