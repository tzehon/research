import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { HttpError, providerUserId, type Identity } from './auth.ts';
import type { UserKeys } from './identity-store.ts';

interface Settings { baseUrl: string; models: string[]; maxBodyBytes?: number }
interface Dependencies {
  authenticate: (header: string | undefined) => Promise<Identity>;
  keys: UserKeys; ready: () => Promise<void>; request?: typeof fetch;
}
// Responses fields used by the client; provider/transport overrides are never accepted.
const responseFields = new Set(['model', 'input', 'instructions', 'tools', 'tool_choice',
  'parallel_tool_calls', 'reasoning', 'text', 'temperature', 'top_p', 'max_output_tokens',
  'truncation', 'previous_response_id', 'include', 'stream', 'service_tier',
  'prompt_cache_key', 'prompt_cache_retention', 'stream_options', 'context_management']);

async function readBody(req: IncomingMessage, max: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'Request is too large');
    chunks.push(chunk);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Expected a JSON object'); }
}

function error(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: { message, type: 'gateway_error', code: status } }));
}

export function createGateway(settings: Settings, deps: Dependencies) {
  const request = deps.request ?? fetch;
  return createServer(async (req, res) => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10 * 60 * 1000);
    res.on('close', () => abort.abort());
    try {
      if (req.url === '/healthz' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}'); return;
      }
      if (req.url === '/readyz' && req.method === 'GET') {
        try { await deps.ready(); } catch { throw new HttpError(503, 'Dependencies are not ready'); }
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ready"}'); return;
      }
      const route = `${req.method} ${req.url}`;
      if (!['POST /v1/responses', 'GET /v1/models'].includes(route)) throw new HttpError(404, 'Route not available');
      // Node's normalized headers discard duplicate Authorization fields. Inspect
      // the distinct values so ambiguous credentials fail before provisioning.
      const tokens = req.headersDistinct.authorization;
      const identity = await deps.authenticate(tokens?.length === 1 ? tokens[0] : undefined);
      let body: Record<string, unknown> | undefined;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Expected application/json');
        body = await readBody(req, settings.maxBodyBytes ?? 8 * 1024 * 1024);
        if (typeof body.model !== 'string' || !settings.models.includes(body.model)) throw new HttpError(403, 'Model is not enabled for this lab. Allowed models: ' + settings.models.join(', '));
        for (const field of Object.keys(body)) if (!responseFields.has(field)) delete body[field];
        body.user = providerUserId(identity);
        // Lab uses replayed conversation input; server-side response storage is disabled.
        body.store = false;
      }
      const key = await deps.keys.get(identity);
      if (abort.signal.aborted) return;
      const upstream = await request(settings.baseUrl + req.url, {
        method: req.method, redirect: 'error', signal: abort.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if ([401, 403].includes(upstream.status)) {
        await upstream.body?.cancel();
        throw new HttpError(403, 'Your internal gateway key is disabled or not authorized; contact the lab administrator');
      }
      // Deliberate allowlist: no Auth0 token, cookies, ChatGPT token, or account headers cross this boundary.
      const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };
      for (const name of ['content-type', 'retry-after', 'x-request-id']) {
        const value = upstream.headers.get(name); if (value) headers[name] = value;
      }
      res.writeHead(upstream.status, headers);
      res.flushHeaders();
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          if (!res.write(chunk)) await once(res, 'drain', { signal: abort.signal });
        }
      }
      res.end();
    } catch (cause) {
      if (abort.signal.aborted && res.destroyed) return;
      if (cause instanceof HttpError) error(res, cause.status, cause.message);
      else error(res, 502, 'Gateway dependency request failed');
      // Never log request headers, request bodies, tokens, or upstream error objects.
    } finally { clearTimeout(timeout); }
  });
}
