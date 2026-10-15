import { urls } from './config.ts';

export function requireInvestigationEvidence(used: string[], visited: string[]) {
  const origins = visited.flatMap((url) => {
    try {
      return [new URL(url).origin];
    } catch {
      return [];
    }
  });
  const required = [
    'observability/metrics_query',
    'observability/logs_query',
    'observability/traces_search',
    'observability/trace_get',
    'chrome/take_screenshot',
    'chrome/performance_start_trace',
    'chrome/performance_stop_trace',
  ];
  if (
    !required.every((tool) => used.includes(tool)) ||
    !used.some((tool) =>
      ['chrome/list_network_requests', 'chrome/get_network_request'].includes(tool)
    ) ||
    !used.some((tool) => ['chrome/fill', 'chrome/fill_form', 'chrome/click'].includes(tool)) ||
    !origins.includes(urls.app) ||
    !origins.includes(urls.grafana)
  )
    throw new Error(
      'Investigation missing successful browser, metrics, logs, trace detail, screenshot, network or performance-trace evidence'
    );
}
