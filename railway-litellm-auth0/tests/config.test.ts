import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Codex config recovery regressions in isolated temporary homes', () => {
  const result = spawnSync('python3', ['tests/codex_config_test.py', '-v'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
