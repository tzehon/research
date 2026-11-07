# Progress and resource register

Guided execution started on 7 November 2026. No phase is complete yet. Update after observed results, then commit and push. It is an index, not a replacement for Jira specifications or approvals. Use a private register instead if these identifiers should not appear in this repository.

## Resource register — no credentials or financial data

| Item | Value / status |
| --- | --- |
| Guide verified against provider docs | 2026-11-06 |
| Research repository visibility | Public; verified through GitHub on 2026-11-07 |
| Progress/identifier storage policy | Pending user decision; account identifiers and credentials not recorded |
| Application GitHub owner/name | Proposed: `tzehon/ynab-mcp`; not created by this guide |
| Application repo URL / visibility | Not verified |
| Jira site / cloud ID | Not created or verified |
| Jira space/project key | Proposed: `YNAB`; not created or verified |
| Intent/epic issue URL | Not created |
| Current implementation issue URL | Not created |
| Spec / Plan / Acceptance criteria field IDs | Not discovered |
| GitHub for Atlassian installation scope | Not configured |
| Auth0 tenant / issuer / API audience | Not configured |
| Auth0 client registration route | Planned: separate explicitly registered clients; see Phase 3a |
| Client application IDs (non-secret) | Not configured |
| Private identity/secret register item name | Not configured |
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
- [ ] 0.1 step 1: progress/private identifier storage policy agreed.
- [ ] 0.1 step 2: application repository name and visibility agreed.
- [ ] 0.1 step 3: proposed Jira key agreed.
- [ ] 0.1 step 4: personal read-only first release agreed.
- [ ] 0.1 step 5: private secret-manager record selected/created.
- [ ] 0.2: account and client eligibility checks complete.
- [ ] 0.3: local tools and Git identity verified.
- [ ] 0.4: guide refresh procedure verified.
- [ ] 0.5: credential/configuration separation reviewed.

## Session handoff

Chapter checkpoint mapping: J1–J3/G1 establish P1; G2 is completed at C6 and establishes P1-links. C1–C4 establish P2. C5–C6 describe the repeating implementation/review cycle. RD-01–RD-06 establish P4 and contribute to P3-auth; Chapter 05 establishes both client checkpoints before RD-07 enables P5-live. RD-08 plus the recovery procedure establishes P6-recovery.

- Last updated (date/time/time zone): 2026-11-07 10:29 Asia/Singapore
- Current phase/checkpoint: P0 / 0.1 step 1 — choose progress and private identifier storage
- Current Jira issue + approved revision: none
- Current app branch/PR and commit: none
- Last observed successful check: guide available locally; research checkout clean and synced before this update; GitHub confirms the research repository is public
- Blocker or decision needed: choose whether to keep generic progress here and account-specific identifiers in a private register
- Next concrete action: agree on the register storage policy; then confirm the proposed application repository name/visibility
- Where evidence lives (links only; redact before sharing): https://github.com/tzehon/research (repository visibility verified via GitHub connector)

## Decision log

Record links to decisions in Jira, not duplicated specifications.

| Date | Jira decision link | Consequence for setup |
| --- | --- | --- |
| Not started | — | — |
