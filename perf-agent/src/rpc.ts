import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
export class Rpc extends EventEmitter {
  seq = 0;
  pending = new Map<
    number,
    { resolve: (x: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  closed = false;
  constructor(public send: (msg: unknown) => void) {
    super();
  }
  request(method: string, params: unknown = {}, timeout = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('app-server disconnected'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server timeout: ${method}; outcome unknown`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  notify(method: string, params: unknown = {}) {
    this.send({ method, params });
  }
  receive(line: string) {
    let m: any;
    try {
      m = JSON.parse(line);
    } catch {
      this.disconnect(new Error('Malformed app-server JSON'));
      return;
    }
    if (m.method && m.id !== undefined) {
      this.emit('request', m);
      return;
    }
    if (m.id !== undefined) {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      m.error ? p.reject(new Error(`${m.error.code}: ${m.error.message}`)) : p.resolve(m.result);
      return;
    }
    if (m.method) this.emit('notification', m);
  }
  disconnect(e = new Error('app-server disconnected')) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
    this.emit('disconnect', e);
  }
  async initialize() {
    const r = await this.request('initialize', {
      clientInfo: { name: 'perf_agent_local', title: 'Performance Agent', version: '0.1.0' },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: ['item/reasoning/textDelta', 'item/reasoning/summaryTextDelta'],
      },
    });
    this.notify('initialized');
    return r;
  }
}
export class AppServer extends Rpc {
  process: ChildProcessWithoutNullStreams;
  constructor(args: string[] = [], env: NodeJS.ProcessEnv = process.env, cwd?: string) {
    const child = spawn('codex', ['app-server', '--listen', 'stdio://', ...args], {
      stdio: 'pipe',
      env,
      cwd,
    });
    super((m) => child.stdin.write(JSON.stringify(m) + '\n'));
    this.process = child;
    createInterface({ input: child.stdout }).on('line', (l) => this.receive(l));
    child.stderr.on('data', (b) => this.emit('stderr', String(b)));
    child.on('error', (e) => this.disconnect(e));
    child.on('exit', (code, signal) =>
      this.disconnect(new Error(`app-server exited (${code ?? signal})`))
    );
    child.stdin.on('error', (e) => this.disconnect(e));
  }
  async stop() {
    if (this.process.exitCode !== null) return;
    this.process.stdin.end();
    const exited = new Promise<void>((r) => this.process.once('exit', () => r()));
    this.process.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    if (this.process.exitCode === null) this.process.kill('SIGKILL');
    this.disconnect();
  }
}
export function publicEvent(m: any): unknown | null {
  if (/reasoning|plan\/delta/i.test(m.method)) return null;
  const i = m.params?.item;
  if (i?.type === 'reasoning' || i?.type === 'plan' || i?.type === 'userMessage') return null;
  if (m.method === 'item/agentMessage/delta')
    return { method: m.method, delta: m.params.delta, itemId: m.params.itemId };
  if (i) {
    const item = { ...i };
    if (item.type === 'mcpToolCall' && item.result?.content)
      item.result = {
        ...item.result,
        content: item.result.content.map((c: any) =>
          c.type === 'image' ? { type: 'image', mimeType: c.mimeType, omitted: true } : c
        ),
      };
    return { method: m.method, item };
  }
  if (['turn/started', 'turn/completed'].includes(m.method))
    return {
      method: m.method,
      params: {
        turn: { id: m.params.turn.id, status: m.params.turn.status, error: m.params.turn.error },
      },
    };
  if (
    ['thread/tokenUsage/updated', 'error', 'item/commandExecution/outputDelta'].includes(m.method)
  )
    return m;
  return null;
}
