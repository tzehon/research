import { execFileSync } from 'node:child_process';
import { railwayBin, railwayEnvironment } from './railway-cli.ts';

const historyQuery = `query LabApplyFailures($environmentId: String!) {
  environmentHistory(environmentId: $environmentId, first: 10) {
    edges { node { id outcome operationKind createdAt payload } }
  }
}`;

interface HistoryResponse {
  data?: { environmentHistory?: { edges?: Array<{ node?: {
    id?: string; outcome?: string; operationKind?: string; createdAt?: string;
    payload?: { error?: unknown };
  } }> } };
}

export function applyFailureMessages(response: HistoryResponse, environmentId: string,
  notBefore = 0, secrets: string[] = []): string[] {
  const messages: string[] = [];
  for (const { node } of response.data?.environmentHistory?.edges ?? []) {
    if (node?.outcome !== 'failed' || node.operationKind !== 'patch' ||
        !node.id?.startsWith(`patch:iac-change-set/${environmentId}/`) ||
        !(Date.parse(node.createdAt ?? '') >= notBefore)) continue;
    const error = node.payload?.error;
    // Only show the error text, never dump operation payloads or configuration.
    let message = typeof error === 'string' ? error :
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message : undefined;
    if (!message) continue;
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
      message = message.replaceAll(secret, '[REDACTED]').replaceAll(encodeURIComponent(secret), '[REDACTED]');
    }
    messages.push(message.replace(/[\r\n]+/g, ' ').slice(0, 2000));
  }
  return [...new Set(messages)];
}

export function reportApplyFailures(environmentId: string, notBefore = 0): void {
  try {
    const raw = execFileSync(railwayBin, ['api', historyQuery, '--variables', JSON.stringify({ environmentId })], {
      env: railwayEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
    });
    const secrets = Object.entries(process.env).filter(([name]) => /KEY|TOKEN|SECRET|PASSWORD|SALT/.test(name))
      .map(([, value]) => value ?? '');
    const messages = applyFailureMessages(JSON.parse(raw), environmentId, notBefore, secrets);
    for (const message of messages) console.error(`Railway apply diagnostic: ${message}`);
    if (!messages.length) console.error('No matching failed IaC operation is available yet. Run npm run lab -- diagnose to check again.');
  } catch {
    console.error('Could not retrieve Railway apply diagnostics. Run npm run lab -- diagnose or check the project history in Railway.');
  }
}
