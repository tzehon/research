# Progress and resource register

Guided execution started on 7 November 2026. Phase 0 preflight and Phase 1.2 Jira fields are complete; workflow, delivery configuration and implementation remain pending. Update after observed results, then commit and push. It is an index, not a replacement for Jira specifications or approvals. Use a private register instead if these identifiers should not appear in this repository.

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
| Application code review | Repository visible in Codex code review settings; Automatic review enabled and follows personal preferences. Personal automatic review is on, trigger On PR open (verified 2026-11-07). Subsequent-push trigger setup and actual PR review evidence remain pending. |
| Application branch protection | Public repo and admin access verified; branch ruleset/classic protection controls available. Main is currently unprotected and no rulesets exist (verified 2026-11-07); enforce PR-only rules in Phase 1. |
| Jira site / cloud ID | Existing personal site verified through browser and Atlassian plugin; Jira Free plan verified in Atlassian Administration on 2026-11-07. Keep identifiers in 1Password. |
| Jira space/project key | YNAB — changed on the existing ynab-mcp project and verified after reload and through the Atlassian plugin on 2026-11-07. |
| Intent/epic issue URL | Not created |
| Current implementation issue URL | Bootstrap Task created: Set up the YNAB MCP repository and delivery workflow. Locate it in YNAB; site-specific URL stays private. Draft only, no formal approval recorded. |
| Spec / Plan / Acceptance criteria field IDs | Discovered and verified through Jira metadata and the saved Task on 2026-11-07. All three are space-scoped rich-text Paragraph fields shared by Task and Bug layouts. IDs omitted from this public register; saving the mapping to 1Password remains pending. |
| GitHub for Atlassian installation scope | Not configured |
| Auth0 tenant / issuer / API audience | Account access verified on 2026-11-07; one existing development tenant listed, with prior gateway-lab applications. YNAB tenant selection, issuer verification and API configuration deferred to Phase 3a; identifiers stay private. |
| Auth0 client registration route | Planned: separate explicitly registered clients; see Phase 3a |
| Client application IDs (non-secret) | Not configured |
| Private identity/secret register item name | 1Password Secure Note: YNAB MCP deployment; saved per user confirmation on 2026-11-07; contents not inspected |
| Railway workspace / project ID / environment / service ID | Existing workspace access and Admin role verified on 2026-11-07; zero active projects. No YNAB project created. Keep identifiers in 1Password. |
| Railway plan / usage check | Trial plan; usage and credit balance inspected on 2026-11-07. Recheck trial eligibility and hosting plan before deployment; private billing amounts omitted. |
| Railway service URL / exact MCP URL | Not configured |
| Tested Node / npm / SDK / Codex versions | Codex CLI 0.163.0; desktop 26.1103.41825 (build 25679, prod), updater reported up_to_date on 2026-11-07. Node 26.13.0 and npm 11.20.0 verified on 2026-11-07; SDK not installed/tested yet. |
| Local development tools | Git 2.56.0; GitHub CLI 2.103.3; version commands and GitHub CLI authentication verified on 2026-11-07. |
| Local application checkout | Cloned existing ynab-mcp repository over HTTPS on this machine; clean README seed, no application changes pushed. |
| Git commit identity policy | User selected GitHub profile name and verified GitHub no-reply email for research and ynab-mcp; repository-local overrides verified in both. Global settings unchanged; reapply after cloning on each machine. |
| Application CI workflow + job names | Not implemented |
| Last successful deployed commit / deployment link | None |
| Last good rollback deployment | None |
| Last guide revision used | `8952807a72d5d33dfc18cf842c3688c1e0e561fe` verified by Phase 0.4 fast-forward-only refresh on 2026-11-07; subsequent checkpoint changes are recorded in this file’s Git history. |

## Checkpoints

- [x] P0: Preflight and development machine verified on 2026-11-07. Configuration/enforcement and end-to-end service tests remain later checkpoints.
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
- [x] 0.2: account access and client eligibility checks complete; GitHub protection/review controls available. Actual PR enforcement and review evidence belong to Phase 1.
- [x] 0.2 GitHub identity/access: connected user tzehon; public ynab-mcp owned by tzehon; admin and push permissions verified.
- [x] 0.2 GitHub protection/review availability: public repository with admin access; protection controls available; Codex repository review settings accessible with automatic review enabled.
- [ ] Phase 1 branch protection: main currently unprotected and rulesets empty; require PRs and block force pushes/deletion, including administrator bypass where supported.
- [x] 0.2 Jira access: user confirmed signup; browser and newly installed Atlassian plugin verified access to the existing ynab-mcp software project, with zero issues.
- [x] 0.2 Jira subscription: Atlassian Administration billing page explicitly showed Jira on the Free plan with one user on 2026-11-07.
- [x] 0.2 Railway access: existing workspace, Trial plan, usage/billing and Admin membership verified; zero active projects. No project or paid subscription created.
- [x] 0.2 YNAB access: authenticated Developer Settings page opened on 2026-11-07; Personal Access Tokens section visible. Eligibility only; no token generated and no financial data read.
- [x] 0.2 Codex access: CLI 0.163.0 reports logged in using ChatGPT; desktop 26.1103.41825 reports up to date. Installed CLI help confirms Streamable HTTP MCP configuration and OAuth login support, including explicit client ID. No YNAB server connection tested yet.
- [x] 0.2 ChatGPT eligibility: signed-in Plugins → Add → Add custom MCP server form opened on 2026-11-07, with Server URL and OAuth options. No server registered; actual authentication/connectivity remains untested.
- [x] 0.2 Auth0 account access: authenticated dashboard and one listed development tenant verified; application inventory contains two prior gateway-lab registrations. No YNAB-specific tenant/client/API configured.
- [ ] Phase 3a Auth0 tenant selection: assess existing application impact before reuse; prefer isolation if tenant-wide changes affect other projects. Do not reuse the gateway API/client registrations automatically.
- [x] Phase 1 repository creation brought forward at user request: public ynab-mcp exists with README seed.
- [ ] Phase 1 review setup: automatic review is enabled and follows personal On PR open preferences; configure coverage for subsequent pushes and observe review of a real PR at its current head SHA.
- [x] 0.3: Git, GitHub CLI, Node and npm version checks passed; Codex already checked. GitHub CLI authenticated as intended owner with normal credential/network access. User-approved Git identity applied and verified locally in research and ynab-mcp.
- [x] Application clone brought forward for Git identity setup: HTTPS clone succeeded; SSH attempt stalled and was stopped. No global protocol change or application push.
- [x] 0.4: correct research fetch/push remote and clean main checkout verified; `git pull --ff-only` succeeded (already up to date) on 2026-11-07. README, progress and resume instructions reviewed; new-machine identity and pre-implementation resume steps clarified. This is not a second-machine MCP test.
- [x] 0.5: agreed per-machine/account/service storage boundaries reviewed and documented in 00-preflight.md. 1Password remains the private register; actual note contents and runtime credentials were not inspected or provisioned.

## Phase 1 detail

- [x] J1: Existing personal Jira Free site reused; no duplicate site or project.
- [x] 1.2: Existing YNAB project confirmed team-managed. Task and Bug exist; other work types retained.
- [x] 1.2: Created one project-scoped rich-text Paragraph field each for Spec, Plan and Acceptance criteria. Added the same fields after Description on both Task and Bug; saved layouts persisted after reload and field availability was independently verified through Jira metadata.
- [x] J2: Created the planned bootstrap Task, “Set up the YNAB MCP repository and delivery workflow”, after confirming the project had no issues. Description and all three custom fields contain draft-r1 content; values survived browser reload and an independent plugin read. No formal human approval was recorded.
- [ ] Private register: save the verified custom-field mapping and bootstrap issue URL in 1Password. Rediscover from the existing issue when resuming; never guess IDs or recreate fields.
- [ ] J3: Configure Task/Bug workflow stages and board mapping, then capture explicit human intent approval. Bootstrap ticket creation was brought forward for the J2 persistence check; do not create it again.
- [ ] Delivery configuration: enforce PR-only main protection, configure subsequent-push Codex reviews, and connect GitHub for Atlassian with scoped repository access.

## Session handoff

Chapter checkpoint mapping: J1–J3/G1 establish P1; G2 is completed at C6 and establishes P1-links. C1–C4 establish P2. C5–C6 describe the repeating implementation/review cycle. RD-01–RD-06 establish P4 and contribute to P3-auth; Chapter 05 establishes both client checkpoints before RD-07 enables P5-live. RD-08 plus the recovery procedure establishes P6-recovery.

- Last updated (date/time/time zone): 2026-11-07 13:06 Asia/Singapore
- Current phase/checkpoint: Phase 1.2 / J2 complete; Phase 1.3 workflow stages next
- Current Jira issue + approved revision: Bootstrap Task “Set up the YNAB MCP repository and delivery workflow” exists in YNAB; draft-r1 intent/spec/plan/AC, no approved revision. Discover its key and URL from Jira before work.
- Current app branch/PR and commit: main at de44eb5d7745a8b51b96eb9824be910f30baf362 (GitHub initialization only); no application PR yet
- Last observed successful check: Task and Bug layouts persisted with Description, Spec, Plan and Acceptance criteria. All four populated bootstrap Task fields survived browser reload and an independent plugin read.
- Blocker or decision needed: No field-configuration blocker. Workflow and approval records remain pending, as do GitHub PR enforcement, subsequent-push review coverage and integration. Private field mapping has not been saved to 1Password by the agent.
- Next concrete action: Phase 1.3 — inspect and configure Task/Bug workflow stages and board columns using the existing project and bootstrap ticket. Keep draft content unapproved until an explicit human decision is captured.
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
| 2026-11-07 | Live Railway account verification in guided chat | Existing workspace is accessible with Admin role; Trial plan and usage checked. Reuse this workspace and recheck hosting eligibility before deployment. |
| 2026-11-07 | Live YNAB eligibility verification in guided chat | Authenticated Developer Settings access confirmed. Token creation remains deferred to the later credential setup step. |
| 2026-11-07 | Local Codex client verification in guided chat | Installed CLI is signed in through ChatGPT and exposes Streamable HTTP MCP plus OAuth configuration. Desktop updater reports up to date; actual YNAB connectivity remains untested. |
| 2026-11-07 | Live ChatGPT eligibility verification in guided chat | Custom MCP server setup form is available with OAuth support. Dual-client preflight eligibility is established; deployed authentication and tool calls still require testing. |
| 2026-11-07 | Live Auth0 access verification in guided chat | Existing development tenant access confirmed; prior gateway-lab applications remain present. Defer YNAB tenant selection and configuration to Phase 3a after reviewing shared-setting impact. |
| 2026-11-07 | User selected GitHub name and no-reply email in guided chat | Applied repository-local author identity to research and the new local ynab-mcp clone. Global identity preserved; future machines must repeat this local configuration. |
| 2026-11-07 | Phase 0.4 refresh verified in guided chat | Existing research checkout refreshed successfully with --ff-only. Resume from recorded state; reapply local Git identity after cloning. Second-machine hosted MCP verification remains a later checkpoint. |
| 2026-11-07 | Phase 0.5 design review in guided chat | Documented per-machine login/configuration, account-side ChatGPT connection, 1Password register and runtime credential destinations. This review does not establish that runtime secrets have been provisioned. |
| 2026-11-07 | Live GitHub/Codex preflight verification in guided chat | Phase 0 complete. Protection controls and review access exist; main remains unprotected. Automatic review is on with inherited On PR open trigger; Phase 1 must enforce PR delivery and verify current-revision reviews. |
| 2026-11-07 | Jira fields and persistence verified in guided chat | J2 complete. Reuse the three project-scoped rich-text fields and existing draft bootstrap Task; workflow stages and formal intent approval remain next. |
