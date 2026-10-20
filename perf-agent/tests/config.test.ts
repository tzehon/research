import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root, schema } from '../src/config.ts';

test('investigation mode is explicit, validated, and defaults to browser for existing configs', () => {
  const base = JSON.parse(readFileSync(path.join(root, 'config/demo.json'), 'utf8'));
  delete base.investigationMode;
  assert.equal(schema.parse(base).investigationMode, 'browser');
  assert.equal(
    schema.parse({ ...base, investigationMode: 'telemetry-only' }).investigationMode,
    'telemetry-only'
  );
  assert.throws(() => schema.parse({ ...base, investigationMode: 'telemetry' }));
});
