# Progress and resource register

Guided execution started on 7 November 2026. No phase is complete yet. Update after observed results, then commit and push. It is an index, not a replacement for Jira specifications or approvals. Use a private register instead if these identifiers should not appear in this repository.

## Resource register — no credentials or financial data

| Item | Value / status |
| --- | --- |
| Guide verified against provider docs | 2026-11-06 |
| Research repository visibility | Public; verified through GitHub on 2026-11-07 |
| Progress/identifier storage policy | Agreed 2026-11-07: generic progress in this public file; account-specific identifiers, deployment configuration and credentials in 1Password |
| Application GitHub owner/name | Created: `tzehon/ynab-mcp` on 2026-11-07 |
| Application repo URL / visibility | https://github.com/tzehon/ynab-mcp — Public; verified on 2026-11-07; default branch main |
| Application delivery policy | Applies to ynab-mcp: feature branches and PRs only; no direct pushes to main. Research progress updates may use main. |
| Application initial state | GitHub-created README seed; commit de44eb5d7745a8b51b96eb9824be910f30baf362; no implementation code |
| First-release scope | Agreed 2026-11-07: owner-only, read-only YNAB access to plans, accounts, categories, balances and transactions; writes deferred |
| Application code review | Codex cloud automatic review selected; not configured or verified yet |
| Jira site / cloud ID | Existing personal site verified through browser and Atlassian plugin; Jira Free plan verified in Atlassian Administration on 2026-11-07. Keep identifiers in 1Password. |
| Jira space/project key | YNAB — changed on the existing ynab-mcp project and verified after reload and through the Atlassian plugin on 2026-11-07. |
| Intent/epic issue URL | Not created |
| Current implementation issue URL | Not created |
| Spec / Plan / Acceptance criteria field IDs | Not discovered |
| GitHub for Atlassian installation scope | Not configured |
| Auth0 tenant / issuer / API audience | Not configured |
| Auth0 client registration route | Planned: separate explicitly registered clients; see Phase 3a |
| Client application IDs (non-secret) | Not configured |
| Private identity/secret register item name | 1Password Secure Note: YNAB MCP deployment; saved per user confirmation on 2026-11-07; contents not inspected |
| Railway workspace / project ID / environment / service ID | Existing account; no project selected |
| Railway service URL / exact MCP URL | Not configured |
| Tested Node / npm / SDK / Codex versions | Not recorded |
| Application CI workflow + job names | Not implemented |
| Last successful deployed commit / deployment link | None |
| Last good rollback deployment | None |
| Last guide revision used | `b875affe09196fa99da2498f6a72f9a89333a9ec`; remote checked 2026-11-07 |

## Checkpoints

- [ ] P0: Preflight and development machine verified.
- [ ] P1: Jira Free site/space and fields configured; separate GitHub repository exists.
- [ ] P1-links: An actual issue opens its PR and commit; PR/commit opens the issue.
- [ ] P2: First intent/spec/plan accepted with explicit revision evidence.
- [ ] P3: Local fixture-only MCP server, tool contracts and meaningful checks pass.
- [ ] P3-auth: Auth configuration implemented; missing/invalid/unauthorized credentials rejected.
- [ ] P4: Railway fixture deployment healthy; stable URL and deployed SHA recorded.
- [ ] P5-Codex: Owner can use fixture tools from Codex; negative authorization tests pass.
- [ ] P5-ChatGPT: Owner can use fixture tools from ChatGPT; selected auth route verified.
- [ ] P5-live: Allowlisted YNAB plan(s) read successfully; live values spot-checked privately.
- [ ] P6-machine: Second-machine connection passes without recreating resources.
- [ ] P6-recovery: Restart and rollback exercise passes; current auth/configuration rechecked.
- [ ] P6-release: Jira acceptance criteria and release evidence complete.

## Phase 0 detail

- [x] Guide and progress register read on this machine.
- [x] Current research repository visibility verified: public.
- [x] 0.1 step 1: generic progress stays here; private setup details go in 1Password (user confirmed).
- [x] 0.1 step 2: tzehon/ynab-mcp, Public; PR-only delivery with Codex cloud review agreed.
- [x] 0.1 step 3: Jira project key YNAB agreed by user; applied to the existing project and independently verified on 2026-11-07.
- [x] 0.1 step 4: owner-only, read-only first release agreed by user; writes deferred.
- [x] 0.1 step 5: 1Password project entry saved (user confirmed).
- [ ] 0.2: account and client eligibility checks complete.
- [x] 0.2 GitHub identity/access: connected user tzehon; public ynab-mcp owned by tzehon; admin and push permissions verified.
- [ ] 0.2 GitHub protection/review configuration: not yet verified; configuration remains Phase 1.
- [x] 0.2 Jira access: user confirmed signup; browser and newly installed Atlassian plugin verified access to the existing ynab-mcp software project, with zero issues.
- [x] 0.2 Jira subscription: Atlassian Administration billing page explicitly showed Jira on the Free plan with one user on 2026-11-07.
- [ ] 0.2 Railway access: inspect existing workspace, plan, usage/billing and member permissions; do not create a project yet.
- [x] Phase 1 repository creation brought forward at user request: public ynab-mcp exists with README seed.
- [ ] Phase 1 review setup: Codex cloud integration enabled and review of a real PR observed.
- [ ] 0.3: local tools and Git identity verified.
- [ ] 0.4: guide refresh procedure verified.
- [ ] 0.5: credential/configuration separation reviewed.

## Session handoff

Chapter checkpoint mapping: J1–J3/G1 establish P1; G2 is completed at C6 and establishes P1-links. C1–C4 establish P2. C5–C6 describe the repeating implementation/review cycle. RD-01–RD-06 establish P4 and contribute to P3-auth; Chapter 05 establishes both client checkpoints before RD-07 enables P5-live. RD-08 plus the recovery procedure establishes P6-recovery.

- Last updated (date/time/time zone): 2026-11-07 10:45 Asia/Singapore
- Current phase/checkpoint: P0 / 0.2 — Jira access, project key and Free subscription verified; Railway account check next
- Current Jira issue + approved revision: none
- Current app branch/PR and commit: main at de44eb5d7745a8b51b96eb9824be910f30baf362 (GitHub initialization only); no application PR yet
- Last observed successful check: Atlassian Administration → Billing and subscriptions showed Jira on the Free plan with one user for the existing personal site
- Blocker or decision needed: No Jira access/subscription blocker; remaining account/client eligibility checks are pending
- Next concrete action: Inspect the existing Railway account: workspace, plan, usage/billing and member permissions. Record only generic verification here; keep account-specific details in 1Password. Do not create a project yet.
- Where evidence lives (links only; redact before sharing): https://github.com/tzehon/ynab-mcp and https://github.com/tzehon/research/pull/12

## Decision log

Record links to decisions in Jira, not duplicated specifications.

| Date | Jira decision link | Consequence for setup |
| --- | --- | --- |
| 2026-11-07 | Pre-Jira setup decision confirmed in guided chat | Keep generic progress public; use 1Password for private setup details. Project entry creation remains pending. |
| 2026-11-07 | Pre-Jira setup decision confirmed in guided chat | Public tzehon/ynab-mcp; feature branches and PRs only, with Codex cloud review. No direct pushes to main. |
| 2026-11-07 | Pre-Jira setup decision confirmed in guided chat | Jira key YNAB agreed. Created public ynab-mcp ahead of Phase 1 at user request. PR-only restriction applies to ynab-mcp, not research. |
| 2026-11-07 | Pre-Jira setup decision confirmed in guided chat | First release is for the owner only and read-only; creating or changing transactions is deferred. |
| 2026-11-07 | User completion confirmation in guided chat | 1Password project entry saved; Phase 0.1 complete. GitHub identity and repository access verified independently; remaining Phase 0 checks are pending. |
| 2026-11-07 | User signup/plugin confirmation and live verification in guided chat | Reuse existing ynab-mcp Jira project. Access verified; key alignment and Free subscription verification remain pending. |
| 2026-11-07 | User requested agent to apply the agreed key | Existing Jira project key changed to YNAB and verified in the browser and plugin. No duplicate project created. |
| 2026-11-07 | Live subscription verification in guided chat | Existing Jira subscription is Free; no plan change was needed. Continue Phase 0 with existing Railway account checks. |
