import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, type Measurement } from '../src/benchmark.ts';
import { config } from '../src/config.ts';
const c = config();
const m = (ms: number, errors = 0): Measurement => ({
  url: 'http://local',
  p95Ms: ms,
  requests: 200,
  errors,
  skipped: 0,
  rps: 8,
  elapsedSeconds: 25,
  buckets: [
    { le: 5, count: 0 },
    { le: 10, count: 0 },
    { le: 20, count: ms === 20 ? 200 : 0 },
    ...[
      30,
      50,
      75,
      100,
      150,
      180,
      200,
      250,
      300,
      400,
      500,
      750,
      1000,
      1500,
      2000,
      3000,
      5000,
      10000,
      Infinity,
    ].map((le) => ({ le, count: le >= ms ? 200 : 0 })),
  ],
});
test('gate rejects errors, missed load, small improvement and inconsistent rounds', () => {
  assert.equal(judge([m(300), m(300)], [m(20), m(20)], c).passed, true);
  assert.equal(judge([m(300), m(300)], [m(20, 1), m(20)], c).passed, false);
  assert.equal(judge([m(300), m(300)], [m(20), { ...m(20), skipped: 1 }], c).passed, false);
  assert.equal(judge([m(300), m(300)], [m(300), m(300)], c).passed, false);
  assert.equal(judge([m(300), m(300)], [m(20), m(300)], c).passed, false);
});
