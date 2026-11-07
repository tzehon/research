# 2. Run the first issue with Codex

Run several issues manually before enabling unattended triggers. This chapter defines the procedure for the proposed `tzehon/ynab-mcp` repository; it does not claim a connection, workflow or validation has already run. Official documentation checked **6 November 2026**.

## 2.1 Open the right checkout and verify identity

Open the actual `ynab-mcp` checkout as a Codex project. In its terminal, inspect:

```bash
pwd
git status --short --branch
git remote -v
git config --get user.name
git config --get user.email
gh api user --jq .login
```

Confirm this is the new project, the remote is `tzehon/ynab-mcp`, and both Git and GitHub identities are personal. Preserve existing uncommitted changes; do not reset the checkout merely to follow this runbook. On another machine, clone the same remote and repeat identity/authentication checks. Configuration committed in Git travels with the checkout; local logins do not.

Start Codex using your existing sign-in. If using the CLI, check `codex --version` and `codex --help`; install or update only if needed through the [official CLI instructions](https://learn.chatgpt.com/docs/cli). This guide does not require an OpenAI API key for the ordinary interactive workflow.

**Checkpoint C1:** Codex can describe the repository and identify the expected remote without changing files.

## 2.2 Connect Jira once per environment

First check Codex's available apps/plugins. If the Atlassian connector is already connected, test it; do not add a duplicate MCP server just because a command appears below. Ask:

```text
Read <full URL of the bootstrap Jira issue>. Report its key, project,
status, Description, Spec, Plan, and Acceptance criteria. Read only.
Also report the site/cloud ID and the custom field IDs you actually used.
```

If no working connector exists and local MCP is your chosen route, inspect `codex mcp list`. If no equivalent Atlassian server is configured, add and authenticate it:

```bash
codex mcp add atlassian-mcp-v2 --url https://mcp.atlassian.com/v2/mcp
codex mcp login atlassian-mcp-v2
```

Complete the browser login using the personal Atlassian account, verify the intended site/resources, then restart the Codex session. These are Atlassian's documented local Codex commands. [Atlassian local setup](https://support.atlassian.com/bitbucket-cloud/docs/connect-your-ai-coding-tools-to-bitbucket-cloud/)

Repeat the read-only test. If a field is missing, check the issue's work type/layout and ask Codex to resolve the actual custom field, rather than inventing an ID. If authorization fails, fix the account/site grant before continuing. Keep OAuth tokens out of Git. A desktop connector, local CLI MCP session and future GitHub runner are separate environments; success in one does not establish access in the others.

Save verified site URL, cloud ID and field mapping in private setup notes. Prefer exact issue URLs/keys during this pilot. Do not impose a permanent ban on all Jira searching based on assumptions about Rovo billing; check your site's applicable tools and allowance when search becomes useful.

**Checkpoint C2:** A fresh Codex session reads the correct issue and all four fields.

## 2.3 Install repository instructions

Prepare [the AGENTS template](./templates/AGENTS.md) for the **root of `ynab-mcp`**. Replace placeholders with the verified Jira site/key, actual development commands and project-specific constraints. Treat these instruction/template edits as bootstrap drafts until the setup issue's plan is approved; include them in that first PR. `AGENTS.md` is Codex's repository instruction file; global and nested instructions can also apply. Keep it short and ask Codex which instruction sources it loaded. [OpenAI instructions documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

The resulting rules should include:

- Jira owns current intent, spec, plan and acceptance criteria. Read them at the start and recheck before publication.
- Historical approved snapshots are evidence; do not maintain a second editable spec in Git.
- Use the real key in branch names, commit messages, PR titles and a full Jira link in the PR.
- Approval must identify the reviewed revision; an agent must not claim its own draft is human-approved.
- Report commands actually run, their results and unverified criteria. Never weaken a test just to get green checks.
- Test changes are allowed when requirements change; explain why and demonstrate preserved coverage.
- Keep personal financial data and credentials out of fixtures, logs and commits. Use synthetic examples.

Only list commands that exist. For an empty project, write “test/build commands not established yet” and make establishing them part of the bootstrap ticket. A command returning success without checking behavior is not a meaningful quality gate.

After two or three successful manual issues, turn repeated prompts into repo skills under `.agents/skills/<skill-name>/SKILL.md`. Candidate skills are `jira-intent`, `jira-spec`, `jira-plan` and `jira-pr-review`. Each needs `name`/`description` frontmatter, inputs, steps, success checks and failure handling. Invoke explicitly initially and verify it loads. Skills guide behavior; CI enforces merge checks. [OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills)

**Checkpoint C3:** Codex correctly states the Jira convention and test commands from the actual repository instructions.

## 2.4 Prepare the first issue through the gates

Use the bootstrap ticket from Chapter 1 first. Later, choose a narrow vertical slice rather than “build the complete YNAB MCP server.” Reuse an existing ticket if it already captures the work.

1. **Intent.** Fill Description using [the issue template](./templates/issue.md). Include the desired outcome, constraints and exclusions. You read it, correct it, and post the intent approval in Jira.
2. **Spec.** Ask Codex:

   ```text
   Read <issue URL> and this repository. Draft Spec and numbered Acceptance
   criteria for the approved intent. Identify unresolved choices and concerns.
   Update those two Jira fields, then set Spec review. Do not implement.
   ```

3. Read the saved fields in Jira. Resolve questions; make ACs observable. For the bootstrap issue, examples are “a commit can open its Jira issue” and “the metadata validator rejects a missing key or a mismatched issue URL,” not “integration works.” Authenticated existence checks belong to a later issue until its credentials and implementation are ready. Capture revision `r1`, attach the snapshot, and post your spec/AC approval with its link. Move to **Plan review**.
4. **Plan.** Use Codex's Plan mode where available (CLI `/plan`) and ask:

   ```text
   Read <issue URL>, the approved spec/AC snapshot and current code. Propose
   implementation order, affected components, risks, and a check for each AC.
   Identify what cannot be verified yet. Do not implement or approve the plan.
   ```

5. Iterate. When ready, authorize writing the agreed text into the Plan field; leave planning mode if its permissions prevent this write. Re-read the saved field. Capture the approved revision and post the human plan approval in Jira. Set **Ready to build**. [Codex planning command](https://learn.chatgpt.com/docs/developer-commands)

Approval snapshot procedure: create a JSON or Markdown export containing the exact approved fields, issue/site IDs, revisions, capture time and observed updated timestamp. Attach it to Jira; obtain the attachment URL and approval comment permalink. Do not substitute a hash for the underlying content. Old snapshots remain evidence of old decisions; substantive changes require a new revision and approval.

For a concrete export, ask Codex:

```text
Read <issue URL> now. Save an exact, read-only snapshot of Description, Spec,
Plan and Acceptance criteria to a timestamped Markdown file in ignored local
scratch, including issue/site IDs, actual field IDs, revision labels, capture
time and the observed Jira updated timestamp. Do not approve or change the
issue. Show the local filename and optionally its SHA-256, without secrets.
```

Use `.local/approvals/` after adding `.local/` to the application's `.gitignore`, or a private scratch directory outside the repo. Compare the saved content with Jira in your browser. Open the issue's attachment control (paperclip/Add attachment), upload the snapshot, then reopen/download it to verify it is retrievable. Copy its link into your own approval comment and copy that comment's permalink into the PR. Only remove the scratch copy after verifying the attachment; preserve the attachment as historical evidence.

**Checkpoint C4:** Jira contains the approved spec, ACs, plan, snapshot and human comment. No implementation depends on an unapproved assumption.

## 2.5 Implement and verify

Before branching, check for an existing matching branch or PR. Resume it if appropriate. Otherwise branch from the current `main`, for example `YNAB-1-delivery-foundations`. Use a separate worktree for another issue if parallel work becomes necessary.

Prompt:

```text
Implement <issue URL> from its approved revisions. Re-read the live fields
and compare them with the approval snapshot first. If substantive scope
changed, stop affected work and explain the difference. Work on this issue's
branch. Run the agreed checks and map results to AC IDs. Draft the PR, but
leave merge and release to me.
```

Move to **In progress**. For a bug, reproduce the defect with a failing regression test, then fix it and show that it passes. For other work, select unit/integration/manual checks appropriate to the behavior. A change to an assertion must have a requirement-based explanation, not just a desire to pass CI.

When work departs materially from the plan, update Jira, record the reason, and reapprove affected scope before continuing. Minor implementation discoveries can be recorded without restarting every gate; the deciding question is whether the accepted behavior, risk or verification changed.

### Build the linkage validator as an explicit implementation task

The guide deliberately does not include a token-dependent workflow pretending to be validated. Implement and test a small deterministic validator in the bootstrap PR, with this contract:

| Check | Required behavior |
|---|---|
| PR title | Starts with exactly one primary key, e.g. `YNAB-42: …` |
| Issue URL | Matches that key on the configured Jira site |
| Jira lookup | Issue exists, belongs to the intended project and is accessible |
| Approval evidence | Required fields, approved snapshot and decision links exist; reviewed field content matches the approved revision |
| Commit messages | Each pushed development commit carries its relevant key; inspect final squash message manually too |
| AC evidence | Every current AC ID has an executable check or an explicit manual result |
| API failure | Reports authentication/network/unavailable distinctly; never treats failed verification as success |

Initially enforce syntax and metadata in CI; perform the authenticated Jira/content checks manually until credentials and reliable snapshot comparison are implemented. Label this limitation clearly. A green syntax check alone does not prove approval or fulfillment.

Run the check when PRs open, synchronize, reopen **and when title/body are edited**. Read title/body as data through environment variables or the event JSON, not shell interpolation. For the bootstrap metadata check, test a missing key, wrong site, title/URL mismatch, omitted AC evidence and a valid case. Only require the check after those cases behave correctly. In the later authenticated-validator issue, additionally test a nonexistent issue, stale approval, denied credentials and an API failure. Use synthetic fixtures where possible. Later Jira edits do not automatically rerun GitHub CI: revalidate approved field content immediately before merge or explicitly trigger a new check.

**Checkpoint C5:** The tests check real behavior, the validator's limits are stated, and no failed/unrun check is reported as passed.

## 2.6 Review, merge and close deliberately

1. Open a PR using [the PR template](./templates/pull_request_template.md). Include the full Jira URL, exact approved revisions/snapshot and comment links, AC-to-test mapping, actual commands/results and known gaps. Set Jira **In review**.
2. Wait for Codex cloud review on this PR, configured in Chapter 1. After further pushes, verify that the latest revision has been reviewed; request `@codex review` if a fresh review does not run. Separately compare the approved Jira content with the change: do not assume cloud review inherits your desktop Jira connection. Inspect findings yourself; review does not replace CI or your merge decision.
3. Fix findings, rerun affected checks, then review the final PR head SHA. Record the human review decision. On a solo PR you authored, manually merging is the decision; GitHub will not let you submit an approving review of your own PR.
4. Confirm the final squash message includes the Jira key, merge, and check that Jira's development view shows the merged PR and new commit.
5. Set **Ready to release**. Mark **Done** only when all required PRs and ACs are complete and the result is usable. For setup/documentation work, merge plus verification may suffice; for shipped server behavior, record the applicable release or local-install smoke test. Do not auto-close on the first merged PR.

**Checkpoint C6:** Ticket → PR/commit and PR/commit → ticket work; evidence identifies the reviewed and delivered revisions.

## 2.7 Resume safely and optionally extend Jira-aware review

On returning later, read the issue, latest approval, working-tree status, branch and existing PR before changing anything. Ask: “Which checkpoint is proven complete, what changed since then, and what is the next unfinished step?” Do not recreate tickets, branches or connections because the chat is new. Authentication is rechecked on every machine; secrets are never moved through Git.

Native Codex cloud review is required by this project workflow from the first implementation PR. After several successful issues, you may add a separate custom Jira-aware CI reviewer. OpenAI documents `openai/codex-action` and `codex exec` for CI. A GitHub runner needs its **own configured OpenAI API credential and usage budget**, GitHub permissions and Jira read access; it does not inherit desktop sign-in. [OpenAI GitHub Action documentation](https://learn.chatgpt.com/docs/github-action)

Start with a read-only reviewer. Fetch and sanitize the approved Jira snapshot using a trusted deterministic step, pass that evidence to the reviewer, and post findings in a separate minimally privileged step. Keep secrets away from untrusted PR code. Pin the chosen action version/commit, test on a deliberately flawed PR, and observe errors and costs before making review routine. Jira-triggered implementation and automatic status transitions remain later work, not prerequisites for this pilot.
