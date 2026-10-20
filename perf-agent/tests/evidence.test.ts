import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireInvestigationEvidence } from '../src/evidence.ts';

test('telemetry-only needs every telemetry tool but no browser tools or visits', () => {
  const tools = [
    'observability/metrics_query',
    'observability/logs_query',
    'observability/traces_search',
    'observability/trace_get',
  ];
  assert.doesNotThrow(() => requireInvestigationEvidence(tools, [], 'telemetry-only'));
  for (const missing of tools)
    assert.throws(
      () =>
        requireInvestigationEvidence(
          tools.filter((tool) => tool !== missing),
          [],
          'telemetry-only'
        ),
      /missing/
    );
  assert.throws(() => requireInvestigationEvidence(tools, [], 'browser'), /missing/);
});

test('investigation requires telemetry detail, an exercised browser journey, and completed captures', () => {
  const tools = [
    'observability/metrics_query',
    'observability/logs_query',
    'observability/traces_search',
    'observability/trace_get',
    'chrome/list_network_requests',
    'chrome/fill',
    'chrome/take_screenshot',
    'chrome/performance_start_trace',
    'chrome/performance_stop_trace',
  ];
  const visits = ['http://127.0.0.1:4100', 'http://127.0.0.1:3001/d/storefront/local-storefront'];
  assert.doesNotThrow(() => requireInvestigationEvidence(tools, visits));
  assert.doesNotThrow(() =>
    requireInvestigationEvidence(tools, ['http://127.0.0.1:4100/', visits[1]])
  );
  for (const missing of ['observability/trace_get', 'chrome/fill', 'chrome/performance_stop_trace'])
    assert.throws(
      () =>
        requireInvestigationEvidence(
          tools.filter((t) => t !== missing),
          visits
        ),
      /missing/
    );
  assert.throws(
    () => requireInvestigationEvidence(tools, [visits[0], 'http://127.0.0.1:3001.evil.test/']),
    /missing/
  );
  assert.throws(() => requireInvestigationEvidence(tools, [visits[0], 'not a URL']), /missing/);
});
