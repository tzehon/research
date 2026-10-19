import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireCodexVersion } from '../src/codex-version.ts';

test('preflight accepts the minimum Codex CLI version and newer releases', () => {
  for (const version of ['0.155.1', '0.155.2', '0.163.0', '0.1000.0', '1.0.0', '0.155.1+build.1'])
    assert.doesNotThrow(() => requireCodexVersion(`codex-cli ${version}\n`));
});

test('preflight rejects older, below-minimum prerelease, and unrecognized versions', () => {
  for (const output of [
    'codex-cli 0.155.0',
    'codex-cli 0.99.9',
    'codex-cli 0.155.1-alpha.1',
    'codex-cli 0.155',
    'codex-cli 0.155.1invalid',
    'unknown',
  ])
    assert.throws(() => requireCodexVersion(output), /0\.155\.1 or newer is required/);
});
