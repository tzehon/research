import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { local, urls } from '../src/config.ts';
if (!existsSync(path.join(local, 'runtime.json')))
  throw new Error(
    'Start npm run demo and wait for its dashboard readiness before running test:e2e.'
  );
const runtime = JSON.parse(readFileSync(path.join(local, 'runtime.json'), 'utf8'));
const headers = { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' };
async function action(name: string, body = {}) {
  const r = await fetch(`${urls.dashboard}/api/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}
async function state() {
  return fetch(`${urls.dashboard}/api/state`, { headers }).then((r) => r.json()) as Promise<any>;
}
async function until(label: string, predicate: (s: any) => boolean, seconds: number) {
  console.log(label);
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const s = await state();
    if (s.incidents[0]?.phase === 'Blocked') throw new Error(s.incidents[0].error);
    if (predicate(s)) return s;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out: ${label}`);
}
await action('reset');
await action('traffic-start');
const healthy = await until(
  'Waiting for real healthy telemetry',
  (s) => s.sample?.quality === 'healthy',
  150
);
await action('regression');
const detected = await until(
  'Waiting for exactly one incident',
  (s) => s.incidents.length === 1,
  180
);
assert.equal(detected.incidents.length, 1);
const ready = await until(
  'Waiting for real Codex investigation, patch and independent validation',
  (s) => s.incidents[0]?.phase === 'PR Ready',
  1200
);
assert.equal(ready.incidents.length, 1);
assert.ok(ready.incidents[0].validation.passed);
await action('candidate', { id: ready.incidents[0].id });
const recovered = await until(
  'Waiting for deployed-app recovery from fresh telemetry',
  (s) => s.incidents[0].recovered,
  180
);
assert.equal(recovered.incidents.length, 1);
writeFileSync(
  path.join(local, 'results', 'e2e.json'),
  JSON.stringify({ healthy, detected, ready, recovered }, null, 2)
);
console.log('Genuine local end-to-end run passed. Publishing:', ready.incidents[0].publishing);
await action('traffic-stop');
