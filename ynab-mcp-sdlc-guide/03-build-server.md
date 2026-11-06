# Phase 3 — implement and test the MCP server

This chapter is a build plan for the **new application repository**, not executable application code in the research repo. Run each implementation slice through [the Jira/Codex workflow](02-codex-workflow.md). Do not run the proposed npm commands until Codex has created those scripts and the relevant source files.

## 3.1 Create the implementation backlog

1. Copy the proposed stories from [the backlog template](templates/backlog.md) into Jira, reviewing each before creation. Record the actual keys; do not invent `YNAB-1` associations.
2. Start with the local fixture server story. Approve its intent, specification and plan before code changes.
3. Ask Codex to inspect the application repository and current official SDK documentation. At this guide's verification date the TypeScript SDK v2 is stable and uses split packages such as `@modelcontextprotocol/server`; older examples using `@modelcontextprotocol/sdk` belong to v1. Use one supported major consistently. [Official SDK](https://ts.sdk.modelcontextprotocol.io/v2/)
4. Select exact compatible dependency versions and one Node LTS. Commit the lockfile and a runtime version file. Capture these versions in the PR and PROGRESS.md.

Suggested first implementation prompt:

> Read Jira ISSUE-KEY and its approved Spec, Plan and acceptance criteria. Build only the local fixture milestone in this repository. Use the current stable official MCP TypeScript SDK and Streamable HTTP. Create explicit package scripts, tests and local instructions. Expose /healthz and /mcp; no real YNAB credentials. Make the production configuration fail closed if authorization configuration is missing. Report each acceptance criterion with its test and result, and open a PR linking the issue.

## 3.2 Establish a small application structure

Have Codex implement this division, adjusting names only when the plan explains why:

```text
src/
  config.ts            validated environment configuration
  server.ts            HTTP routes, MCP lifecycle, shutdown
  auth.ts              verified token -> authorized owner
  ynab/client.ts       fixed-origin read-only upstream adapter
  tools/               validated MCP inputs and bounded outputs
  fixtures/            invented plans/transactions only
tests/
  unit/                data rules and tool schemas
  integration/         real MCP handshake and mocked upstream
  auth/                missing/invalid/wrong-owner rejection
.github/workflows/ci.yml
.github/pull_request_template.md
AGENTS.md
.env.example
.gitignore
package.json
package-lock.json
.node-version
README.md
```

Copy/adapt the provided [AGENTS.md](templates/AGENTS.md) and [PR template](templates/pull_request_template.md). The application README owns actual run commands once implemented. Pin dependencies and runtime there; this guide intentionally does not invent a working app command before the app exists.

Required package-script contract:

| Script | Expected purpose |
| --- | --- |
| `npm run dev` | Local fixture server, reload when supported |
| `npm run typecheck` | TypeScript checks without execution |
| `npm run lint` | Chosen static checks |
| `npm test` | Deterministic unit/integration tests with no production tokens |
| `npm run build` | Produce deployable JavaScript |
| `npm start` | Run compiled server, bind `0.0.0.0:$PORT` in Railway |
| `npm run check` | Typecheck + lint + tests + build; fail if any fails |
| `npm run smoke:mcp` | Authenticated MCP initialize/list/call against a chosen endpoint |

After these exist, verify a fresh clone with `npm ci` followed by `npm run check`. CI must not need a YNAB token for its normal checks. A successful build alone is insufficient evidence that a client can perform an MCP handshake.

## 3.3 Define the first read-only tools

Use YNAB's current **plan** terminology in new tool contracts. The config name `YNAB_ALLOWED_BUDGET_IDS` in this guide is a legacy-friendly application name for the allowlisted plan IDs; document that mapping explicitly.

| Tool | Inputs | Useful result |
| --- | --- | --- |
| `ynab_list_plans` | None | Only allowed plans, IDs and display metadata |
| `ynab_list_accounts` | `plan_id` | Account metadata/balances for that plan |
| `ynab_get_month` | `plan_id`, `month` as `YYYY-MM-01` | Month totals and clearly labelled currency |
| `ynab_list_categories` | `plan_id` | Category groups and categories |
| `ynab_list_transactions` | `plan_id`, `since_date`, bounded `limit`, optional `cursor` | Bounded transaction rows plus explicit completeness/cursor metadata |

For every tool:

1. Define an input schema with validation and an output schema.
2. Mark it read-only using the SDK's tool annotations. Enforce read-only behavior in implementation too.
3. Reject plan IDs outside the configured allowlist before any upstream request. The list tool must also filter its output.
4. Never accept an upstream URL, credential, arbitrary HTTP method, or arbitrary API path as a tool argument.
5. Include source time and currency context when relevant. Return `truncated`, a safe continuation mechanism, or a clear limit error when results are incomplete.
6. Avoid fabricated citations: if exposing a YNAB link, verify that the web app actually supports it. Return the stable record ID when no valid deep link is known.

The cursor is **your application's contract**; do not assume YNAB supplies offset pagination. Either implement bounded server-side/in-memory continuation with explicit restart expiry or a stateless integrity-protected cursor and a documented retrieval strategy. Do not pass a delta synchronization cursor off as a page cursor. For v1, a smaller date range and an explicit truncation flag may be enough; in that case omit `cursor` from the input schema until continuation exists. Select concrete limit/date bounds in the Jira specification and test those boundaries. Do not compute a claimed whole-month total from a truncated list.

Plain tools suffice for normal client use. Add `search`/`fetch` compatibility only if you later need a research/company-knowledge interface; it is a separate capability, not a prerequisite for these tools. [OpenAI MCP guidance](https://developers.openai.com/api/docs/mcp)

## 3.4 Build the upstream adapter without credentials first

1. Limit the HTTP adapter to a constant YNAB HTTPS origin and explicit GET routes. No generic proxy tool.
2. Create invented fixtures covering empty plans, positive/negative amounts, split transactions, transfers, deleted items, multiple currencies and date boundaries.
3. Preserve integer milliunit amounts for arithmetic. Format only at the presentation boundary. Keep currency precision/sign and date-only values distinct from timestamps.
4. Make rate limiting, timeout, denied access and malformed upstream response errors understandable without echoing raw data or authorization headers.
5. Bound retries with backoff; never retry indefinitely. Add a short disposable cache and a request budget for the single owner.
6. Keep upstream I/O independent from MCP handlers so tests can assert the requested method/path without contacting YNAB.

YNAB's current API documents `/v1/plans`, integer milliunits, date-only formats, delta synchronization and a 200-request rolling-hour allowance per access token. Use the current endpoint reference when implementing; do not mix `plans`/`plan_id` shapes with copied `budgets` examples. [YNAB API](https://api.ynab.com/)

## 3.5 Meaningful acceptance tests

These tests support the first release; create them with the implementation, not as empty checkboxes:

| Area | Required evidence |
| --- | --- |
| Protocol | Official MCP client can initialize, list the expected tools and call one fixture tool over Streamable HTTP |
| Amounts | Exact integer arithmetic, signs and currency formatting; no floating-point drift |
| Transactions | Correct chosen treatment of split children, transfer pairs and deleted records; no double counting |
| Boundaries | Invalid dates/IDs rejected, result cap explicit, empty data handled |
| Authorization | Missing, expired, wrong-issuer, wrong-audience, missing-scope and wrong-subject tokens rejected |
| Plan isolation | Valid owner token still cannot access a non-allowlisted plan |
| Upstream failures | Mocked 401/403/429/5xx and timeouts produce bounded, redacted errors |
| Data handling | No credentials or raw transaction bodies in logs/errors; fake malicious memo remains data |
| Lifecycle | Requests still work after server restart/redeployment; disposable caches rebuild safely |

Use local signing keys or mocks for deterministic auth tests. Keep live client smoke tests separate and record their outcome; do not label mocked login tests as live OAuth verification.

## 3.6 Add CI and traceability

1. Implement GitHub Actions CI for both PRs and pushes to `main`; use the pinned Node version, `npm ci`, and `npm run check`.
2. Add a traceability check for a valid Jira key and full Jira URL in PR metadata. Treat the title/body as data, pass via environment variables or a structured API, and never interpolate untrusted PR text directly into shell code.
3. Handle PR title/body edits as well as new commits. Verify referenced issue existence with narrowly scoped Jira credentials in a trusted context, or record a deliberate manual fallback when those credentials are unavailable. A regex alone proves only syntax.
4. Keep source execution in a job without Jira/production credentials. Fetch Jira evidence in a separate restricted job; publish only the minimum approved specification snapshot needed by the reviewer. Do not expose secrets to arbitrary fork code or use privileged PR events to run untrusted code.
5. Ensure changes to tests and CI receive review. A solo workflow still requires you to inspect the result; it cannot provide an independent human approval by reviewing your own PR.

**Checkpoint P3:** a fresh clone passes `npm ci`/`npm run check`; fixture MCP list/call succeeds; changes are reviewed, linked and merged. Implement [authentication](03a-authentication.md) before using any live YNAB data.

## 3.7 Attach YNAB only after Phase 5 fixture authentication passes

1. In the YNAB web app, open Account Settings → Developer Settings → Personal Access Tokens and generate a token for your own application. Save it directly to your secret manager. [YNAB token setup](https://api.ynab.com/)
2. Add it as Railway `YNAB_ACCESS_TOKEN`, with `DATA_MODE` still `fixtures` until the allowlist is set.
3. Discover/select your intended plan ID privately with the one-time lookup below. Keep the response local; never attach it to a public PR.
4. Set `YNAB_ALLOWED_BUDGET_IDS` to the selected IDs and switch `DATA_MODE=live` only when the server validates all required fields at startup. An empty allowlist must deny live access.
5. Call one list tool and one bounded read from each client, compare privately with YNAB's own UI, and record only pass/fail plus redacted evidence links.

A PAT is not a read-only security boundary. The first release's adapter and tool set must prevent writes. Do not distribute your personal token to other users. Multi-user access requires a separate upstream authorization and per-user credential design.

### Private one-time plan-ID lookup

Run this manually in your own Bash/zsh terminal with Node installed, not in CI or a recorded/shared agent session. After the first command, paste the PAT at the hidden input and press Enter; it is not part of the command text. The script prints only plan names and IDs so you can choose the intended plan. It does not write a file. If your password manager can inject the environment variable securely, use that instead of the first two commands.

```sh
read -r -s YNAB_ACCESS_TOKEN
export YNAB_ACCESS_TOKEN
node --input-type=module <<'JS'
const token = process.env.YNAB_ACCESS_TOKEN;
if (!token) throw new Error('YNAB_ACCESS_TOKEN is required');
const response = await fetch('https://api.ynab.com/v1/plans', {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(15000)
});
if (!response.ok) throw new Error(`YNAB lookup failed: HTTP ${response.status}`);
const result = await response.json();
if (!Array.isArray(result.data?.plans)) throw new Error('Unexpected YNAB response');
for (const plan of result.data.plans) {
  console.log(JSON.stringify({ id: plan.id, name: plan.name }));
}
JS
unset YNAB_ACCESS_TOKEN
```

Run the final `unset` even if the request fails. Record selected IDs in the private deployment configuration and clear the terminal output if needed. This privileged administrative lookup is not exposed as an unrestricted public MCP tool; the deployed list tool still returns only allowlisted plans.
