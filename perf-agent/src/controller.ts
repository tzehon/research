import http from 'node:http';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
  lstatSync,
} from 'node:fs';
import { Store, type Incident } from './state.ts';
import { config, schema, local, root, urls, type Config } from './config.ts';
import { sample, jsonFetch, queries, type Sample } from './metrics.ts';
import { evaluate, type AlertState } from './monitor.ts';
import { Applications, Traffic, git, repo, compose } from './system.ts';
import { AgentSession } from './agent.ts';
import { benchmark } from './benchmark.ts';
import { publish } from './publish.ts';
import { requireInvestigationEvidence } from './evidence.ts';
export class Controller {
  store = new Store(path.join(local, 'state.sqlite'));
  cfg: Config;
  apps = new Applications();
  traffic = new Traffic();
  agent: AgentSession;
  abort?: AbortController;
  workflow?: Promise<void>;
  busy = false;
  closing = false;
  tickBusy = false;
  timer?: NodeJS.Timeout;
  server?: http.Server;
  token = randomUUID();
  onStop = async () => {};
  constructor() {
    this.cfg = schema.parse({ ...config(), ...this.store.get('settings', {}) });
    this.agent = new AgentSession(this.store, this.cfg);
    for (const i of this.store.all()) {
      if (['Investigating', 'Fixing', 'Validating'].includes(i.phase)) {
        this.store.set(`resume:${i.id}`, i.phase);
        i.phase = 'Blocked';
        i.error =
          'Controller restarted. Partial evidence preserved; Retry resumes this incident and Codex thread.';
        this.store.save(i);
      }
    }
  }
  async start() {
    const saved = this.store.get<any>('deployment', null);
    await this.deploy(saved?.revision || (await git(['rev-parse', 'demo-healthy'])));
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(4310, '127.0.0.1', resolve);
    });
    this.timer = setInterval(() => void this.tick(), this.cfg.pollSeconds * 1000);
    await this.tick();
  }
  async deploy(revision: string) {
    const deployment = await this.apps.launch('storefront', revision);
    this.store.set('deployment', deployment);
    this.store.event(null, 'deployment', deployment);
    this.store.set('sample', null);
    return deployment;
  }
  state() {
    return {
      config: this.cfg,
      urls,
      deployment: this.store.get('deployment', null),
      sample: this.store.get('sample', null),
      history: this.store.get('history', []),
      incidents: this.store.all(),
      status: this.store.all().find((i) => !i.recovered)?.phase || 'Watching',
      traffic: {
        active: this.traffic.active,
        sent: this.traffic.sent,
        errors: this.traffic.errors,
        skipped: this.traffic.skipped,
      },
      busy: this.busy,
    };
  }
  async tick() {
    if (this.closing || this.tickBusy || this.busy) return;
    this.tickBusy = true;
    try {
      const d = this.store.get<any>('deployment', null);
      if (!d) return;
      const m = await sample(d.deployment, this.cfg);
      if (this.closing || this.store.get<any>('deployment', null)?.deployment !== d.deployment)
        return;
      this.store.set('sample', m);
      const history = this.store.get<Sample[]>('history', []);
      history.push(m);
      this.store.set('history', history.slice(-400));
      const result = evaluate(
        this.store.get<AlertState>('alert', { latched: false, cooldownUntil: 0 }),
        m,
        this.cfg
      );
      this.store.set('alert', result.state);
      if (result.action === 'incident') {
        const i: Incident = {
          id: randomUUID(),
          phase: 'Investigating',
          created: Date.now(),
          revision: d.revision,
          deployment: d.deployment,
          attempts: 0,
          tokens: 0,
          deadline: Date.now() + this.cfg.budgetSeconds * 1000,
        };
        if (this.store.create(i)) {
          this.store.set(`symptom:${i.id}`, {
            metric: m,
            thresholdMs: this.cfg.thresholdMs,
            sustainSeconds: this.cfg.sustainSeconds,
          });
          this.store.event(i.id, 'incident', { message: 'Sustained breach confirmed', metric: m });
          this.launch(i);
        }
      }
      if (result.action === 'recovered') {
        const i = this.store.all().find((x) => x.deployed && !x.recovered);
        if (i && d.revision === i.candidateRevision) {
          i.recovered = true;
          this.store.save(i);
          this.store.event(i.id, 'recovery', {
            message: 'Fresh deployed-app measurements confirm local recovery',
            metric: m,
          });
        }
      }
    } catch (e) {
      this.store.event(null, 'error', { message: String(e) });
    } finally {
      this.tickBusy = false;
    }
  }
  launch(i: Incident) {
    if (this.workflow) throw new Error('An investigation is already running');
    this.abort = new AbortController();
    this.workflow = this.investigate(i, this.abort.signal).finally(() => {
      this.workflow = undefined;
    });
  }
  async investigate(i: Incident, signal: AbortSignal) {
    let resume = i.phase;
    try {
      if (i.attempts >= this.cfg.maxAttempts)
        throw new Error('Maximum investigation attempts reached');
      if (Date.now() > i.deadline) throw new Error('Investigation time budget exhausted');
      i.attempts++;
      this.store.save(i);
      mkdirSync(path.join(local, 'results', i.id), { recursive: true });
      if (!i.worktree) {
        i.worktree = path.join(local, 'worktrees', i.id);
        i.branch = `codex/perf-${i.id.slice(0, 8)}`;
        this.store.save(i);
        await git(['worktree', 'add', '-b', i.branch, i.worktree, i.revision]);
      }
      if (i.phase === 'Investigating') {
        resume = 'Investigating';
        const diagnosis = await this.agent.run(i, 'Investigating', signal);
        const used = this.store.get<string[]>(`tools:${i.id}`, []);
        const visited = this.store.get<string[]>(`browserUrls:${i.id}`, []);
        requireInvestigationEvidence(used, visited);
        i.diagnosis = diagnosis.diagnosis;
        i.outcome = diagnosis;
        i.phase = 'Fixing';
        this.store.save(i);
        this.store.event(i.id, 'phase', { phase: i.phase });
      }
      if (i.phase === 'Fixing') {
        resume = 'Fixing';
        const fix = await this.agent.run(i, 'Fixing', signal);
        i.outcome = fix;
        i.diagnosis = fix.diagnosis;
        signal.throwIfAborted();
        i.phase = 'Validating';
        this.store.save(i);
      }
      if (i.phase === 'Validating') {
        resume = 'Validating';
        this.store.event(i.id, 'phase', { phase: i.phase });
        signal.throwIfAborted();
        // Only application code may differ. Compare against affected commit, including staged edits.
        const changed = (await git(['diff', '--name-only', i.revision], i.worktree))
          .split('\n')
          .filter(Boolean);
        const untracked = (await git(['ls-files', '--others', '--exclude-standard'], i.worktree))
          .split('\n')
          .filter(Boolean);
        if (!changed.length || changed.some((f) => f !== 'src/search.mjs') || untracked.length)
          throw new Error(
            'Candidate must change only src/search.mjs; no test, telemetry, dependency or untracked changes allowed'
          );
        if (lstatSync(path.join(i.worktree, 'src/search.mjs')).isSymbolicLink())
          throw new Error('Application source cannot be a symlink');
        i.diff = await git(['diff', i.revision, '--', 'src/search.mjs'], i.worktree);
        await git(['add', 'src/search.mjs'], i.worktree);
        if (await git(['diff', '--cached', '--name-only'], i.worktree))
          await git(['commit', '-m', 'Improve catalog query performance'], i.worktree);
        i.candidateRevision = await git(['rev-parse', 'HEAD'], i.worktree);
        this.store.save(i);
        await this.apps.launch('baseline', i.revision);
        await this.apps.launch('candidate', i.candidateRevision);
        signal.throwIfAborted();
        i.validation = await benchmark(urls.baseline, urls.candidate, this.cfg, signal, (message) =>
          this.store.event(i.id, 'validation', { message })
        );
        writeFileSync(
          path.join(local, 'results', i.id, 'benchmark.json'),
          JSON.stringify(i.validation, null, 2)
        );
        if (!i.validation.passed) throw new Error(`Validation blocked: ${i.validation.reason}`);
        i.phase = 'PR Ready';
        i.error = undefined;
        this.store.save(i);
      }
      signal.throwIfAborted();
      try {
        Object.assign(i, await publish(i, this.cfg));
      } catch (e) {
        i.publishing = 'blocked';
        i.error = `Publishing failed; local validation remains passed: ${String(e)}`;
      }
      this.store.save(i);
      this.store.event(i.id, 'phase', { phase: i.phase, publishing: i.publishing });
    } catch (e) {
      this.store.set(`resume:${i.id}`, resume);
      i.phase = 'Blocked';
      i.error = String(e);
      this.store.save(i);
      this.store.event(i.id, 'blocked', { message: i.error });
    } finally {
      await this.apps.stop('baseline');
      if (i.worktree) {
        const source = path.join(i.worktree, 'evidence');
        if (existsSync(source))
          for (const name of readdirSync(source)) {
            if (
              /^[\w.-]+\.(png|jpg|jpeg|webp|json|json\.gz)$/.test(name) &&
              lstatSync(path.join(source, name)).isFile()
            )
              copyFileSync(path.join(source, name), path.join(local, 'results', i.id, name));
          }
      }
      this.store.event(i.id, 'evidence', {
        files: readdirSync(path.join(local, 'results', i.id)).map((name) => ({
          name,
          url: `/evidence/${i.id}/${name}`,
        })),
      });
    }
  }
  async action(name: string, body: any = {}) {
    if (name === 'cancel') {
      this.abort?.abort();
      await this.agent.cancel();
      await this.workflow;
      return;
    }
    if (this.busy) throw new Error('A demo control is already running');
    this.busy = true;
    try {
      switch (name) {
        case 'traffic-start':
          this.traffic.start(this.cfg.trafficRps);
          break;
        case 'traffic-stop':
          await this.traffic.stop();
          break;
        case 'regression':
          if (this.workflow || this.store.all().some((i) => !i.recovered))
            throw new Error('Reset the current incident before deploying another regression');
          await this.deploy(await git(['rev-parse', 'demo-regression']));
          break;
        case 'candidate': {
          if (this.workflow) throw new Error('Wait for validation to finish');
          const i = this.store.incident(body.id);
          if (i.phase !== 'PR Ready' || !i.validation?.passed || !i.candidateRevision)
            throw new Error('Candidate is not independently validated');
          await this.deploy(i.candidateRevision);
          i.deployed = true;
          this.store.save(i);
          break;
        }
        case 'retry': {
          if (this.workflow) throw new Error('Investigation still active');
          const i = this.store.incident(body.id);
          if (i.phase !== 'Blocked') throw new Error('Only blocked incidents can retry');
          i.phase = this.store.get(`resume:${i.id}`, 'Investigating');
          i.error = undefined;
          this.store.save(i);
          this.launch(i);
          break;
        }
        case 'publish': {
          if (this.workflow) throw new Error('Wait for the current workflow to finish publishing');
          const i = this.store.incident(body.id);
          Object.assign(i, await publish(i, this.cfg));
          i.error = undefined;
          this.store.save(i);
          break;
        }
        case 'settings':
          if (this.workflow || this.store.all().some((i) => !i.recovered))
            throw new Error('Monitoring settings are locked during an incident');
          this.cfg = schema.parse({ ...this.cfg, thresholdMs: Number(body.thresholdMs) });
          this.agent.cfg = this.cfg;
          this.store.set('settings', { thresholdMs: this.cfg.thresholdMs });
          this.store.set('alert', { latched: false, cooldownUntil: 0 });
          break;
        case 'reset':
          await this.reset();
          break;
        default:
          throw new Error('Unknown control');
      }
    } finally {
      this.busy = false;
    }
  }
  async reset() {
    this.abort?.abort();
    await this.agent.cancel();
    await this.workflow;
    await this.traffic.stop();
    await this.apps.stop('candidate');
    await this.apps.stop('storefront');
    await compose(this.cfg, [
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'demo',
      '-d',
      'storefront',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '/demo-fixtures/data.sql',
    ]);
    this.traffic = new Traffic();
    const archive = path.join(local, 'results', `state-${Date.now()}.sqlite`);
    this.store.db.exec(`VACUUM INTO '${archive.replaceAll("'", "''")}'`);
    this.store.reset();
    this.cfg = config();
    this.agent.cfg = this.cfg;
    await this.deploy(await git(['rev-parse', 'demo-healthy']));
  }
  authenticated(req: http.IncomingMessage) {
    const token =
      req.headers.authorization?.replace(/^Bearer /, '') ||
      req.headers.cookie
        ?.split('; ')
        .find((c) => c.startsWith('perf_session='))
        ?.slice(13);
    return (
      !!token &&
      token.length === this.token.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(this.token))
    );
  }
  async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const url = new URL(req.url || '/', urls.dashboard);
      if (req.headers.host !== '127.0.0.1:4310' && req.headers.host !== 'localhost:4310') {
        res.writeHead(403);
        res.end();
        return;
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store');
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/evidence/')) {
        if (!this.authenticated(req)) {
          res.writeHead(401);
          res.end(
            JSON.stringify({
              error: 'Open the launch URL printed by npm run demo to authorize this browser.',
            })
          );
          return;
        }
      }
      if (req.method === 'POST') {
        if (
          req.headers.origin &&
          ![urls.dashboard, 'http://localhost:4310'].includes(req.headers.origin)
        )
          throw new Error('Cross-origin mutation denied');
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 10000) throw new Error('Request too large');
        }
        const body = raw ? JSON.parse(raw) : {};
        res.setHeader('Content-Type', 'application/json');
        if (url.pathname === '/api/session') {
          res.setHeader(
            'Set-Cookie',
            `perf_session=${this.token}; HttpOnly; SameSite=Strict; Path=/`
          );
          res.end('{}');
          return;
        }
        if (url.pathname === '/api/stop') {
          res.end('{}');
          setImmediate(() => void this.onStop());
          return;
        }
        await this.action(url.pathname.replace('/api/', ''), body);
        res.end(JSON.stringify(this.state()));
        return;
      }
      if (url.pathname === '/api/state') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(this.state()));
        return;
      }
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        let cursor = Number(req.headers['last-event-id'] || 0);
        const send = () => {
          for (const e of this.store.events(cursor)) {
            res.write(`id: ${e.id}\nevent: activity\ndata: ${JSON.stringify(e)}\n\n`);
            cursor = e.id;
          }
          res.write(`event: state\ndata: ${JSON.stringify(this.state())}\n\n`);
        };
        send();
        const t = setInterval(send, 750);
        req.on('close', () => clearInterval(t));
        return;
      }
      if (url.pathname === '/api/logs') {
        const query = '{service_name="storefront"}';
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(
            await jsonFetch(
              `${urls.logs}/loki/api/v1/query_range?${new URLSearchParams({ query, limit: '40', since: '30m' })}`
            )
          )
        );
        return;
      }
      if (url.pathname === '/api/traces') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(
            await jsonFetch(
              `${urls.traces}/api/search?${new URLSearchParams({ q: '{ resource.service.name = "storefront" }', limit: '15', start: String(Math.floor(Date.now() / 1000) - 1800), end: String(Math.floor(Date.now() / 1000)) })}`
            )
          )
        );
        return;
      }
      if (url.pathname.startsWith('/api/trace/')) {
        const id = url.pathname.split('/').at(-1)!;
        if (!/^[a-fA-F0-9]{16,32}$/.test(id)) throw new Error('Invalid trace ID');
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(
            await jsonFetch(`${urls.traces}/api/traces/${id}`, {
              headers: { Accept: 'application/json' },
            })
          )
        );
        return;
      }
      if (url.pathname === '/api/queries') {
        const d = this.store.get<any>('deployment', null);
        res.end(JSON.stringify(queries(d.deployment, this.cfg.windowSeconds)));
        return;
      }
      let file: string;
      if (url.pathname.startsWith('/evidence/')) {
        const parts = url.pathname.split('/');
        if (
          parts.length !== 4 ||
          !parts.slice(2).every((s) => /^[\w.-]+$/.test(s)) ||
          parts.includes('..')
        )
          throw new Error('Invalid evidence path');
        file = path.join(local, 'results', parts[2], parts[3]);
      } else
        file = path.join(
          root,
          'dist',
          url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '')
        );
      if (
        !file.startsWith(path.join(root, 'dist') + path.sep) &&
        !file.startsWith(path.join(local, 'results') + path.sep)
      )
        throw new Error('Path denied');
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp',
        '.json': 'application/json',
        '.md': 'text/plain',
      };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    clearInterval(this.timer);
    this.abort?.abort();
    await this.agent.cancel();
    await this.workflow;
    await this.traffic.stop();
    await this.apps.close();
    this.server?.closeAllConnections();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    while (this.tickBusy) await new Promise((r) => setTimeout(r, 25));
    this.store.close();
  }
}
