# 05 — Connect Codex and ChatGPT, then prove both work

This chapter connects the same Railway-hosted, read-only YNAB MCP server to two clients. Complete the authentication chapter first. Use fixtures for the first successful connection; turn on live YNAB access only after the negative authorization tests pass. These are implementation and acceptance instructions, not a claim that the server or either connection already exists.

## Check access before spending money

In your actual ChatGPT account and intended workspace, open [Plugins](https://chatgpt.com/plugins) and look for **+ → Add custom MCP server**. Check that OAuth configuration accepts a pre-registered client. Availability depends on account/workspace permissions and security settings; this guide does not assume a particular subscription unlocks it. If the control is missing, resolve eligibility with the workspace administrator or current account settings before buying hosting or changing plans. The documented web flow uses custom MCP plugins and supports supplied OAuth client credentials. [OpenAI custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)

In Codex, check the installed version and `codex mcp add --help`. Confirm that `--url`, `--oauth-client-id`, and OAuth login are available. Use the installed client's current controls if labels differ. Desktop/CLI local-host configuration is separate from a ChatGPT web connection; completing one does not demonstrate the other works.

## Record the connection contract

Record these **non-secret** values in the deployment issue or portable progress index:

| Item | Expected value |
|---|---|
| MCP endpoint | Exact `MCP_PUBLIC_URL`, ending in `/mcp` |
| Transport | Streamable HTTP over public HTTPS |
| Resource/audience | `AUTH_AUDIENCE`, exactly equal to `MCP_PUBLIC_URL` |
| Authorization issuer | Exact `AUTH_ISSUER`, including any trailing slash |
| API permission | Project-defined `ynab:read` |
| Permitted person | `AUTH_ALLOWED_SUBJECT` under that issuer |
| Client registrations | Separate Auth0 registrations for Codex and ChatGPT |
| Initial data mode | `DATA_MODE=fixtures` |

Do not confuse the three credentials: the user's Auth0 login establishes their identity; an Auth0 access token authorizes that person to use this MCP server; `YNAB_ACCESS_TOKEN` authorizes the server's upstream requests. Only the last credential accesses YNAB. Store it in Railway's secret variables. Neither client receives it, and it is never a tool argument or result.

The default design uses explicit OAuth client registrations: a public native Codex client and a confidential ChatGPT web client. It avoids requiring open dynamic registration or a custom OAuth proxy. Client IDs may be recorded; client secrets, authorization codes, access tokens and refresh tokens may not. A model API key is unnecessary for this server: it exposes YNAB tools and does not call an OpenAI model API.

## Prepare discovery and login

Before adding either client, run the project's unauthenticated smoke test against Railway. Expect a `401` challenge pointing to protected-resource metadata, then readable metadata advertising the correct resource and Auth0 issuer. Verify authorization-server metadata exposes PKCE `S256`. A normal browser GET to `/mcp` is not a substitute for an MCP initialization test.

The server must verify the token's signature, issuer, audience, lifetime, scope and allowed subject before returning financial data. A successful Auth0 login alone is insufficient. OpenAI's authentication contract uses resource discovery, authorization code plus PKCE, and token validation; the exact callback depends on issuer-identification support. Copy the callback actually shown by the client instead of using a URL from a tutorial. [OpenAI authentication requirements](https://developers.openai.com/plugins/build/auth)

## Connect Codex

1. In Auth0, obtain the client ID for the dedicated **Native** application from the authentication chapter. Its token-endpoint method is `none`; do not give a desktop client a secret.
2. On the computer that will run Codex, add the remote server:

   ```bash
   codex mcp add ynab \
     --url 'https://YOUR-SERVICE.up.railway.app/mcp' \
     --oauth-client-id 'YOUR_CODEX_CLIENT_ID' \
     --oauth-resource 'https://YOUR-SERVICE.up.railway.app/mcp'
   ```

3. Register the exact callback printed by Codex in that Auth0 application's allowed callbacks. If Auth0 rejects an ephemeral loopback port, edit the existing `[mcp_servers.ynab.oauth]` table in the local Codex configuration and set `callback_port = 45461` (or another available port). Preserve its generated `client_id`, `callback_url` and other fields; do not create a duplicate table. Retry login and register the actual resulting `redirect_uri`, including that port when present. Retain the exact host/path; do not substitute `localhost` for `127.0.0.1` or use a callback wildcard.
4. Run `codex mcp login ynab --scopes ynab:read`. Sign in as the one permitted Auth0 user and complete consent. Do not paste returned codes or tokens into this chat.
5. Run `codex mcp list`, then start a fresh Codex chat and use `/mcp` to inspect available tools. If using the desktop server-settings UI, choose Streamable HTTP, save the same URL, restart the connection, and authenticate.

Codex supports pre-registered client IDs, OAuth login, and host-local MCP configuration. Its generated callback and stored configuration are the authority for this installation. [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp), [MCP CLI commands](https://learn.chatgpt.com/docs/developer-commands#codex-mcp)

## Connect ChatGPT

1. Open **Plugins → + → Add custom MCP server** in the intended account/workspace.
2. Name it **YNAB Read Only — Fixtures** initially. Enter the complete Railway `/mcp` URL.
3. Select **OAuth**. Supply the dedicated ChatGPT application's client ID and secret directly into the product's credential fields. Match the token-endpoint authentication method configured in Auth0; use the documented secret method selected in the authentication chapter. If a scope field is shown, set `ynab:read`; the server's metadata/challenge must advertise it too. Do not select anonymous or mixed authentication for this private server.
4. Copy the exact callback shown for this connection into the ChatGPT application's Auth0 allowed callbacks. Save the Auth0 configuration before retrying the connection. If the UI reveals the callback only after creation, create the configuration, register the displayed callback, then reconnect.
5. Complete the displayed consent, create/install the plugin, and review the discovered tool names. Start a new conversation and select it with `@`.
6. Ask it to call `ynab_list_plans` using fixture data. Expand the tool call and verify that result explicitly identifies fixture data. Configuration may still use YNAB's older `BUDGET` naming; returned plan IDs are the identifiers to use.

After changing tool metadata, deploy the server, open this connection's management page and select **Refresh**, then test in a new conversation. Endpoint validation and tool discovery are part of OpenAI's documented connection workflow. [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Acceptance evidence for both clients

Create one small test table in the relevant Jira issue. Record date, deployment commit SHA, client/version, fixture/live mode, tool name, pass/fail and a redacted evidence link. Do not copy transactions or balances into a public PR. Owner login, discovery, normal tool calls and a second-user denial must be observed in each actual client. Run crafted malformed-token/input cases in the server test harness or Inspector; ChatGPT's UI is not expected to let you inject forged tokens. Record which surface produced each result:

| Test | Required evidence |
|---|---|
| Initialization and `tools/list` | Inspector or protocol test shows only the intended read tools and valid schemas. Each client discovers the same capabilities. |
| `tools/call` | `ynab_list_plans` and `ynab_list_transactions(plan_id, since_date, limit, cursor)` return fixture data matching the schemas. |
| Follow-up | `ynab_list_accounts(plan_id)`, `ynab_list_categories(plan_id)` and `ynab_get_month(plan_id, month)` use a returned plan ID; month is `YYYY-MM-01`. |
| Boundary | A disallowed plan, malformed ID and excessive date range fail without upstream access or private data. |
| Completeness | A capped transaction result has an opaque continuation cursor or explicit truncation; the assistant does not describe an incomplete sum as a complete total. |
| Unauthorized person | A different Auth0 user authenticates but is refused by the server. No YNAB request occurs. |
| Missing/wrong token (server harness) | Missing, expired, wrong-issuer, wrong-audience and insufficient-scope tokens fail; exercise controlled tokens in the harness, not by injecting them into ChatGPT UI. |
| No writes | A request to create/change/delete a transaction cannot find or call a write tool. |
| Restart | The same URL still works after a Railway restart/redeploy; login is renewed only when required. |

Use MCP Inspector to exercise protocol-level listing/calls. In Codex and ChatGPT, inspect actual tool-call details; do not count a plausible natural-language answer as evidence. After these pass, change to `DATA_MODE=live`, provide the YNAB secret and budget allowlist through Railway, redeploy, and repeat a narrow read test in each client. Compare its result with YNAB yourself. Keep the fixture tests for repeatable regression checks.

## Reconnect without redeploying

**New computer:** install/sign into Codex, add the same endpoint and public client ID, verify that machine's callback, and log into Auth0 again. Recreate local configuration rather than copying token caches. The Railway service, YNAB PAT and ChatGPT plugin do not need redeployment solely because you changed computers.

**New ChatGPT device:** use the same account/workspace, locate the installed plugin, and reconnect if prompted. A different account/workspace is a separate connection and may lack permission. Never widen `AUTH_ALLOWED_SUBJECT` merely to clear an authorization error.

**New server release:** keep the public URL, issuer and audience stable; redeploy, run smoke tests, and refresh changed client metadata. An endpoint/issuer change is a migration: update registrations, metadata, audience and both clients together, then revoke obsolete credentials.

## Diagnose in this order

| Symptom | First check |
|---|---|
| Custom MCP control missing | Account/workspace eligibility and security policy, before infrastructure changes |
| Timeout/502 | Railway process health, HTTPS URL, `/mcp` path and transport |
| Discovery/PKCE error | Resource metadata and Auth0's actual discovery document |
| Callback mismatch | Exact displayed URI, scheme, host, path and loopback port |
| `invalid_client` | Correct dedicated registration, secret/method, credential expiry or accidental CIMD selection |
| Login succeeds; MCP returns 401/403 | Verified issuer/audience, `ynab:read`, allowed subject and resource compatibility |
| MCP succeeds; YNAB fails | Server-side PAT, budget allowlist and upstream status; do not rotate client auth blindly |
| Old/missing tools | Deployment SHA, metadata refresh and a new conversation |

Save only redacted error codes, correlation IDs and deployment references. Tokens do not belong in troubleshooting screenshots. Finish this chapter only when both clients pass the matrix and the Jira issue links to that evidence.
