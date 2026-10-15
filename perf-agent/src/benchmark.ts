import assert from 'node:assert/strict';
import { histogramQuantile } from './metrics.ts';
import type { Config } from './config.ts';
const limits = [
  5,
  10,
  20,
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
];
export type Measurement = {
  url: string;
  requests: number;
  errors: number;
  skipped: number;
  p95Ms: number | null;
  rps: number;
  buckets: { le: number; count: number }[];
  elapsedSeconds: number;
};
export async function correctness(url: string, signal?: AbortSignal) {
  const cases = ['', 'Alpine', 'Lamp', 'zzz', "' OR 1=1 --", 'drift'];
  let checks = 0;
  for (const term of cases) {
    signal?.throwIfAborted();
    const r = await fetch(`${url}/api/products?q=${encodeURIComponent(term)}`, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
    assert.equal(r.status, 200);
    const data = (await r.json()) as any;
    const names = ['Alpine', 'Terra', 'Drift', 'Ember', 'Linen', 'Cedar'];
    const objects = ['Lamp', 'Vase', 'Chair', 'Throw'];
    const cats = ['Lighting', 'Objects', 'Furniture', 'Textiles'];
    const expected = Array.from({ length: 48 }, (_, i) => ({
      id: i + 1,
      name: `${names[i % 6]} ${objects[Math.floor(i / 6) % 4]}`,
      category: cats[Math.floor(i / 6) % 4],
      price_cents: 1800 + (i + 1) * 375,
      stock: ((i + 1) * 7) % 31,
    }))
      .filter((p) => p.name.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 24);
    assert.deepEqual(data.products, expected);
    checks++;
  }
  return { passed: true, checks, cases };
}
export async function measure(
  url: string,
  seconds: number,
  rps: number,
  signal: AbortSignal
): Promise<Measurement> {
  const buckets = limits.map((le) => ({ le, count: 0 }));
  let requests = 0,
    errors = 0,
    skipped = 0;
  const pending = new Set<Promise<void>>();
  const start = performance.now();
  let next = start;
  while (performance.now() - start < seconds * 1000) {
    signal.throwIfAborted();
    const now = performance.now();
    if (now < next) {
      await new Promise((r) => setTimeout(r, Math.min(20, next - now)));
      continue;
    }
    next += 1000 / rps;
    if (now - next > 1000 / rps || pending.size >= 32) {
      skipped++;
      continue;
    }
    const p = (async () => {
      const at = performance.now();
      try {
        const r = await fetch(`${url}/api/products`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });
        const data = (await r.json()) as any;
        if (!r.ok || data.products?.length !== 24) errors++;
      } catch {
        errors++;
      } finally {
        const ms = performance.now() - at;
        requests++;
        for (const b of buckets) if (ms <= b.le) b.count++;
      }
    })().finally(() => pending.delete(p));
    pending.add(p);
  }
  await Promise.all(pending);
  signal.throwIfAborted();
  const elapsedSeconds = (performance.now() - start) / 1000;
  return {
    url,
    requests,
    errors,
    skipped,
    p95Ms: histogramQuantile(0.95, buckets),
    rps: requests / elapsedSeconds,
    buckets,
    elapsedSeconds,
  };
}
function aggregate(rounds: Measurement[]) {
  const buckets = limits.map((le, i) => ({
    le,
    count: rounds.reduce((s, r) => s + r.buckets[i].count, 0),
  }));
  return {
    p95Ms: histogramQuantile(0.95, buckets),
    requests: rounds.reduce((s, r) => s + r.requests, 0),
    errors: rounds.reduce((s, r) => s + r.errors, 0),
    skipped: rounds.reduce((s, r) => s + r.skipped, 0),
    buckets,
  };
}
export function judge(baseline: Measurement[], candidate: Measurement[], c: Config) {
  const b = aggregate(baseline),
    a = aggregate(candidate);
  const ratios = baseline.map((r, i) => candidate[i].p95Ms! / r.p95Ms!);
  const enough = [...baseline, ...candidate].every(
    (r) =>
      r.requests >= c.benchmarkSeconds * c.benchmarkRps * 0.9 && r.skipped === 0 && r.errors === 0
  );
  const improved =
    !!b.p95Ms &&
    !!a.p95Ms &&
    a.p95Ms <= b.p95Ms * (1 - c.minimumImprovement) &&
    ratios.every((r) => Number.isFinite(r) && r < 0.85);
  return {
    passed: enough && improved,
    baseline: b,
    candidate: a,
    improvement: b.p95Ms && a.p95Ms ? 1 - a.p95Ms / b.p95Ms : 0,
    ratios,
    reason: !enough
      ? 'Errors, missed load slots, or insufficient samples'
      : !improved
        ? 'Improvement is too small or inconsistent across rounds'
        : 'Correctness and repeatable performance improvement passed',
  };
}
export async function benchmark(
  baselineUrl: string,
  candidateUrl: string,
  c: Config,
  signal: AbortSignal,
  progress: (s: string) => void
) {
  const correctnessResults = {
    baseline: await correctness(baselineUrl, signal),
    candidate: await correctness(candidateUrl, signal),
  };
  const baseline: Measurement[] = [],
    candidate: Measurement[] = [];
  for (let round = 0; round < c.benchmarkRounds; round++) {
    for (const role of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const url = role === 'baseline' ? baselineUrl : candidateUrl;
      progress(`Round ${round + 1}/${c.benchmarkRounds}: warming ${role}`);
      await measure(url, c.warmupSeconds, c.benchmarkRps, signal);
      progress(`Round ${round + 1}/${c.benchmarkRounds}: measuring ${role}`);
      const result = await measure(url, c.benchmarkSeconds, c.benchmarkRps, signal);
      (role === 'baseline' ? baseline : candidate).push(result);
    }
  }
  return {
    ...judge(baseline, candidate, c),
    correctness: correctnessResults,
    rounds: { baseline, candidate },
    methodology: {
      warmupSeconds: c.warmupSeconds,
      secondsPerRound: c.benchmarkSeconds,
      rps: c.benchmarkRps,
      rounds: c.benchmarkRounds,
      order:
        'Alternating baseline/candidate; serial, identical fixture; background monitored traffic retained',
      percentile:
        'p95 interpolated from aggregated cumulative client duration histograms; not mean of round percentiles',
      thresholdIsNotValidationGate: true,
    },
    at: Date.now(),
  };
}
