import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const local = path.join(root, '.local');
export const investigationModeSchema = z.enum(['browser', 'telemetry-only']);
export type InvestigationMode = z.infer<typeof investigationModeSchema>;
export const schema = z.object({
  investigationMode: investigationModeSchema.default('browser'),
  thresholdMs: z.number().positive().max(10000),
  windowSeconds: z.number().int().min(10).max(3600),
  sustainSeconds: z.number().min(0),
  minSamples: z.number().int().positive(),
  freshnessSeconds: z.number().positive(),
  recoveryRatio: z.number().gt(0).lt(1),
  recoverySeconds: z.number().nonnegative(),
  cooldownSeconds: z.number().nonnegative(),
  pollSeconds: z.number().min(1),
  trafficRps: z.number().min(1).max(50),
  budgetSeconds: z.number().min(30).max(3600),
  maxAttempts: z.number().int().min(1).max(3),
  warmupSeconds: z.number().min(2),
  benchmarkSeconds: z.number().min(5),
  benchmarkRps: z.number().min(1).max(30),
  benchmarkRounds: z.number().int().min(2).max(6),
  minimumImprovement: z.number().gt(0).lt(1),
  model: z.string().nullable(),
  targetRemote: z
    .string()
    .regex(
      /^(git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?|https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?)$/
    )
    .nullable(),
  targetBase: z.string().regex(/^[\w./-]+$/),
  dockerContext: z.string().regex(/^[\w-]+$/),
});
export type Config = z.infer<typeof schema>;
export function config(): Config {
  const read = (f: string) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
  return schema.parse({
    ...read('config/demo.json'),
    ...(process.env.PERF_PROFILE === 'monitor' ? read('config/monitor.json') : {}),
    ...(existsSync(path.join(root, 'config/local.json')) ? read('config/local.json') : {}),
  });
}
export function initLocal() {
  mkdirSync(local, { recursive: true, mode: 0o700 });
  for (const dir of ['results', 'worktrees', 'releases', 'logs'])
    mkdirSync(path.join(local, dir), { recursive: true });
}
export const urls = {
  dashboard: 'http://127.0.0.1:4310',
  app: 'http://127.0.0.1:4100',
  candidate: 'http://127.0.0.1:4101',
  baseline: 'http://127.0.0.1:4102',
  grafana: 'http://127.0.0.1:3001',
  metrics: 'http://127.0.0.1:9091',
  logs: 'http://127.0.0.1:3101',
  traces: 'http://127.0.0.1:3201',
};
