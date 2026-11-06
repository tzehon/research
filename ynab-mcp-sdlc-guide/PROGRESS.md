# Progress and resource register

This file starts with every execution checkpoint unverified. Update after observed results, then commit and push. It is an index, not a replacement for Jira specifications or approvals. Use a private register instead if these identifiers should not appear in this repository.

## Resource register — no credentials or financial data

| Item | Value / status |
| --- | --- |
| Guide verified against provider docs | 2026-11-06 |
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
| Last guide revision used | Record git SHA after pulling |

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

## Session handoff

Chapter checkpoint mapping: J1–J3/G1 establish P1; G2 is completed at C6 and establishes P1-links. C1–C4 establish P2. C5–C6 describe the repeating implementation/review cycle. RD-01–RD-06 establish P4 and contribute to P3-auth; Chapter 05 establishes both client checkpoints before RD-07 enables P5-live. RD-08 plus the recovery procedure establishes P6-recovery.

- Last updated (date/time/time zone): not started
- Current phase/checkpoint: P0
- Current Jira issue + approved revision: none
- Current app branch/PR and commit: none
- Last observed successful check: documentation created; execution not started
- Blocker or decision needed: none recorded
- Next concrete action: complete preflight, then create or identify Jira Free site
- Where evidence lives (links only; redact before sharing): none

## Decision log

Record links to decisions in Jira, not duplicated specifications.

| Date | Jira decision link | Consequence for setup |
| --- | --- | --- |
| Not started | — | — |
