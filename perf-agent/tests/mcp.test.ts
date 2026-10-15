import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { root } from '../src/config.ts';
test('real telemetry MCP advertises only read-only, closed-world tools', async () => {
  const client = new Client({ name: 'perf-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/telemetry-mcp.ts'],
    cwd: root,
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'logs_query',
      'metrics_query',
      'trace_get',
      'traces_search',
    ]);
    for (const t of tools) {
      assert.equal(t.annotations?.readOnlyHint, true);
      assert.equal(t.annotations?.destructiveHint, false);
      assert.equal(t.annotations?.openWorldHint, false);
    }
  } finally {
    await client.close();
  }
});
