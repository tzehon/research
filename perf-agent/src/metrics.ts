import { urls, type Config } from './config.ts';
export type Sample = {
  at: number;
  quality: 'healthy' | 'breaching' | 'insufficient' | 'unavailable';
  p95Ms: number | null;
  rps: number | null;
  errorRate: number | null;
  count: number;
  ageSeconds: number | null;
  windowSeconds: number;
  deployment: string;
  error?: string;
};
export function queries(deployment: string, windowSeconds: number) {
  if (!/^[a-zA-Z0-9_-]+$/.test(deployment)) throw new Error('Invalid deployment');
  if (!Number.isInteger(windowSeconds) || windowSeconds < 10) throw new Error('Invalid window');
  const f = `service="storefront",route="/api/products",deployment="${deployment}"`;
  const w = `[${windowSeconds}s]`;
  return {
    p95: `histogram_quantile(0.95, sum by (le) (rate(storefront_request_duration_seconds_bucket{${f}}${w})))`,
    count: `sum(increase(storefront_request_duration_seconds_count{${f}}${w}))`,
    rps: `sum(rate(storefront_request_duration_seconds_count{${f}}${w}))`,
    errors: `sum(rate(storefront_request_duration_seconds_count{${f},status=~"5.."}${w})) or vector(0)`,
    heartbeat: `max(storefront_heartbeat_seconds{service="storefront",deployment="${deployment}"})`,
  };
}
export async function jsonFetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).pathname}: HTTP ${r.status}`);
  return r.json();
}
export async function prom(query: string) {
  return jsonFetch(`${urls.metrics}/api/v1/query?${new URLSearchParams({ query })}`);
}
export function value(r: any): number | null {
  if (r.status !== 'success') throw new Error(r.error || 'Telemetry query failed');
  const raw = r.data?.result?.[0]?.value?.[1];
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
export function classify(m: Omit<Sample, 'quality'>, c: Config): Sample {
  let quality: Sample['quality'] = 'healthy';
  if (m.ageSeconds === null || m.ageSeconds < -5 || m.ageSeconds > c.freshnessSeconds)
    quality = 'unavailable';
  else if (m.count < c.minSamples || m.p95Ms === null) quality = 'insufficient';
  else if (m.p95Ms > c.thresholdMs) quality = 'breaching';
  return { ...m, quality };
}
export async function sample(deployment: string, c: Config): Promise<Sample> {
  const base = {
    at: Date.now(),
    p95Ms: null,
    rps: null,
    errorRate: null,
    count: 0,
    ageSeconds: null,
    windowSeconds: c.windowSeconds,
    deployment,
  };
  try {
    const q = queries(deployment, c.windowSeconds);
    const [p, n, r, e, h] = await Promise.all(
      Object.values(q).map(async (q) => value(await prom(q)))
    );
    return classify(
      {
        ...base,
        p95Ms: p === null ? null : p * 1000,
        count: n ?? 0,
        rps: r,
        errorRate: r && e !== null ? e / r : null,
        ageSeconds: h === null ? null : Date.now() / 1000 - h,
      },
      c
    );
  } catch (e) {
    return { ...base, quality: 'unavailable', error: String(e) };
  }
}
// Linear interpolation over aggregate cumulative buckets, matching classic Prometheus histograms.
export function histogramQuantile(
  q: number,
  buckets: { le: number; count: number }[]
): number | null {
  const b = [...buckets].sort((a, b) => a.le - b.le);
  if (q < 0 || q > 1 || !b.length || b.at(-1)!.le !== Infinity) return null;
  let prev = 0;
  for (const x of b) {
    if (x.count < prev || x.count < 0) return null;
    prev = x.count;
  }
  const total = b.at(-1)!.count;
  if (!total) return null;
  const rank = q * total;
  let low = 0,
    before = 0;
  for (const x of b) {
    if (x.count >= rank) {
      if (x.le === Infinity) return low;
      return low + ((x.le - low) * (rank - before)) / (x.count - before || 1);
    }
    low = x.le;
    before = x.count;
  }
  return null;
}
