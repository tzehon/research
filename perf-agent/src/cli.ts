import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { root, local, config, initLocal, urls } from './config.ts';
import { run, setupRepo, compose, waitReady } from './system.ts';
import { Store } from './state.ts';
import { Controller } from './controller.ts';
import { requireCodexVersion } from './codex-version.ts';
initLocal();
const c = config();
const runtime = path.join(local, 'runtime.json');
const lock = path.join(local, 'run.lock');
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function available(port: number) {
  return new Promise<void>((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () =>
      reject(new Error(`Port ${port} is occupied; stop its owner before starting the demo.`))
    );
    s.listen(port, '0.0.0.0', () => s.close(() => resolve()));
  });
}
export async function preflight() {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Node 24+ is required (node:sqlite).');
  const version = await run('codex', ['--version']);
  requireCodexVersion(version);
  await run('codex', ['login', 'status']);
  await run('git', ['--version']);
  await run('docker', ['--context', c.dockerContext, 'info', '--format', '{{.OperatingSystem}}']);
  if (!existsSync('/Applications/Google Chrome.app'))
    throw new Error('Install Google Chrome in /Applications for Chrome DevTools MCP.');
  const chromeVersion = await run('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--version',
  ]);
  if (Number(chromeVersion.match(/Chrome (\d+)/)?.[1] || 0) < 149)
    throw new Error('Chrome 149+ is required for the local browser URL allowlist.');
  await run('docker', ['--context', c.dockerContext, 'compose', 'version']);
  if (c.targetRemote) await run('gh', ['auth', 'status']);
}
async function request(action: string) {
  if (!existsSync(runtime)) return false;
  const r = JSON.parse(readFileSync(runtime, 'utf8'));
  if (!alive(r.pid)) {
    rmSync(runtime);
    return false;
  }
  const response = await fetch(`${urls.dashboard}/api/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${r.token}` },
    signal: AbortSignal.timeout(action === 'reset' ? 120000 : 10000),
  });
  if (!response.ok) throw new Error(await response.text());
  return true;
}
async function main() {
  const cmd = process.argv[2];
  if (cmd === 'preflight') {
    await preflight();
    console.log('Preflight passed.');
    return;
  }
  if (cmd === 'setup') {
    await setupRepo();
    console.log(`Standalone application repository ready: ${path.join(local, 'application')}`);
    return;
  }
  if (cmd === 'stop') {
    if (await request('stop')) {
      console.log('Stop requested; owned processes and containers are shutting down.');
      return;
    }
    await compose(c, ['down', '--timeout', '10']);
    console.log('This project’s containers stopped; data preserved.');
    return;
  }
  if (cmd === 'reset') {
    if (await request('reset')) {
      console.log('Healthy baseline restored; previous incident evidence and worktrees preserved.');
      return;
    }
    if (existsSync(lock)) {
      const pid = Number(readFileSync(path.join(lock, 'pid'), 'utf8'));
      if (alive(pid)) throw new Error('Demo is still starting or stopping; wait before reset.');
      rmSync(lock, { recursive: true });
    }
    await compose(c, ['down', '--volumes', '--timeout', '10']);
    const db = path.join(local, 'state.sqlite');
    if (existsSync(db)) {
      const s = new Store(db);
      s.db.exec(
        `VACUUM INTO '${path.join(local, 'results', `state-${Date.now()}.sqlite`).replaceAll("'", "''")}'`
      );
      s.reset();
      s.close();
    }
    console.log(
      'Owned DB/telemetry volumes and active state reset. Source edits, worktrees, evidence and remote branches/PRs preserved.'
    );
    return;
  }
  if (cmd !== 'start')
    throw new Error('Usage: npm run demo | demo:stop | demo:reset | demo:setup | demo:preflight');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(path.join(lock, 'pid'), 'utf8'));
    if (alive(pid))
      throw new Error(`Demo process ${pid} owns the lifecycle lock. Use npm run demo:stop.`);
    rmSync(lock, { recursive: true });
  }
  mkdirSync(lock);
  writeFileSync(path.join(lock, 'pid'), String(process.pid));
  let controller: Controller | undefined;
  let startedCompose = false;
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping owned demo processes…');
    try {
      await controller?.close();
      if (startedCompose) await compose(c, ['down', '--timeout', '10']);
    } finally {
      rmSync(runtime, { force: true });
      rmSync(lock, { recursive: true, force: true });
    }
  }
  const signal = () =>
    void stop().then(
      () => process.exit(0),
      (e) => {
        console.error(e);
        process.exit(1);
      }
    );
  process.once('SIGINT', signal);
  process.once('SIGTERM', signal);
  try {
    await preflight();
    await Promise.all([4100, 4101, 4102, 4310, 54329, 3001, 9091, 4318, 3101, 3201].map(available));
    await setupRepo();
    await run('npm', ['run', 'build']);
    console.log('Starting PostgreSQL and local Grafana LGTM…');
    startedCompose = true;
    await compose(c, ['up', '-d', '--wait', '--wait-timeout', '180']);
    await waitReady(`${urls.grafana}/api/health`, 180);
    await waitReady(`${urls.metrics}/-/ready`, 60);
    controller = new Controller();
    controller.onStop = async () => {
      signal();
    };
    writeFileSync(runtime, JSON.stringify({ pid: process.pid, token: controller.token }), {
      mode: 0o600,
    });
    await controller.start();
    const launch = `${urls.dashboard}/#token=${controller.token}`;
    console.log(
      `\nOpen the local dashboard:\n${launch}\n\nCtrl+C stops owned services and preserves results.`
    );
    if (process.env.PERF_NO_OPEN !== '1') await run('open', [launch]);
  } catch (e) {
    await stop();
    throw e;
  }
}
main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
