import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, type Incident, transition } from '../src/state.ts';
const incident = (id: string, deployment = id): Incident => ({
  id,
  deployment,
  phase: 'Investigating',
  created: 1,
  revision: 'rev',
  attempts: 0,
  tokens: 0,
  deadline: 10000,
});
test('SQLite deduplicates incidents across reconnect and keeps only one unresolved incident', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'perf-state-'));
  const file = path.join(dir, 'state.db');
  let s = new Store(file);
  assert.equal(s.create(incident('a')), true);
  assert.equal(s.create(incident('b')), false);
  s.close();
  s = new Store(file);
  assert.equal(s.create(incident('a')), false);
  let i = s.incident('a');
  i.phase = 'Blocked';
  s.save(i);
  assert.equal(s.create(incident('b')), false);
  i.recovered = true;
  s.save(i);
  assert.equal(s.create(incident('a2', 'a')), false);
  assert.equal(s.create(incident('b')), true);
  s.close();
  rmSync(dir, { recursive: true });
});
test('completed turn cannot skip independent validation', () => {
  assert.throws(() => transition('Investigating', 'PR Ready'));
  assert.throws(() => transition('Fixing', 'PR Ready'));
  assert.doesNotThrow(() => transition('Fixing', 'Validating'));
  assert.doesNotThrow(() => transition('Validating', 'Blocked'));
});
