import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFailureMessages } from '../scripts/railway-diagnostics.ts';

const environment = 'lab-environment';
const failure = (error: unknown, overrides = {}) => ({ node: {
  id: `patch:iac-change-set/${environment}/attempt`, outcome: 'failed', operationKind: 'patch',
  createdAt: '2026-11-03T09:03:35.439Z', payload: { error }, ...overrides,
} });

test('surface the server-side apply cause and ignore unrelated or older operations', () => {
  const message = 'Max size of 500 MB on current plan. Please select a valid size or upgrade';
  const response = { data: { environmentHistory: { edges: [
    failure(message), failure(message),
    failure('old failure', { createdAt: '2026-11-02T00:00:00Z' }),
    failure('other environment', { id: 'patch:iac-change-set/other/attempt' }),
    failure('unrelated dashboard patch', { id: 'patch:manual-patch' }),
    failure('success', { outcome: 'applied' }),
  ] } } };
  assert.deepEqual(applyFailureMessages(response, environment, Date.parse('2026-11-03T09:00:00Z')), [message]);
  assert.deepEqual(applyFailureMessages({}, environment), []);
});

test('redact raw and URL-encoded secrets without dumping diagnostic payloads', () => {
  const secret = 'private+token/123';
  const response = { data: { environmentHistory: { edges: [
    failure({ message: `Failed with ${secret} and ${encodeURIComponent(secret)}`, configuration: 'never print this' }),
    failure({ configuration: 'never print this either' }),
  ] } } };
  assert.deepEqual(applyFailureMessages(response, environment, 0, [secret]), [
    'Failed with [REDACTED] and [REDACTED]',
  ]);
});
