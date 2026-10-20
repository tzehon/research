import { existsSync } from 'node:fs';
import type { Config } from './config.ts';
import { run } from './system.ts';
import { requireCodexVersion } from './codex-version.ts';

export async function preflight(c: Config, dependencies = { run, existsSync }) {
  const { run, existsSync } = dependencies;
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Node 24+ is required (node:sqlite).');
  const version = await run('codex', ['--version']);
  requireCodexVersion(version);
  await run('codex', ['login', 'status']);
  await run('git', ['--version']);
  await run('docker', ['--context', c.dockerContext, 'info', '--format', '{{.OperatingSystem}}']);
  if (c.investigationMode === 'browser') {
    if (!existsSync('/Applications/Google Chrome.app'))
      throw new Error(
        'Install Google Chrome in /Applications for Chrome DevTools MCP, or set investigationMode to telemetry-only in config/local.json.'
      );
    const chromeVersion = await run(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ['--version']
    );
    if (Number(chromeVersion.match(/Chrome (\d+)/)?.[1] || 0) < 149)
      throw new Error(
        'Chrome 149+ is required for the local browser URL allowlist, or set investigationMode to telemetry-only in config/local.json.'
      );
  }
  await run('docker', ['--context', c.dockerContext, 'compose', 'version']);
  if (c.targetRemote) await run('gh', ['auth', 'status']);
}
