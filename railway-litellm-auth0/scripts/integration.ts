import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { root } from './settings.ts';

const project = 'codex-lab-test-' + randomBytes(5).toString('hex');
const compose = ['compose', '-p', project, '-f', 'tests/integration/compose.yaml'];
const docker = (args: string[], capture = false) => execFileSync('docker', [...compose, ...args], {
  cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
});
try {
  docker(['up', '--build', '--wait', '--wait-timeout', '360']);
  const dbPort = docker(['port', 'postgres', '5432'], true).trim().split(':').at(-1);
  const llmPort = docker(['port', 'litellm', '4000'], true).trim().split(':').at(-1);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/integration/identity.test.ts'], {
    cwd: root, stdio: 'inherit', env: { ...process.env,
      TEST_DATABASE_URL: `postgresql://postgres:test-password-only@127.0.0.1:${dbPort}/litellm`,
      TEST_LITELLM_URL: `http://127.0.0.1:${llmPort}`,
    },
  });
  process.exitCode = result.status ?? 1;
} catch {
  process.exitCode = 1;
  console.error('Local integration environment failed. Inspect container startup output; no cloud calls were made.');
  try { docker(['logs', '--tail', '60']); } catch {}
} finally { docker(['down', '--volumes', '--remove-orphans']); }
