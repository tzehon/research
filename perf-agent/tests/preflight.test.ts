import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root, schema } from '../src/config.ts';
import { preflight } from '../src/preflight.ts';

test('telemetry-only preflight never probes Chrome but retains other prerequisites', async () => {
  const cfg = schema.parse({
    ...JSON.parse(readFileSync(path.join(root, 'config/demo.json'), 'utf8')),
    investigationMode: 'telemetry-only',
  });
  const calls: string[] = [];
  const dependencies = {
    existsSync: () => {
      throw new Error('Chrome must not be probed');
    },
    run: async (command: string, args: string[]) => {
      calls.push([command, ...args].join(' '));
      return command === 'codex' ? 'codex-cli 0.155.1' : '';
    },
  };
  await preflight(cfg, dependencies);
  assert.deepEqual(calls, [
    'codex --version',
    'codex login status',
    'git --version',
    `docker --context ${cfg.dockerContext} info --format {{.OperatingSystem}}`,
    `docker --context ${cfg.dockerContext} compose version`,
  ]);
  await assert.rejects(
    preflight(cfg, {
      ...dependencies,
      run: async () => {
        throw new Error('Codex unavailable');
      },
    }),
    /Codex unavailable/
  );
  await assert.rejects(
    preflight(
      { ...cfg, investigationMode: 'browser' },
      { ...dependencies, existsSync: () => false }
    ),
    /Install Google Chrome.*telemetry-only/
  );
  await assert.rejects(
    preflight(
      { ...cfg, investigationMode: 'browser' },
      {
        ...dependencies,
        existsSync: () => true,
        run: async (command, args) =>
          command.includes('Google Chrome')
            ? 'Google Chrome 148.0'
            : dependencies.run(command, args),
      }
    ),
    /Chrome 149/
  );
});
