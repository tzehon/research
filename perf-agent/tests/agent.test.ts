import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentSession, agentConfig } from '../src/agent.ts';
import { root, schema } from '../src/config.ts';
import { Store, type Incident } from '../src/state.ts';

for (const mode of ['browser', 'telemetry-only'] as const)
  test(`${mode}: investigation and resumed fixing use the selected tools without a token cap`, async (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'perf-agent-'));
    const store = new Store(path.join(dir, 'state.db'));
    const previousPath = process.env.PATH;
    t.after(() => {
      process.env.PATH = previousPath;
      store.close();
      rmSync(dir, { recursive: true, force: true });
    });
    // Exercise the real session and JSONL transport with a deterministic local server.
    writeFileSync(
      path.join(dir, 'codex'),
      `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const { appendFileSync } = require('node:fs');
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  appendFileSync('requests.jsonl', JSON.stringify(message) + '\\n');
  if (message.id === undefined) return;
  send({ id: message.id, result: message.method === 'thread/start' ? { thread: { id: 'thread' } } : {} });
  if (message.method !== 'turn/start') return;
  send({ method: 'turn/started', params: { turn: { id: 'turn' } } });
  send({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { totalTokens: 5000000 } } } });
  send({ method: 'item/completed', params: { item: { type: 'agentMessage', text: JSON.stringify({
    status: 'ready', diagnosis: 'Observed repeated inventory requests', evidence: ['trace'], changes: [], uncertainties: []
  }) } } });
  send({ method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } });
});
`,
      { mode: 0o700 }
    );
    process.env.PATH = `${dir}${path.delimiter}${previousPath}`;
    const cfg = schema.parse({
      ...JSON.parse(readFileSync(path.join(root, 'config/demo.json'), 'utf8')),
      // Old local overrides must not reinstate the removed cap.
      tokenBudget: 1,
      investigationMode: mode,
    });
    const incident: Incident = {
      id: 'high-usage',
      deployment: 'test',
      phase: 'Investigating',
      created: Date.now(),
      revision: 'test',
      attempts: 0,
      tokens: 0,
      deadline: Date.now() + 10000,
      worktree: dir,
    };
    store.create(incident);
    assert.equal('chrome' in agentConfig(incident).mcp_servers, true);
    const session = new AgentSession(store, cfg);
    const cancel = t.mock.method(session, 'cancel', async () => {});
    const result = await session.run(incident, 'Investigating', new AbortController().signal);
    assert.equal(result.status, 'ready');
    await session.run(incident, 'Fixing', new AbortController().signal);
    const requests = readFileSync(path.join(dir, 'requests.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const threads = requests.filter((request) =>
      ['thread/start', 'thread/resume'].includes(request.method)
    );
    assert.deepEqual(
      threads.map((request) => request.method),
      ['thread/start', 'thread/resume']
    );
    for (const request of threads) {
      assert.deepEqual(
        Object.keys(request.params.config.mcp_servers).sort(),
        mode === 'browser' ? ['chrome', 'observability'] : ['observability']
      );
      assert.equal(request.params.config.mcp_servers.observability.required, true);
      if (mode === 'telemetry-only')
        assert.match(request.params.developerInstructions, /Do not launch a browser/);
    }
    const prompt = requests.find((request) => request.method === 'turn/start').params.input[0].text;
    if (mode === 'telemetry-only') {
      assert.match(prompt, /telemetry-only mode/);
      assert.doesNotMatch(prompt, /Use Chrome DevTools MCP/);
    } else assert.match(prompt, /Use Chrome DevTools MCP/);
    assert.equal(store.incident(incident.id).tokens, 5000000);
    assert.equal(cancel.mock.callCount(), 0);
    assert.ok(store.events().some((event) => event.data.method === 'thread/tokenUsage/updated'));
  });
