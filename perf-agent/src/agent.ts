import {
  mkdirSync,
  existsSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
  lstatSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { AppServer, publicEvent } from './rpc.ts';
import { root, local, urls, type Config } from './config.ts';
import { queries } from './metrics.ts';
import type { Store, Incident } from './state.ts';
export const outcomeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ready', 'insufficient_evidence'] },
    diagnosis: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    changes: { type: 'array', items: { type: 'string' } },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'diagnosis', 'evidence', 'changes', 'uncertainties'],
};
export const outcome = z
  .object({
    status: z.enum(['ready', 'insufficient_evidence']),
    diagnosis: z.string().min(10),
    evidence: z.array(z.string()).min(1),
    changes: z.array(z.string()),
    uncertainties: z.array(z.string()),
  })
  .strict();
export function agentEnvironment() {
  const home = path.join(local, 'codex-home');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const auth = path.join(os.homedir(), '.codex', 'auth.json');
  if (existsSync(auth) && !existsSync(path.join(home, 'auth.json')))
    symlinkSync(auth, path.join(home, 'auth.json'));
  return { ...process.env, CODEX_HOME: home };
}
export function agentConfig(i: Incident) {
  const evidence = path.join(i.worktree!, 'evidence');
  mkdirSync(evidence, { recursive: true });
  return {
    mcp_servers: {
      observability: {
        command: process.execPath,
        args: [
          path.join(root, 'node_modules/tsx/dist/cli.mjs'),
          path.join(root, 'src/telemetry-mcp.ts'),
        ],
        required: true,
      },
      chrome: {
        default_tools_approval_mode: 'approve',
        enabled_tools: [
          'new_page',
          'navigate_page',
          'list_pages',
          'select_page',
          'take_snapshot',
          'take_screenshot',
          'fill',
          'fill_form',
          'click',
          'wait_for',
          'list_network_requests',
          'get_network_request',
          'performance_start_trace',
          'performance_stop_trace',
          'performance_analyze_insight',
          'list_console_messages',
          'get_console_message',
        ],
        command: process.execPath,
        args: [
          path.join(root, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
          '--headless',
          `--user-data-dir=${path.join(local, 'chrome', i.id)}`,
          `--workspace=${evidence}`,
          '--no-usage-statistics',
          '--no-performance-crux',
          '--redact-network-headers',
          '--allowed-url-pattern=http://127.0.0.1:4100/*',
          '--allowed-url-pattern=http://127.0.0.1:3001/*',
          '--allowed-url-pattern=http://127.0.0.1:4101/*',
        ],
        required: true,
      },
    },
    features: { apps: false, multi_agent: false },
    web_search: 'disabled',
  };
}
export class AgentSession {
  rpc?: AppServer;
  constructor(
    public store: Store,
    public cfg: Config
  ) {}
  async run(i: Incident, phase: 'Investigating' | 'Fixing', signal: AbortSignal) {
    const rpc = (this.rpc = new AppServer([], agentEnvironment(), i.worktree));
    let finalText = '';
    let doneResolve: (v: any) => void = () => {};
    let doneReject: (e: Error) => void = () => {};
    const done = new Promise<any>((res, rej) => {
      doneResolve = res;
      doneReject = rej;
    });
    done.catch(() => {});
    let started = false;
    const timer = setTimeout(
      () => {
        void this.cancel();
        doneReject(new Error('Investigation time budget exhausted'));
      },
      Math.max(1, i.deadline - Date.now())
    );
    const abort = () => {
      void this.cancel();
      doneReject(new Error('Investigation cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    rpc.on('disconnect', (e: Error) => doneReject(e));
    rpc.on('request', (m: any) => {
      this.store.event(i.id, 'approval', {
        method: m.method,
        server: m.params?.serverName,
        reason:
          m.params?.reason ||
          m.params?.message ||
          'An action requires extra permission; demo policy denies escalation.',
      });
      if (m.method.includes('requestApproval'))
        rpc.send({ id: m.id, result: { decision: 'decline' } });
      else if (m.method === 'item/tool/requestUserInput')
        rpc.send({ id: m.id, result: { answers: {} } });
      else if (m.method === 'mcpServer/elicitation/request')
        rpc.send({ id: m.id, result: { action: 'decline', content: null, _meta: null } });
      else
        rpc.send({
          id: m.id,
          error: { code: -32601, message: 'Unsupported server request; denied' },
        });
      doneReject(new Error(`Approval required (${m.method}); denied by local demo policy`));
    });
    rpc.on('notification', (m: any) => {
      if (m.method === 'thread/started' && !i.threadId) {
        i.threadId = m.params.thread.id;
        this.store.save(i);
      }
      if (m.method === 'turn/started') {
        i.turnId = m.params.turn.id;
        this.store.save(i);
        started = true;
      }
      const event = publicEvent(m);
      if (event) this.store.event(i.id, 'app-server', event);
      if (m.method === 'thread/tokenUsage/updated') {
        i.tokens = m.params.tokenUsage.total.totalTokens;
        this.store.save(i);
        if (i.tokens > this.cfg.tokenBudget) {
          void this.cancel();
          doneReject(new Error('Token budget exhausted (checked at usage updates)'));
        }
      }
      const item = m.params?.item;
      if (m.method === 'item/completed' && item?.type === 'agentMessage') finalText = item.text;
      if (
        m.method === 'item/completed' &&
        item?.type === 'mcpToolCall' &&
        item.status === 'completed' &&
        !item.error &&
        !item.result?.isError
      ) {
        const used = this.store.get<string[]>(`tools:${i.id}`, []);
        const key = `${item.server}/${item.tool}`;
        this.store.set(`tools:${i.id}`, [...new Set([...used, key])]);
        if (
          item.server === 'chrome' &&
          ['new_page', 'navigate_page'].includes(item.tool) &&
          typeof item.arguments?.url === 'string'
        ) {
          const visited = this.store.get<string[]>(`browserUrls:${i.id}`, []);
          this.store.set(`browserUrls:${i.id}`, [...new Set([...visited, item.arguments.url])]);
        }
        // Chrome returns a file reference (rather than inline pixels) when filePath is supplied.
        const capturePath = item.arguments?.filePath;
        if (
          item.server === 'chrome' &&
          item.tool === 'take_screenshot' &&
          typeof capturePath === 'string'
        ) {
          const source = path.resolve(i.worktree!, capturePath);
          const evidenceRoot = path.join(i.worktree!, 'evidence') + path.sep;
          if (
            source.startsWith(evidenceRoot) &&
            /\.(png|jpe?g|webp)$/.test(source) &&
            existsSync(source) &&
            lstatSync(source).isFile()
          ) {
            const name = path.basename(source);
            copyFileSync(source, path.join(local, 'results', i.id, name));
            this.store.event(i.id, 'screenshot', {
              url: `/evidence/${i.id}/${name}`,
              label: item.tool,
            });
          }
        }
        for (const [index, content] of (item.result?.content || []).entries())
          if (content.type === 'image' && content.data) {
            const ext = content.mimeType === 'image/jpeg' ? 'jpg' : 'png';
            const file = `${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}.${ext}`;
            const dir = path.join(local, 'results', i.id);
            mkdirSync(dir, { recursive: true });
            writeFileSync(path.join(dir, file), Buffer.from(content.data, 'base64'), {
              mode: 0o600,
            });
            this.store.event(i.id, 'screenshot', {
              url: `/evidence/${i.id}/${file}`,
              label: item.tool,
            });
          }
      }
      if (m.method === 'turn/completed' && started) {
        const turn = m.params.turn;
        if (turn.status === 'completed') doneResolve(turn);
        else
          doneReject(
            new Error(`Codex turn ${turn.status}: ${turn.error?.message || 'interrupted'}`)
          );
      }
    });
    try {
      signal.throwIfAborted();
      await rpc.initialize();
      const params = {
        cwd: i.worktree,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        model: this.cfg.model,
        config: agentConfig(i),
        developerInstructions:
          'You are investigating a local performance incident. Do not expose hidden reasoning. Give concise findings and evidence. Application source is the only writable scope. Never operate the controller or change benchmark/telemetry/scenario controls. Never use other repositories, history, or prewritten solutions. Use runtime evidence and current source. Only src/search.mjs may change; evidence files are allowed. No git commit, push, PR, deployment, or dependency installation.',
      };
      if (i.threadId)
        await rpc.request('thread/resume', { ...params, threadId: i.threadId }, 60000);
      else {
        if (this.store.get(`threadIntent:${i.id}`, false))
          throw new Error('Thread creation outcome unknown; refusing a duplicate thread');
        this.store.set(`threadIntent:${i.id}`, true);
        const r = await rpc.request('thread/start', params, 60000);
        i.threadId = r.thread.id;
        this.store.save(i);
      }
      const evidence = JSON.stringify({
        incident: i.id,
        affectedRevision: i.revision,
        app: urls.app,
        grafana: urls.grafana + '/d/storefront/local-storefront',
        queries: queries(i.deployment, this.cfg.windowSeconds),
        latestMetric: this.store.get('sample', null),
      });
      const task =
        phase === 'Investigating'
          ? `Investigate this sustained p95 latency breach. Do not edit yet. Evidence context: ${evidence}. Use observability MCP for precise metrics, structured logs, trace search and trace detail. Use Chrome DevTools MCP to open the storefront, exercise product search, inspect network requests, capture a screenshot and a performance trace, and inspect the Grafana dashboard. Save browser evidence in ${path.join(i.worktree!, 'evidence')}. Read current application source. Return an evidence-based diagnosis with uncertainties, or insufficient_evidence. status ready means enough evidence to attempt a fix, not validated success.`
          : `Implement a minimal application-source performance fix based on your investigation. Only edit src/search.mjs. Preserve all search/inventory semantics, do not disable work or hardcode fixtures. The controller runs independent validation. Return changes and diagnosis in the requested structure. If evidence is insufficient do not invent a fix.`;
      await rpc.request(
        'turn/start',
        {
          threadId: i.threadId,
          input: [{ type: 'text', text: task, text_elements: [] }],
          cwd: i.worktree,
          approvalPolicy: 'on-request',
          sandboxPolicy: {
            type: 'workspaceWrite',
            writableRoots: [i.worktree!],
            networkAccess: false,
            excludeTmpdirEnvVar: true,
            excludeSlashTmp: true,
          },
          summary: 'none',
          outputSchema: outcomeSchema,
        },
        60000
      );
      await done;
      const parsed = outcome.parse(JSON.parse(finalText));
      if (parsed.status !== 'ready') throw new Error(`Insufficient evidence: ${parsed.diagnosis}`);
      return parsed;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      await rpc.stop();
      this.rpc = undefined;
    }
  }
  async cancel() {
    const rpc = this.rpc;
    if (!rpc) return;
    const i = this.store
      .all()
      .find((x) => x.turnId && ['Investigating', 'Fixing'].includes(x.phase));
    if (i?.threadId && i.turnId)
      await rpc
        .request('turn/interrupt', { threadId: i.threadId, turnId: i.turnId }, 3000)
        .catch(() => {});
    await rpc.stop();
  }
}
