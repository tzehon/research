import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.ts';
import { evaluate, type AlertState } from '../src/monitor.ts';
import { classify, histogramQuantile, queries, type Sample } from '../src/metrics.ts';
const c = { ...config(), sustainSeconds: 6, recoverySeconds: 6, pollSeconds: 3 };
const sample = (at: number, p95Ms = 200): Sample => ({
  at,
  p95Ms,
  quality: p95Ms > c.thresholdMs ? 'breaching' : 'healthy',
  rps: 8,
  errorRate: 0,
  count: 200,
  ageSeconds: 1,
  windowSeconds: 30,
  deployment: 'a',
});
test('aggregate histogram quantile interpolates and rejects missing/inconsistent buckets', () => {
  assert.equal(
    histogramQuantile(0.95, [
      { le: 100, count: 80 },
      { le: 200, count: 100 },
      { le: Infinity, count: 100 },
    ]),
    175
  );
  assert.equal(
    histogramQuantile(0.95, [
      { le: 100, count: 0 },
      { le: Infinity, count: 0 },
    ]),
    null
  );
  assert.equal(
    histogramQuantile(0.95, [
      { le: 100, count: 5 },
      { le: 200, count: 3 },
      { le: Infinity, count: 5 },
    ]),
    null
  );
  assert.equal(histogramQuantile(0.95, [{ le: 100, count: 5 }]), null);
});
test('strictly ABOVE threshold; sustained samples trigger only once', () => {
  let s: AlertState = { cooldownUntil: 0, latched: false };
  for (const at of [0, 3000, 6000]) {
    const r = evaluate(s, sample(at, c.thresholdMs), c);
    s = r.state;
    assert.equal(r.action, null);
  }
  for (const [at, action] of [
    [9000, null],
    [12000, null],
    [15000, 'incident'],
    [18000, null],
  ] as const) {
    const r = evaluate(s, sample(at), c);
    s = r.state;
    assert.equal(r.action, action);
  }
});
test('stale data, low samples and polling gaps break sustained duration', () => {
  for (const quality of ['unavailable', 'insufficient'] as const) {
    let s = evaluate({ cooldownUntil: 0, latched: false }, sample(0), c).state;
    s = evaluate(s, { ...sample(3000), quality }, c).state;
    assert.equal(evaluate(s, sample(6000), c).action, null);
  }
  let s = evaluate({ cooldownUntil: 0, latched: false }, sample(0), c).state;
  assert.equal(evaluate(s, sample(15000), c).action, null);
});
test('recovery requires hysteresis and sustained fresh data; cooldown prevents re-alert', () => {
  let s: AlertState = { cooldownUntil: 0, latched: true, deployment: 'a' };
  s = evaluate(s, sample(0, 170), c).state;
  assert.equal(s.recoverySince, undefined);
  s = evaluate(s, sample(3000, 100), c).state;
  s = evaluate(s, sample(6000, 100), c).state;
  const recovered = evaluate(s, sample(9000, 100), c);
  assert.equal(recovered.action, 'recovered');
  s = recovered.state;
  for (const at of [12000, 15000, 18000]) {
    const r = evaluate(s, sample(at), c);
    assert.equal(r.action, null);
    s = r.state;
  }
});
test('new deployment does not inherit a partially elapsed breach', () => {
  let s = evaluate({ cooldownUntil: 0, latched: false }, sample(0), c).state;
  assert.equal(evaluate(s, { ...sample(6000), deployment: 'b' }, c).action, null);
});
test('telemetry states distinguish empty from stale and unavailable', () => {
  assert.equal(classify({ ...sample(0), count: 1 }, c).quality, 'insufficient');
  assert.equal(classify({ ...sample(0), ageSeconds: 40 }, c).quality, 'unavailable');
  assert.equal(classify({ ...sample(0), p95Ms: null }, c).quality, 'insufficient');
  assert.equal(classify({ ...sample(0), ageSeconds: null }, c).quality, 'unavailable');
});
test('monitor and UI queries aggregate histograms with bounded deployment filter', () => {
  const q = queries('abc', 30);
  assert.match(q.p95, /histogram_quantile\(0.95, sum by \(le\) \(rate/);
  for (const v of Object.values(q)) assert.match(v, /deployment="abc"/);
  assert.throws(() => queries('"} or vector(1)', 30));
});
