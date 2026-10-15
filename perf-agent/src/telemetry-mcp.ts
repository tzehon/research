import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { jsonFetch, prom } from './metrics.ts';
import { urls } from './config.ts';
const server = new McpServer({ name: 'local-observability', version: '0.1.0' });
const result = (data: any) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(
        data?.data?.stats ? { ...data, data: { ...data.data, stats: undefined } } : data
      ),
    },
  ],
});
server.tool(
  'metrics_query',
  'Read-only PromQL instant query of local Prometheus.',
  { query: z.string().max(4000) },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ query }) => result(await prom(query))
);
server.tool(
  'logs_query',
  'Read structured application logs with trace IDs from local Loki.',
  { query: z.string().max(4000) },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ query }) =>
    result(
      await jsonFetch(
        `${urls.logs}/loki/api/v1/query_range?${new URLSearchParams({ query, limit: '12', since: '30m' })}`
      )
    )
);
server.tool(
  'traces_search',
  'Search local Tempo. Use TraceQL such as { resource.service.name = "storefront" }. Returns trace IDs.',
  { query: z.string().max(2000) },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ query }) =>
    result(
      await jsonFetch(
        `${urls.traces}/api/search?${new URLSearchParams({ q: query, limit: '10', start: String(Math.floor(Date.now() / 1000) - 1800), end: String(Math.floor(Date.now() / 1000)) })}`
      )
    )
);
server.tool(
  'trace_get',
  'Read the span tree and durations for a local trace.',
  { traceId: z.string().regex(/^[a-fA-F0-9]{16,32}$/) },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ traceId }) =>
    result(
      await jsonFetch(`${urls.traces}/api/traces/${traceId}`, {
        headers: { Accept: 'application/json' },
      })
    )
);
await server.connect(new StdioServerTransport());
