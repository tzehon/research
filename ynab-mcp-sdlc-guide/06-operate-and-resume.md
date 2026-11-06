# Phase 6 — resume, release, operate, and extend

Use this chapter whenever you change machines, return after a break, or repeat a setup phase. The normal action is to reconnect to the same resources, not recreate them.

## 6.1 End every working session with a handoff

1. Save the implementation branch and PR in the application repo. Commit only reviewed files; push the branch if you need to continue elsewhere.
2. Update the Jira issue with completed AC evidence, current approved revision, remaining questions and the next concrete action. Do not label a proposed test as passed.
3. Update [PROGRESS.md](PROGRESS.md) with current phase, resource links/IDs appropriate to the repo's visibility, application SHA/PR, deployment link and next step.
4. From the research checkout, review and publish only the intended progress changes:

   ```sh
   git status --short
   git diff -- ynab-mcp-sdlc-guide/PROGRESS.md
   git add ynab-mcp-sdlc-guide/PROGRESS.md
   git commit -m "Record YNAB MCP setup progress"
   git push
   ```

5. Do not commit if the file contains token values or private financial responses. Use the secret-manager record name in place of sensitive setup state.

If two machines edit the register concurrently, reconcile it using Jira/GitHub/Railway evidence. The newest text is not necessarily the true state. Pull with `--ff-only`; do not solve divergence with a force push.

## 6.2 Start on a second machine

1. Follow [preflight](00-preflight.md) for Git, GitHub CLI, Codex and the pinned application runtime.
2. Clone or fast-forward `tzehon/research`. Read README and PROGRESS.md, then open the current Jira issue and latest approval evidence.
3. Clone or update the **existing** `tzehon/ynab-mcp` repository. Verify remote and Git identity, then fetch branches and select the recorded work branch. Check for uncommitted work before switching.
4. Install the runtime version recorded in `.node-version`, then run `npm ci` and `npm run check` once the application has those files/scripts. Do not regenerate the lockfile merely because the new machine has a newer npm version.
5. Reauthenticate Jira in the selected Codex environment and verify that it reads the intended issue. Then re-add/login to the existing remote YNAB MCP endpoint as described in [client connections](05-client-connections.md).
6. You do not need the YNAB PAT on a machine that only uses the hosted service. Local development should use fixtures. A controlled live-adapter diagnostic is a separate task with temporary local secret access.
7. Sign into Railway only if you need deployment administration. Select/link the existing workspace/project/environment/service IDs, confirm them, and inspect current deployment before changing anything.
8. Compare the actual active deployment SHA with the register and GitHub. Resolve differences before resuming release work.

**Checkpoint P6-machine:** one hosted call succeeds from the second machine in the service's existing mode: a fixture call when it is in fixture mode, or a narrow authorized read when already live. Run local fixture tests separately. Do not switch the hosted data mode, create another project or redeploy solely to test a new machine. P6-recovery remains separate until restart and rollback have also been exercised.

## 6.3 Repeat-safe action table

| Operation | Before repeating | Success condition |
| --- | --- | --- |
| Jira signup/project | Inspect account's existing site/project list | Reuse recorded site/key |
| Create ticket | Find the existing issue linked in progress/backlog | One issue represents the intended change |
| GitHub repo | Verify signed-in account and repo existence | Reuse same remote; absence is confirmed, not inferred from an auth error |
| Add fields/statuses | Compare actual names/IDs and layouts | Update/reuse fields; no duplicates |
| Install GitHub integration | Inspect connected account/repository selection | Existing app has access and data syncs |
| Codex MCP add | Inspect configured server names/URLs | One intended connection, freshly authenticated if needed |
| Auth0 app/API | Compare IDs, issuer, resource and callback settings | Existing registrations reused; scope changes reviewed |
| Railway deploy | Confirm linked IDs, commit and staged changes | Same service updated with known revision |
| Credential rotation | Check which consumers use the credential | New credential validated, old revoked, records updated |
| Fixture/live switch | Check mode, allowlist and auth acceptance evidence | Deliberate data-mode change, not a default side effect |

## 6.4 Release checklist

Use the release Jira issue to connect all implementation PRs. Before Done:

- All intended PRs are merged and the final keys/links still work.
- All current acceptance criteria have evidence against the actual release revision.
- CI passed on the resulting deployable commit, not merely an earlier PR head.
- Railway's active deployment ID and Git SHA are recorded.
- Current auth, owner/plan allowlists and fixture/live configuration were inspected.
- Both clients can discover/call the intended tools; changed metadata has been refreshed.
- Missing credentials and unauthorized users are still rejected.
- Known limitations, the last-good deployment and rollback procedure are documented.

For a ticket with no deployable change, define completion accordingly; do not require a needless production deployment for documentation. For a server feature, merge alone is not release acceptance.

## 6.5 Routine operation

At first, use a manual weekly check rather than an unattended repair agent:

1. Inspect Railway usage, deployment restarts, errors and request latency. Confirm spending alerts/limits are still appropriate.
2. Inspect upstream 429s and authentication failures using redacted metrics. The local rate counter resets after a restart, while upstream quota does not. Avoid repeated full refreshes on every client reconnect.
3. Check one authenticated read and verify which code is deployed. Do not repeatedly poll full transaction history for a healthcheck.
4. Review dependency and SDK security updates in a dedicated PR with fixture/auth/client regression checks.
5. Revisit OAuth token expiry/refresh and revoked-user behavior. A revoked session may remain usable until its access token expires unless the design includes immediate revocation checks; define the required behavior in Jira.
6. Record incidents as Bugs with evidence links and a reproduction using synthetic data. Add a regression test after fixing the defect.

If implementing a disposable delta cache, preserve the full snapshot and its delta cursor together. On cache loss, discard the cursor and rebuild intentionally; applying deltas onto an empty dataset can silently lose records. Never persist a financial cache accidentally through debug logs or checked-in fixtures.

## 6.6 Rollback and credential recovery

Follow Railway's [deployment action instructions](https://docs.railway.com/deployments/deployment-actions). A rollback can restore both the image and custom variables. Compare the target with current approved auth settings and secret rotations before using it.

1. Identify the last-good deployment and why the current release is failing.
2. If access control is failing, disable live access or stop the service while preparing the fix; do not leave an unsafe live deployment operating just to preserve availability.
3. Roll back within retention, or redeploy a reviewed known-good commit. Reapply current approved credentials and allowlists if older settings would be restored.
4. Repeat negative auth checks and a narrow authorized smoke test. Confirm both clients use the expected endpoint.
5. Create a revert/fix PR so `main` reflects the desired state. A dashboard rollback does not rewrite Git history.

For YNAB PAT rotation, create/store the replacement privately, update Railway, deploy/test a narrow read, then revoke the old PAT. If suspected compromised, revoke immediately and accept downtime while replacing it. For ChatGPT client-secret rotation, update the product's connection and private record; the resource server does not consume that secret. Do not rotate unrelated credentials while diagnosing a wrong callback URL.

## 6.7 Later automation, in order

Only automate a step after manually completing it reliably:

1. **Deterministic traceability check.** Validate issue keys/URLs/existence and current approved revisions. Make missing or unverifiable evidence explicit. Keep a deliberate manual fallback until implemented.
2. **Jira-aware Codex review.** Use a trusted fetch step and read-only reviewer, separate credentials from PR code, record head SHA and spec revision, and control cost. See Chapter 2.
3. **Status-triggered spec drafting.** Give each job an idempotency identity such as `(issue key, stage, approved revision)`, check current status/content again, and prevent concurrent runs from overwriting one another. Store result/run links. Duplicate or delayed events must not create duplicate PRs.
4. **Release updates.** Transition Jira only when all required work and acceptance are complete. Distinguish merged, deployed and verified.
5. **Monitoring to triage.** Start with deduplicated incident creation and read-only diagnosis. Any repair PR still runs through tests and review. Avoid a noisy generic threshold that creates duplicate tickets.

Jira automation quotas, GitHub Actions usage and Codex API spend are separate limits. Inspect the actual account plans when enabling these jobs; do not assume an interactive subscription supplies unattended API usage.

## 6.8 Optional traceability explorer

Use the native UI until it no longer fits. If you need to select several commits or a release range, write a separate issue for a read-only screen with:

- Search/select Jira key, PR URL, commit SHA or commit range.
- Show each linked issue and all recorded PRs/commits across selected repositories.
- Click through to the authoritative Jira/GitHub record.
- Distinguish explicit issue-key links from inferred commit-to-PR membership.
- Flag missing/ambiguous associations, excluded history and synchronization time.
- Respect source permissions and avoid a second editable requirements store.

Decide whether a range means commits reachable from one ref but not another, and handle merge/rebase/squash semantics explicitly. Native Jira development views have display/backfill limits; an explorer needs its own pagination, indexing and reconciliation policy if completeness matters. It cannot infer undocumented intent with certainty.

## 6.9 Later writes, multiple users, or teardown

Write tools need a separate accepted design: explicit preview/confirmation, amount/date validation, duplicate protection, test-plan data and recovery behavior. Never unlock arbitrary upstream HTTP requests. Multi-user access needs individual YNAB OAuth grants, credential isolation and per-user authorization; do not put several users behind your personal PAT.

For intentional teardown: record what should be retained, disconnect the clients, revoke the project-specific YNAB credential, remove the Railway service/project after confirming IDs and billing impact, and remove only this project's Auth0 registrations. Preserve Jira/GitHub history unless you specifically intend to delete it. Do not delete a shared tenant, account or unrelated Railway project. Record the teardown so the next machine does not attempt to resume a removed deployment.
