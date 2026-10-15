import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, existsSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, local, urls, type Config } from './config.ts';
const exec = promisify(execFile);
export async function run(cmd: string, args: string[], cwd = root, timeout = 120000) {
  try {
    const r = await exec(cmd, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: process.env });
    return r.stdout.trim();
  } catch (e: any) {
    throw new Error(
      `${cmd} ${args.slice(0, 3).join(' ')}: ${(e.stderr || e.message).slice(-3000)}`
    );
  }
}
export const repo = path.join(local, 'application');
export async function git(args: string[], cwd = repo) {
  return run('git', args, cwd);
}
export async function setupRepo() {
  if (existsSync(path.join(repo, '.git'))) return;
  mkdirSync(repo, { recursive: true });
  cpSync(path.join(root, 'demo-app'), repo, {
    recursive: true,
    filter: (s) => !s.includes('node_modules'),
  });
  await git(['init', '-b', 'main']);
  await git(['config', 'user.name', 'Performance Demo']);
  await git(['config', 'user.email', 'perf-demo@localhost']);
  await git(['add', '.']);
  await git(['commit', '-m', 'Add storefront catalog']);
  await git(['tag', 'demo-healthy']);
  await git(['checkout', '-b', 'demo-regression']);
  cpSync(path.join(root, 'scenario/regression.mjs'), path.join(repo, 'src/search.mjs'));
  await git(['add', 'src/search.mjs']);
  await git(['commit', '-m', 'Include inventory in catalog results']);
}
export function compose(c: Config, args: string[]) {
  return run(
    'docker',
    [
      '--context',
      c.dockerContext,
      'compose',
      '--project-name',
      'perf-agent-demo',
      '-f',
      path.join(root, 'compose.yaml'),
      ...args,
    ],
    root,
    600000
  );
}
export async function waitReady(url: string, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Readiness timed out: ${url}`);
}
export class Applications {
  children = new Map<string, ChildProcess>();
  async launch(role: 'storefront' | 'candidate' | 'baseline', revision: string) {
    await this.stop(role);
    const deployment = randomUUID().replaceAll('-', '');
    const dir = path.join(local, 'releases', deployment);
    mkdirSync(dir, { recursive: true });
    const archive = path.join(dir, 'app.tar');
    await git(['archive', '--format=tar', '--output', archive, revision]);
    await run('tar', ['-xf', archive, '-C', dir]);
    rmSync(archive);
    const port = { storefront: 4100, candidate: 4101, baseline: 4102 }[role];
    const log = await import('node:fs').then((fs) =>
      fs.openSync(path.join(local, 'logs', `${deployment}.jsonl`), 'a', 0o600)
    );
    const child = spawn(process.execPath, [path.join(dir, 'server.mjs')], {
      cwd: dir,
      stdio: ['ignore', log, log],
      env: {
        ...process.env,
        PORT: String(port),
        SERVICE_NAME: role,
        REVISION: revision,
        DEPLOYMENT_ID: deployment,
        DATABASE_URL: 'postgres://storefront:local-readonly@127.0.0.1:54329/storefront',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      },
    });
    (await import('node:fs')).closeSync(log);
    this.children.set(role, child);
    child.on('error', () => {});
    try {
      await waitReady(`http://127.0.0.1:${port}/health`);
      const health = (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json())) as any;
      if (health.deployment !== deployment)
        throw new Error(`Port ${port} belongs to another process`);
    } catch (e) {
      await this.stop(role);
      throw e;
    }
    return { revision, deployment, at: Date.now(), role };
  }
  async stop(role: string) {
    const p = this.children.get(role);
    if (!p) return;
    this.children.delete(role);
    if (p.exitCode !== null) return;
    const exit = new Promise<void>((r) => p.once('exit', () => r()));
    p.kill('SIGTERM');
    await Promise.race([exit, new Promise((r) => setTimeout(r, 3000))]);
    if (p.exitCode === null) p.kill('SIGKILL');
  }
  async close() {
    await Promise.all([...this.children.keys()].map((r) => this.stop(r)));
  }
}
export class Traffic {
  timer?: NodeJS.Timeout;
  inflight = new Set<Promise<unknown>>();
  sent = 0;
  errors = 0;
  skipped = 0;
  start(rps: number, url = urls.app) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.inflight.size >= 32) {
        this.skipped++;
        return;
      }
      this.sent++;
      const p = fetch(`${url}/api/products`, { signal: AbortSignal.timeout(10000) })
        .then(async (r) => {
          await r.arrayBuffer();
          if (!r.ok) this.errors++;
        })
        .catch(() => {
          this.errors++;
        })
        .finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    }, 1000 / rps);
  }
  async stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    await Promise.allSettled([...this.inflight]);
  }
  get active() {
    return !!this.timer;
  }
}
