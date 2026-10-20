import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prBody } from '../src/publish.ts';
import type { Incident } from '../src/state.ts';
test('PR evidence reports measured candidate results without claiming production recovery', () => {
  const i: Incident = {
    id: 'test',
    phase: 'PR Ready',
    created: 0,
    revision: 'affected',
    deployment: 'demo',
    attempts: 1,
    tokens: 10,
    deadline: 1,
    diagnosis: 'Runtime evidence identified sequential database round trips.',
    outcome: {
      evidence: ['Trace abc with database spans'],
      changes: ['Batch inventory lookup'],
      uncertainties: ['Local workload only'],
    },
    validation: {
      passed: true,
      correctness: { candidate: { checks: 6 } },
      baseline: { p95Ms: 400, requests: 480, errors: 0 },
      candidate: { p95Ms: 20, requests: 480, errors: 0 },
      improvement: 0.95,
      ratios: [0.05, 0.05, 0.05],
      methodology: { rps: 8 },
    },
  };
  const body = prBody(i);
  for (const text of [
    'affected',
    'Trace abc',
    'Batch inventory',
    '400.0',
    '20.0',
    '95.0%',
    'not production recovery',
  ])
    assert.ok(body.includes(text));
  const telemetryBody = prBody({ ...i, investigationMode: 'telemetry-only' });
  assert.ok(telemetryBody.includes('Investigation mode: telemetry-only'));
  assert.ok(telemetryBody.includes('browser performance traces were not required'));
});
