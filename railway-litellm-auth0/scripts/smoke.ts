import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { validateIdentity, type LabConfig } from './settings.ts';

export async function smoke(c: LabConfig) {
  validateIdentity(c);
  if (!c.gatewayUrl.startsWith('https://')) throw new Error('Deploy the gateway first');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const callback = `http://127.0.0.1:${c.redirectPort}/callback`;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (e: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  const listener = createServer((req, res) => {
    const url = new URL(req.url ?? '/', callback);
    if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
    const returned = Buffer.from(url.searchParams.get('state') ?? '');
    const expected = Buffer.from(state);
    if (returned.length !== expected.length || !timingSafeEqual(returned, expected)) { res.writeHead(400).end('Invalid OAuth state'); return; }
    const code = url.searchParams.get('code');
    res.setHeader('Content-Type', 'text/plain'); res.setHeader('Cache-Control', 'no-store');
    if (!code) { res.writeHead(400).end('Sign-in failed. Return to the terminal.'); rejectCode(new Error('OAuth authorization failed')); return; }
    res.end('Sign-in complete. Return to the terminal.'); resolveCode(code);
  });
  listener.listen(c.redirectPort, '127.0.0.1');
  await once(listener, 'listening');
  const authorize = new URL(`https://${c.auth0Domain}/authorize`);
  authorize.search = new URLSearchParams({ response_type: 'code', client_id: c.oauthClientId,
    redirect_uri: callback, scope: `openid profile offline_access ${c.scope}`, audience: c.audience,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state,
    prompt: 'login', connection: `${c.projectName}-users` }).toString();
  console.log('Opening Auth0 sign-in. This test makes three small model requests and uses API credit.');
  const browser = spawn('open', [authorize.href], { stdio: 'ignore' });
  browser.on('error', () => console.log('Open this sign-in URL in your browser: ' + authorize.href));
  const timer = setTimeout(() => rejectCode(new Error('Browser sign-in timed out')), 180000);
  let code: string;
  try { code = await codePromise; } finally { clearTimeout(timer); listener.close(); listener.closeAllConnections(); }
  const tokenUrl = `https://${c.auth0Domain}/oauth/token`;
  const exchange = async (fields: Record<string, string>) => {
    const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.oauthClientId, ...fields }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`OAuth token exchange failed (${response.status}); check client, callback, and offline-access settings`);
    return await response.json() as { access_token: string; refresh_token?: string };
  };
  const tokens = await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: callback });
  if (!tokens.refresh_token) throw new Error('Auth0 did not issue a refresh token');
  const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  console.log('PASS browser PKCE login and refresh grant');
  const send = (body: unknown, token = refreshed.access_token) => fetch(c.gatewayUrl + '/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
  });
  const denied = await send({ model: c.defaultModel, input: 'test' }, 'invalid');
  if (denied.status !== 401) throw new Error('Invalid-token rejection failed');
  await denied.body?.cancel();
  const unknown = await send({ model: 'not-enabled', input: 'test' });
  if (unknown.status !== 403) throw new Error('Model restriction failed');
  await unknown.body?.cancel();
  const streamed = await send({ model: c.defaultModel, input: 'Reply with exactly gateway-ok', stream: true, store: false });
  if (!streamed.ok) throw new Error(`Streaming request failed (${streamed.status})`);
  let stream = '';
  for await (const chunk of streamed.body!) stream += new TextDecoder().decode(chunk);
  if (!stream.includes('response.completed') || !stream.includes('gateway-ok')) throw new Error('Missing completed Responses stream');
  console.log('PASS token rejection, model restriction, and completed Responses stream');
  const tools = [{ type: 'function', name: 'get_lab_number', description: 'Return the lab number',
    parameters: { type: 'object', properties: {}, additionalProperties: false, required: [] }, strict: true }];
  const input = [{ role: 'user', content: 'Use get_lab_number and then tell me its value.' }];
  const first = await send({ model: c.defaultModel, input, tools, tool_choice: { type: 'function', name: 'get_lab_number' },
    include: ['reasoning.encrypted_content'], store: false });
  if (!first.ok) throw new Error(`Tool request failed (${first.status})`);
  const data = await first.json() as { output: any[] };
  const calls = data.output.filter(item => item.type === 'function_call');
  if (!calls.length || calls.some(item => item.name !== 'get_lab_number')) throw new Error('Expected tool call was not returned');
  const next = await send({ model: c.defaultModel, tools, input: [...input, ...data.output,
    ...calls.map(item => ({ type: 'function_call_output', call_id: item.call_id, output: '42' }))], store: false });
  if (!next.ok) throw new Error(`Replayed tool result failed (${next.status})`);
  const completed = await next.json() as { output: any[] };
  const answer = completed.output.filter(item => item.type === 'message').flatMap(item => item.content ?? [])
    .filter(part => part.type === 'output_text').map(part => part.text).join('');
  if (!answer.includes('42')) throw new Error('Tool-result continuation did not return the lab number');
  console.log('PASS function call and replayed tool-result continuation');
  console.log('Verify the matching user/model/spend in Postgres. Then run the desktop acceptance steps in README.md.');
  // Tokens stay in memory and are never printed or written to disk.
}
