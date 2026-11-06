# 04 — Deploy the personal YNAB MCP service to Railway

This is a runbook for the service you will build in Chapter 03. Nothing in this chapter means a Railway project, repository, domain, token, or deployment has already been created. The proposed repository is `tzehon/ynab-mcp`; substitute the actual repository recorded in `PROGRESS.md` if you choose a different name. Documentation checked on **6 November 2026**.

The first deployment serves synthetic fixtures. Add your real YNAB credential only after the public endpoint has passed the authentication checks in Chapter 03a **and both actual clients have passed Chapter 05's fixture tests**. Use one Railway project, one environment, one service, and one replica for the first release.

## Before starting

Have these ready:

- A GitHub repository containing the implementation and committed lockfile, with successful CI for the exact commit to deploy.
- Working package scripts for build, test, and production start. The example commands below are the proposed contract; verify that Chapter 03 actually created them.
- An HTTP server that listens on `0.0.0.0` and `process.env.PORT`, exposes `/mcp` and `/healthz`, and validates authentication even in fixture mode.
- The Auth0 issuer and your allowed subject from Chapter 03a. The final audience is the exact public MCP URL; fill it in after Railway assigns the domain.
- `DATA_MODE=fixtures` implemented so that no YNAB request is made and `YNAB_ACCESS_TOKEN` is not required in that mode. Missing or invalid authentication configuration must fail closed.

Keep this chapter open alongside `PROGRESS.md`. At each checkpoint, record completed work and the next step. Store identifiers and evidence URLs, never credential values.

## RD-01 — Check the existing account and choose the workspace

1. Sign in to your existing [Railway dashboard](https://railway.com/dashboard). Check the workspace shown in the account switcher.
2. Open the workspace's plan, billing, and Usage pages. Record the current plan, billing-cycle dates, and whether its available resources meet the intended deployment. Do not assume the account has an active trial or that this service will be free.
3. Choose an email usage alert and, if wanted, a Compute hard limit appropriate to your budget. A hard limit can take the workload offline; it is a spending control rather than an availability guarantee. Leave Railway Agent usage separate from service compute usage. [Railway cost controls](https://docs.railway.com/pricing/cost-control)
4. Check that there is no existing `ynab-mcp` project from an earlier attempt. When resuming, open the recorded project ID instead of creating another project.

**Checkpoint:** record workspace name/ID, selected spending controls, and `RD-01 complete`. The guide does not prescribe a paid-plan purchase.

## RD-02 — Create the project from GitHub

1. In Railway, choose **New Project → Deploy from GitHub repo**.
2. If prompted, connect GitHub and grant the Railway GitHub App access to the chosen repository. Select `tzehon/ynab-mcp` only after that repository exists.
3. Choose **Add variables** so you can configure the service before its first deployment. Railway's alternative **Deploy Now** starts a build immediately. [Railway GitHub quick start](https://docs.railway.com/quick-start)
4. Name the project `ynab-mcp` and the service `ynab-mcp`. Select the intended environment, ordinarily `production`; fixture mode makes the first run a test of this same installation.
5. Keep project visibility private. A public HTTP domain is independent of Railway project visibility; public project visibility can expose service and deployment logs. [Railway projects](https://docs.railway.com/projects)
6. In the service's source settings, select `main`. Leave PR preview environments off for the first release, and do not add a database or volume.

**Checkpoint:** record the project URL and project, service, environment, and workspace IDs. Record the connected repository and branch. These are the durable resume coordinates.

## RD-03 — Confirm build and runtime settings

For the single-package repository proposed in this guide:

| Setting | Intended value | What to verify |
|---|---|---|
| Root directory | `/` | `package.json` and the lockfile are at the repository root. |
| Builder | Railway's detected Node builder | Inspect the build logs for the selected Node version and package manager. |
| Build command | `npm run build` | The script exists and produces the runtime JavaScript. |
| Start command | `npm start` | The script starts the compiled server, not a development watcher. |
| Healthcheck path | `/healthz` | Returns a small readiness result without budget data or secrets. |
| Replicas | `1` | The first version's cache and rate limiter are designed for one process. |

Railway's default root is `/`; changing it also changes where build and start commands run. If you later move the server into a subdirectory, review root, lockfile, shared dependencies, and configuration-file path together. Prefer pinning the tested runtime in the repository rather than silently accepting a future default. [Build configuration](https://docs.railway.com/builds/build-configuration)

The server must bind to **`0.0.0.0`**, using Railway's **`PORT`** value. Do not bind only to `localhost`. A public-domain target port must match the listening port. If setup asks you to specify a port before detecting one, set `PORT=3000` and the domain target to `3000` consistently; the application still reads `PORT`. Otherwise use Railway's provided value. [Railway host and port troubleshooting](https://docs.railway.com/networking/troubleshooting/application-failed-to-respond)

Configure `/healthz` as a deployment readiness check. It should validate local initialization, not call YNAB on every probe. Railway waits for a successful `2xx` response before routing traffic to the new deployment, but does not continue polling this healthcheck as uptime monitoring. If the application checks request hostnames, permit Railway's documented healthcheck hostname separately from allowed MCP origins. [Healthchecks](https://docs.railway.com/deployments/healthchecks)

**Checkpoint:** record the confirmed command names, runtime version, root directory, healthcheck path, and selected region. If a command does not exist, return to Chapter 03; do not guess a deployment workaround.

## RD-04 — Assign a domain and finish authentication configuration

1. Open **Service → Settings → Networking → Public Networking → Generate Domain**. Save the generated hostname. Railway provides HTTPS certificates for its public domains. [Public networking](https://docs.railway.com/networking/public-networking)
2. Define the exact MCP URL as `https://<your-generated-host>/mcp`. Keep the `/mcp` path and omit a trailing slash unless Chapter 03 deliberately uses one everywhere.
3. Complete the Auth0 API/audience and client setup from Chapter 03a using that URL. This is the authorization for clients accessing **your MCP service**; the YNAB PAT is a separate server-to-YNAB credential.
4. In the Railway service's **Variables** tab, enter the following configuration:

| Variable | First deployment | Live deployment |
|---|---|---|
| `DATA_MODE` | `fixtures` | `live`, after RD-06 and both client fixture tests pass |
| `MCP_PUBLIC_URL` | Exact public HTTPS URL ending in `/mcp` | Same value |
| `AUTH_ISSUER` | Exact Auth0 issuer, including its trailing slash | Same value |
| `AUTH_AUDIENCE` | Exact `MCP_PUBLIC_URL` | Same value |
| `AUTH_ALLOWED_SUBJECT` | Your exact permitted issuer subject | Same value |
| `YNAB_ALLOWED_BUDGET_IDS` | Fixture IDs in the documented application format | Explicit allowed YNAB plan IDs |
| `YNAB_ACCESS_TOKEN` | **Absent** | Your secret PAT |
| `PORT` | Use Railway's value, or the explicit matching port chosen above | Same policy |

`AUTH_ISSUER`, audience, and URLs are configuration; the YNAB token is a credential. Do not put the PAT in a committed `.env`, Jira comment, PR, chat, terminal command, or screenshot. Add it directly through Railway when RD-07 instructs you to do so. Railway variables are available during builds and runtime; avoid build scripts that print their environment. [Using variables](https://docs.railway.com/variables)

If your UI will not generate a domain before a deployment exists, stop at this checkpoint and use the bootstrap procedure agreed in Chapter 03a: fixture data only, no YNAB PAT, and fail-closed authentication. Do not temporarily expose an unauthenticated real-data server to obtain the domain.

**Checkpoint:** record the public URL and the names of configured variables. Record the actual allowed subject and plan IDs only in the private configuration record; do not copy a token value into `PROGRESS.md`.

## RD-05 — Set the deploy policy and deploy fixtures

Recommended policy: **a reviewed merge to `main`, followed by successful CI on that resulting commit, authorizes a routine deployment**. First release, a switch to live data, authentication changes, and credential rotations get an explicit review of the concrete change.

Enable **Wait for CI** in the Railway service settings once the repository has a GitHub Actions workflow triggered by pushes to `main`. Railway waits for GitHub Actions workflow conclusions, rather than each job or third-party check. Skipped/neutral workflows do not block; a cancelled workflow can be ignored if another workflow succeeded. Therefore the required verification workflow must actually run on every deployable main commit and fail when its mandatory checks fail. Do not use cancellation/skip behavior as an approval gate. [GitHub autodeploys and Wait for CI](https://docs.railway.com/deployments/github-autodeploys)

Review the staged Railway changes and click **Deploy**. This may redeploy every affected service in the changeset. Watch build and runtime logs until the deployment is Active; resolve a failed build or readiness check before continuing. Networking changes apply immediately rather than waiting for this staged deployment. [Staged changes](https://docs.railway.com/deployments/staged-changes)

The production code should log a minimal startup record: application version/commit SHA, deployment ID, and data mode. Railway supplies `RAILWAY_GIT_COMMIT_SHA` for GitHub-triggered builds and `RAILWAY_DEPLOYMENT_ID`; do not dump the rest of the environment. [Provided variables](https://docs.railway.com/variables/reference)

**Checkpoint:** record the GitHub commit SHA, CI run URL, Railway deployment ID/URL, and confirmation that the running mode is `fixtures`.

## RD-06 — Verify public authentication with synthetic data

Run the acceptance checks from Chapter 03a against the **deployed** URL, not just localhost. Capture status/results and evidence links, excluding raw bearer tokens or sensitive response bodies.

| Check | Required result |
|---|---|
| `/healthz` | Healthy, minimal response; no call to YNAB. |
| MCP request without a bearer token | Denied with the authentication challenge required by the implementation. |
| Expired, wrong-issuer, or wrong-audience token | Denied. |
| Validly issued token for another subject | Denied by the personal allowlist. |
| Your authorized client | Discovers the service and reads the synthetic fixture tools. |
| Tool input naming an unapproved plan | Denied before any upstream request. |
| A proposed write operation | No write tool exists; server routes cannot make an upstream write. |
| Logs after the tests | No credentials, authorization headers, payee names, memos, or transaction bodies. |
| Restart, then reconnect | A new authenticated request succeeds; no required session state was lost. |

The restart check demonstrates the intended design: Auth0 owns authorization state; this MCP process validates tokens and may keep only disposable caches. Do not store refresh tokens, authorization grants, or the only copy of security state on the service's filesystem. Railway deployment storage is ephemeral; persistent state requires an explicit storage design. This read-only first release needs no volume if it meets that contract. [Deployment storage](https://docs.railway.com/deployments/reference)

**Checkpoint:** record each result. If any authorization-negative test unexpectedly succeeds, keep `DATA_MODE=fixtures` and open a fix ticket. RD-07 remains incomplete.

## RD-07 — Connect the real YNAB account

Only proceed after RD-06 passes, **both Codex and ChatGPT pass the fixture acceptance matrix in [Chapter 05](05-client-connections.md)**, and you have reviewed the planned live-data change. Go to Chapter 05 now if either client has not yet passed, then return here.

1. In the YNAB web app, open **Account Settings → Developer Settings → Personal Access Tokens → New Token**. Store the generated token in your password manager; YNAB does not show it again. Its documentation says PATs do not expire automatically but can be revoked. [YNAB authentication](https://api.ynab.com/#personal-access-tokens)
2. Resolve the specific plan IDs privately using the controlled bootstrap procedure in Chapter 03. Set `YNAB_ALLOWED_BUDGET_IDS` to that explicit set; do not use `last-used` or an unrestricted wildcard as the personal data boundary.
3. Add `YNAB_ACCESS_TOKEN` in Railway's service variables. Consider sealing the variable after storing a recoverable copy in your password manager. Sealed values cannot subsequently be displayed through the UI/API and are not copied to PR environments; sealing does not prevent the running application from accessing the secret. [Sealed variables](https://docs.railway.com/variables#sealed-variables)
4. Set `DATA_MODE=live`, review the staged variable changes, and deploy.
5. Re-run the no-token and wrong-subject checks. Then connect as yourself and make one small, read-only request against an allowed plan. Verify a known total privately in YNAB. Record pass/fail and the tool name, not the financial values.

This guide's upstream read-only boundary is enforced by server code: fixed YNAB host, GET-only endpoint allowlist, and permitted plan IDs. Do not describe a PAT as read-only scoped. YNAB separately documents a `read-only` scope for its OAuth application flow. [YNAB OAuth scope](https://api.ynab.com/#oauth-scope)

**Checkpoint:** record the live deployment ID/SHA, credential record name and creation date, allowed-plan configuration revision, and successful smoke-test result. Complete the narrow live read checks in both clients from Chapter 05; their fixture connection setup must already be complete.

## RD-08 — Practice recovery and save a handoff

In the service's Deployments view, the menu on a previous successful deployment offers rollback while that deployment remains within the plan's retention period. Railway restores **both its image and custom variables**. Before rolling back, identify the known-good deployment and check whether its configuration predates a credential rotation, subject change, or fixture/live switch. After rollback, verify the actual active deployment and re-run authentication plus one authorized read. [Deployment actions](https://docs.railway.com/deployments/deployment-actions)

Record the incident and reconcile `main` with the recovered version through a normal fix/revert PR; a dashboard rollback does not change Git history. If retention has expired, rebuild the selected known-good Git commit through the documented release process and reapply the current approved secrets/configuration. Do not restore revoked secrets merely to match old settings.

On another machine, clone the same repository, sign into the same Railway account, and link the existing IDs. These are future commands, to use only after installing the CLI and replacing every placeholder:

```sh
railway login
railway link --project '<project-id>' --environment '<environment-id>' --service '<service-id>'
railway status
```

`railway link` reconnects a directory to an existing project; `railway init` creates a new project and is not the resume command. Verify the printed target before any later mutation. [Railway link](https://docs.railway.com/cli/link)

**Completion record:** project/environment/service IDs; public MCP URL; actual active deployment ID and Git SHA; CI and test evidence links; fixture/live mode; credential record reference; next uncompleted task. The ongoing checks, token rotation, cost review, and incident procedure belong in Chapter 06.
