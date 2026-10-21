import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/state.ts';
import { Controller } from '../src/controller.ts';
import { config } from '../src/config.ts';

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'perf-saved-runs-'));
  // Exercise actual controller methods without starting Docker, deployments or inference.
  const controller = Object.create(Controller.prototype) as Controller;
  controller.store = new Store(path.join(dir, 'state.sqlite'));
  controller.resultsDirectory = path.join(dir, 'results');
  controller.cfg = config();
  controller.traffic = { active: false, sent: 100, errors: 0, skipped: 0 } as any;
  controller.token = '00000000-0000-0000-0000-000000000000';
  controller.busy = false;
  controller.store.create({
    id: 'rehearsal',
    deployment: 'old-deployment',
    phase: 'Blocked',
    created: 1,
    revision: 'baseline',
    attempts: 1,
    tokens: 200,
    deadline: 1000,
    diagnosis: 'Recorded diagnosis',
    diff: '- old\n+ new',
  });
  controller.store.set('history', [{ at: 1, p95Ms: 500 }]);
  mkdirSync(path.join(controller.resultsDirectory, 'rehearsal'), { recursive: true });
  writeFileSync(path.join(controller.resultsDirectory, 'rehearsal', 'PR.md'), 'Original evidence');
  controller.store.event('rehearsal', 'evidence', {
    files: [{ name: 'PR.md', url: '/evidence/rehearsal/PR.md' }],
  });
  return {
    controller,
    dir,
    cleanup() {
      controller.store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('snapshots retain all events and frozen evidence across live changes, reset and restart', () => {
  const f = fixture();
  const c = f.controller;
  try {
    for (let n = 0; n < 1700; n++) c.store.event('rehearsal', 'app-server', { method: 'tool', n });
    const originalRunId = c.state().runId;
    const saved = c.saveRun('  Rehearsal  ');
    assert.equal(saved.name, 'Rehearsal');
    const snapshot = c.store.savedRun(saved.id)!;
    assert.equal(snapshot.events.length, 1701);
    assert.equal(snapshot.events.at(-1).data.n, 1699);
    const evidenceDir = snapshot.state.evidenceDirectories.rehearsal;
    assert.equal(snapshot.events[0].data.files[0].url, `/evidence/${evidenceDir}/PR.md`);
    writeFileSync(path.join(c.resultsDirectory, 'rehearsal', 'PR.md'), 'Changed later');
    c.store.set('history', []);
    c.store.reset();
    assert.notEqual(c.state().runId, originalRunId);
    c.store.close();
    c.store = new Store(path.join(f.dir, 'state.sqlite'));
    assert.deepEqual(c.store.savedRun(saved.id), snapshot);
    assert.equal(c.store.savedRuns().length, 1);
    assert.equal(c.store.all().length, 0);
    assert.equal(
      readFileSync(path.join(c.resultsDirectory, evidenceDir, 'PR.md'), 'utf8'),
      'Original evidence'
    );
    assert.equal(c.store.savedRun('missing'), undefined);
    assert.throws(() => c.store.saveRun(snapshot), /UNIQUE/);
  } finally {
    f.cleanup();
  }
});

test('saving rejects active work, invalid names and empty runs', () => {
  const f = fixture();
  const c = f.controller;
  try {
    for (const name of [null, '', '   ', 'a'.repeat(101)])
      assert.throws(() => c.saveRun(name), /run name/);
    c.workflow = Promise.resolve();
    assert.throws(() => c.saveRun('busy'), /finish/);
    c.workflow = undefined;
    c.busy = true;
    assert.throws(() => c.saveRun('busy'), /finish/);
    c.busy = false;
    c.store.reset();
    assert.throws(() => c.saveRun('empty'), /investigation/);
    assert.equal(c.store.savedRuns().length, 0);
  } finally {
    f.cleanup();
  }
});

test('saved-run HTTP routes require authentication and keep snapshots separate from live state', async () => {
  const f = fixture();
  const c = f.controller;
  const server = http.createServer((req, res) => void c.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const request = (
    pathname: string,
    options: { method?: string; body?: string } = {},
    auth = true
  ) =>
    new Promise<Response>((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}${pathname}`,
        {
          method: options.method || 'GET',
          headers: {
            Host: '127.0.0.1:4310',
            ...(auth ? { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' } : {}),
          },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(new Response(body, { status: res.statusCode })));
        }
      );
      req.on('error', reject);
      req.end(options.body);
    });
  try {
    assert.equal((await request('/api/runs', {}, false)).status, 401);
    const response = await request('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ name: 'Presentation' }),
    });
    assert.equal(response.status, 200);
    const saved: any = await response.json();
    assert.equal((await request(`/api/runs/${saved.id}`, {}, false)).status, 401);
    c.store.reset();
    const snapshot: any = await (await request(`/api/runs/${saved.id}`)).json();
    assert.equal(snapshot.state.incidents[0].diagnosis, 'Recorded diagnosis');
    assert.equal(((await (await request('/api/state')).json()) as any).incidents.length, 0);
    assert.equal((await request('/api/runs/missing')).status, 404);
    assert.equal(((await (await request('/api/runs')).json()) as any[]).length, 1);
    const evidence = snapshot.events[0].data.files[0].url;
    assert.equal((await request(evidence, {}, false)).status, 401);
    assert.equal(await (await request(evidence)).text(), 'Original evidence');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    f.cleanup();
  }
});
