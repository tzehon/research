# Phase 3a — authenticate the owner before exposing YNAB

The recommended design uses Auth0 as an external authorization server and the MCP service as a token-validating resource server. Configure two ordinary, explicitly registered OAuth clients: **Codex Native** and **ChatGPT Regular Web Application**. Keep `DATA_MODE=fixtures` and omit `YNAB_ACCESS_TOKEN` throughout this chapter.

This is a proposed integration, not a tested login. Current OpenAI documentation supports static OAuth client credentials when supplied. Verify the fields in your actual ChatGPT account before proceeding. [Custom MCP authentication options](https://developers.openai.com/api/docs/guides/custom-mcp-server)

## A1 — Understand the separate authorization boundaries

```text
You sign in to Auth0
  -> Auth0 issues a token for this exact MCP resource
  -> Railway validates that token and permits only your subject
  -> Railway uses its separate YNAB PAT for an allowlisted upstream read
```

- Auth0 login must not allow every person in a tenant to see your finances. Require your exact subject under the configured issuer.
- The YNAB token belongs only in the server's secret store. Do not return it to a tool caller.
- The server does not implement an authorization server, store refresh tokens, or exchange a client's MCP token with YNAB.
- The server needs no OAuth client secret. ChatGPT's confidential-client secret goes into the ChatGPT connection form and your password manager; Codex's public client has no secret.

## A2 — Implement the resource-server checks

Implement this before creating client connections. Use test issuer/key fixtures for local checks; actual Auth0 values are added later. Ask Codex to implement it as a separate Jira issue using maintained OAuth/JWT libraries and the SDK's supported middleware:

> Protect every MCP route using Auth0 discovery/JWKS and the approved resource metadata. Validate signature and allowed algorithm, exact issuer, audience membership, token expiry/not-before, ynab:read scope, and the owner subject. Do not accept ID tokens as API access tokens. Return an authentication challenge for missing/invalid access and reject valid but unauthorized callers before any YNAB call. Include deterministic positive/negative tests and prove that metadata remains discoverable. Keep fixture mode until actual Codex and ChatGPT tests pass.

The implementation contract is:

- Public protected-resource metadata identifies the exact `/mcp` resource, trusted authorization server and `scopes_supported: ["ynab:read"]`. Include `scope="ynab:read"` in the authentication challenge. Follow the SDK's current path convention; derive it from the `WWW-Authenticate` challenge rather than guessing a URL.
- Auth0's authorization-server metadata is reachable and advertises the expected endpoints and PKCE support.
- JWKS rotation is handled with bounded caching; a failed key lookup cannot authorize a request.
- Authorization runs before tool execution, including direct crafted tool calls. Tool annotations alone are not authorization.
- The allowed origin/host policy matches the deployed service. Avoid unrestricted cross-origin behavior merely to get a browser test working.
- Logs record request ID, tool name, status and duration; omit tokens and financial payloads.

These resource-server responsibilities follow the [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization). The exact library implementation belongs in the app, with tests; do not hand-roll an OAuth authorization server.

## A3 — Create/select an Auth0 tenant

1. Sign in at [Auth0 Dashboard](https://manage.auth0.com/). If you have no account, complete signup and create a development tenant following [Auth0's tenant guide](https://auth0.com/docs/get-started/auth0-overview/create-tenants).
2. Reuse a suitable personal tenant if it exists. Prefer an isolated tenant when changing tenant-wide switches could affect another project. Do not automatically reuse the model-gateway lab's API or client registrations.
3. Record the exact tenant domain and issuer, normally `https://YOUR-TENANT.REGION.auth0.com/`. Use the value actually shown by discovery; do not infer the region or omit the trailing slash.
4. Inspect **Settings → Advanced**. Enable **Resource Parameter Compatibility Profile** and **Include Issuer in Authorization Responses**, reviewing the effect on existing tenant applications first. These make standard resource indicators and authorization-response issuer identification available. Do not set a global Default Audience to mask a mismatch. [Auth0 resource compatibility](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile)

**Checkpoint A3:** tenant selected, its issuer known, compatibility settings reviewed and saved. No real financial data is connected.

## A4 — Obtain a stable domain without live data

You need the final public MCP URL to register the API audience. Follow [Railway RD-01 through RD-03, then RD-04 steps 1–2 only](04-railway-deployment.md) to create/select the service and generate its HTTPS domain. Do not attempt RD-04's remaining auth configuration yet; return here with the URL. For domain bootstrap, the issuer/subject prerequisites can wait while all MCP requests remain denied.

If Railway needs a running deployment before domain creation, implement a fixture-only bootstrap configuration in the application first:

1. `DATA_MODE=fixtures`; no YNAB credential exists in the service.
2. `/healthz` can return a minimal healthy response.
3. All `/mcp` requests are refused until valid auth configuration exists. Missing issuer/audience/subject must never mean anonymous access. The process can keep health available in this explicit setup state, while tools remain disabled.
4. A live-mode process with missing required auth or YNAB configuration fails startup instead of silently reverting to fixtures or anonymous mode.
5. Deploy only this reviewed bootstrap version, generate the domain, then configure the real issuer/audience and redeploy. No tool call should succeed during the unconfigured bootstrap.

Record the final endpoint, for example `https://YOUR-SERVICE.up.railway.app/mcp`, as both `MCP_PUBLIC_URL` and `AUTH_AUDIENCE`. The example domain is a placeholder. Preserve path and trailing-slash choices exactly. A future hostname change requires an authorization migration, not just a DNS edit.

## A5 — Register the MCP API and permitted identity

1. Open **Applications → APIs**; check for an existing API with the exact MCP URL as Identifier.
2. If absent, create **YNAB MCP**, use the exact `MCP_PUBLIC_URL` as Identifier, and select RS256 signing. Identifiers/audiences must match the resource the client requests.
3. In Permissions, add `ynab:read` with a description such as “Read the owner's allowlisted YNAB plans through MCP.”
4. Under API **Settings → Application Access Policy**, set **User-Delegated Access** to **Per-app authorization** and **Client Access** to **No apps allowed**. After creating both clients below, open **Application Access**, edit each intended client, grant User-Delegated Access, and select `ynab:read`. Client-credentials access is not needed. If this API already has RBAC enabled, assign `ynab:read` to your owner user; requested scope alone may not grant it. [Access policies](https://auth0.com/docs/get-started/apis/api-access-policies-for-applications), [RBAC behavior](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis)
5. Select the login connection you will use. If creating a database connection/user, create your own user through the dashboard, use a unique password and complete verification as required. Enable that connection for the two clients below.
6. Find your user record in **User Management → Users**. Privately record its stable User ID/subject, for example an actual `auth0|...` or provider-specific subject. Configure `AUTH_ALLOWED_SUBJECT` with this exact value. A display name or email is not a substitute.

The application must compare the validated token's `sub` under `AUTH_ISSUER` with this configured subject on every request. A different user who can sign in must still be rejected. Keep subject and plan IDs in the private register if you do not want them in the research repo.

## A6 — Register Codex as a public native client

1. Under **Applications → Applications**, check for **YNAB MCP — Codex**; reuse its ID if it is the intended registration.
2. Otherwise create a **Native** application. Enable the intended login connection and authorization-code flow with PKCE. Confirm token-endpoint authentication is `none`: a local public client must not hold a confidential client secret.
3. Record its client ID. After the configured fixture service is deployed in RD-05, follow [Chapter 5's Codex add command](05-client-connections.md) to make Codex print the actual callback for this server/provider combination.
4. Add that exact URI to Auth0's **Allowed Callback URLs**. Do not replace the host/path or use a broad wildcard. If variable loopback ports are rejected, choose an explicit per-server callback port in Codex and register the resulting actual URI.
5. Save the registration and API grant now. Complete login requesting `ynab:read` only after RD-05 has deployed the configured fixture server. If the token does not contain the expected scope/audience, fix API grant/resource configuration; do not remove those validation checks.

Codex documents explicit client IDs, callback handling, and OAuth login in its [MCP configuration guide](https://learn.chatgpt.com/docs/extend/mcp). A successful callback is a checkpoint to observe, not a promise from these instructions. If Auth0 rejects PKCE for a native app, check the application type and public token method against [Auth0's troubleshooting guidance](https://support.auth0.com/center/s/article/Login-failed-PKCE-NOT-ALLOWED-error-after-logging-in-on-a-Native-application).

## A7 — Register ChatGPT as a separate confidential client

1. Create or select **YNAB MCP — ChatGPT**, type **Regular Web Application**.
2. Enable the same intended user connection and authorization-code flow with PKCE support. Confirm its API access permits `ynab:read`.
3. Store the client ID and secret in your password manager. Match the token-endpoint secret method supported by the ChatGPT form and Auth0 registration; inspect the selected method rather than assuming defaults. Do not paste the secret into the MCP service, Git, Jira, or a prompt.
4. After RD-05 has deployed the configured fixture server, follow [Chapter 5's ChatGPT setup](05-client-connections.md). Select OAuth and provide this application's credentials directly in the product form.
5. Copy the connection's displayed callback to Auth0's **Allowed Callback URLs**. If the callback is revealed after creating the connection, save the connection, register its displayed callback, then reconnect.
6. Save the Auth0 registration/API grant. Finish RD-04's variables and RD-05's fixture deployment before the callback/login steps. Then complete Chapter 5 and the acceptance checks below. Keep fixture mode until tool calls and negative tests pass in both clients.

Use the current [OpenAI authentication requirements](https://developers.openai.com/plugins/build/auth) to resolve callback/token-method issues. This guide avoids hardcoded ChatGPT callback URLs because their shape depends on the client and provider metadata.

Start with short-lived access and re-login if necessary. Add refresh/offline access only after both basic flows work; configure the application grant, API settings and client scope consistently, then test expiry and revocation. Do not claim refresh works because initial login succeeded.

## A8 — Prove access boundaries before attaching YNAB

Use a protocol smoke script or MCP Inspector; an HTTP 200 healthcheck is insufficient. Verify:

1. Missing token receives the proper challenge; tools cannot run.
2. Expired, invalid-signature, wrong-issuer and wrong-audience tokens are rejected.
3. Missing scope and a valid token for a second test user are denied. Create only a disposable test identity for this purpose, and remove/disable it afterwards if unneeded.
4. Your owner identity can initialize, list tools and call fixtures from **both actual clients**.
5. A plan ID outside the allowlist is rejected before upstream access.
6. A Railway restart preserves the URL and successful authenticated behavior.

Record redacted outcomes and deployment SHA in Jira. An auth test may need fixture tokens signed by a test key locally; keep those separate from proof of actual Auth0 interoperability. Mark P3-auth/P5 only for checks actually performed.

If the static-client route is unavailable in your account, pause that connection and evaluate current CIMD/DCR support as a separate setup choice. Do not enable anonymous access as a workaround. Auth0's imported third-party client policies and token methods can differ by feature/tier, so a generic “enable OAuth” tutorial is not sufficient.

Continue [Railway deployment](04-railway-deployment.md) and [client acceptance](05-client-connections.md). Only after both clients pass fixtures should you add the YNAB credential.
