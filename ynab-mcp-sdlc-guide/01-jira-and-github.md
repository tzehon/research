# 1. Set up Jira and GitHub

This chapter prepares the agreed public repository `tzehon/ynab-mcp` and a personal Jira Cloud Free project. It is a runbook, not evidence that either has been created. Check before every create step; resume existing resources rather than duplicating them. Documentation checked **6 November 2026**.

Jira now calls projects **spaces** and issues **work items** in some screens. Both wordings refer to the same objects below. `YNAB` is the proposed project key; choose the actual key once, then substitute it throughout this guide and the templates.

## 1.1 Create or select your personal Jira site

1. Sign in to your personal Atlassian account. Check the site switcher first. Reuse an appropriate personal site if it already exists; do not put this project in an employer's site.
2. If needed, open [Jira pricing](https://www.atlassian.com/software/jira/pricing), choose **Free**, and complete signup. Choose an available site name; record the resulting `https://YOUR-SITE.atlassian.net` URL.
3. In Atlassian Administration, check the Jira subscription actually says **Free**, rather than an expiring paid trial. The Free plan supports up to ten users; this guide starts with only you. Review the actual automation allowance later before enabling automation, because Atlassian's billing units and limits change.
4. Record the site URL and account email in your private setup notes. Never record passwords or tokens in this repository.

**Checkpoint J1:** You can open the personal Jira site and create work there. Save the site URL and confirmed plan.

## 1.2 Create a small Kanban project

1. Look through existing projects/spaces for `YNAB` and `YNAB MCP`.
2. If absent, choose **Spaces → Create space** (or **Projects → Create project**), select the software **Kanban** template, and select **team-managed**.
3. Name it **YNAB MCP** and set its key to **YNAB**, if available. Finish creation. Verify the project details identify it as team-managed. [Atlassian creation instructions](https://support.atlassian.com/jira-software-cloud/docs/create-edit-and-delete-team-managed-projects/)
4. Start with the Task and Bug work types. Use Task for the setup issue; avoid designing a large hierarchy before you have working examples.

Open **Project/Space settings → Fields → Add field → Create a new field** (labels may vary). Create the paragraph fields below, then add them to the Task and Bug layouts under **Work types**. Existing fields should be reused within this project, not recreated. Put them in the main description area when the layout allows it. [Atlassian field configuration](https://support.atlassian.com/jira-software-cloud/docs/customize-an-issues-fields-in-team-managed-projects/)

| Field | Contents |
|---|---|
| Description, built in | Intent: problem, outcome, constraints, exclusions, open questions |
| Spec, paragraph | Behavior and design decisions, including unresolved concerns |
| Plan, paragraph | Implementation order, risks, files/components and verification |
| Acceptance criteria, paragraph | Stable IDs such as `AC-1`, each with observable pass conditions |

Choose **Paragraph (supports rich text)**, not the plain-text variant. Save the Task and Bug layouts separately, reusing the same three fields. Reload each layout to verify the change.

Use [the issue template](./templates/issue.md) as the starting content. If setting a default Description is unavailable, paste the template when creating the issue; no paid template app is required.

When Codex is connected in Chapter 2, ask it to read a sample issue and report the **actual custom field IDs** for these fields. Save the mapping with the site URL and cloud ID in setup notes. API scripts must use verified IDs, not guessed `customfield_12345` values. Display names alone are ambiguous across projects.

**Checkpoint J2:** A Task shows all four fields, and text survives save/reload. You can use the bootstrap Task named in 1.3 for this check, with clearly marked draft content. Search before creating it, and reuse it in later steps; creating a ticket does not constitute human approval.

## 1.3 Define stages and approval records

In **Project/Space settings → Work types → Task → Edit workflow**, configure these statuses, apply the workflow, then map the statuses to board columns. Repeat for Bug or share the workflow. Newly added statuses may allow transitions from anywhere by default; the arrows below describe our process, not a claim that Jira has enforced every gate. [Atlassian workflow editing](https://support.atlassian.com/jira-software-cloud/docs/create-edit-and-delete-statuses-in-team-managed-projects/)

```text
Idea → Spec review → Plan review → Ready to build
     → In progress → In review → Ready to release → Done
```

Keep Idea through Ready to build in the To do category; In progress through Ready to release in In progress; only Done in Done. You may group several statuses into one board column. Add a route back to the relevant review stage when scope changes.

For an existing shared workflow, use this sequence (verified in the UI on 7 November 2026):

1. Add the missing statuses with the categories above. Select **Allow transitions from any status** if using this guide's flexible review process.
2. Select the initial **To Do** status and use **Replace** to create **Idea** in the To do category. Replacement keeps the original status available to other workflows; renaming a shared status can affect them. Do not add a separate Idea node first if the replacement picker excludes statuses already in the draft.
3. Select **Update workflow** to open **Save workflow for selected work types**. Keep only **Task** and **Bug** selected. This scope selection precedes the final publication action.
4. Select **Next**, check the migration from **To Do** to **Idea**, then publish with **Update workflow**. Existing Task/Bug items may take a moment to migrate. A migration does not record approval.
5. On the board, open **More board view actions → Configure columns**. Map every new status out of **Hidden statuses**. Create and order the eight columns shown above; the Idea column can also hold the original To Do status for other work types. Publish the mapping separately.
6. Verify the board and read back statuses per work type and board configuration through the Atlassian plugin. Confirm Task/Bug have eight statuses, other work types retain their original statuses, and no Task/Bug stage is hidden.

Use these explicit gates:

| Gate | Human decision | Result |
|---|---|---|
| Intent | Is the problem worth addressing? | Approve intent; allow spec drafting |
| Spec | Are behavior, constraints and ACs correct? | Approve spec; move to Plan review |
| Plan | Is this implementation and verification adequate? | Approve plan; move to Ready to build |
| PR | Does this exact change satisfy the approved scope? | Review current head SHA, then merge |
| Completion | Is the intended result usable and verified? | Move Ready to release to Done |

Before approval, capture the current intent/spec/plan/AC text in a timestamped snapshot attached to the Jira issue, for example `YNAB-1-intent-draft-r1-YYYYMMDDTHHMMSSZ.json`. Include issue key, site, custom field IDs, revision labels, capture time, and Jira's observed updated timestamp. This is historical evidence; **the current Jira fields remain authoritative**. Do not edit an old snapshot to match later decisions. Label a pre-approval snapshot as draft/review evidence, not approved. Download the attached file and compare its bytes or SHA-256 with the original before citing it. Keep account-specific snapshots in Jira and private storage, outside public Git.

For the first intent gate, review the Description field and post an explicit decision yourself in Jira, naming the exact snapshot attachment. For example:

```text
Approved intent draft-r1 for YNAB-1.
Evidence: <exact snapshot attachment filename or link>.
Decision: proceed to specification review for the repository and delivery workflow setup.
Spec, plan and acceptance criteria remain drafts; implementation is not approved by this comment.
```

For the later spec gate, post the approval yourself in Jira, for example:

```text
Approved spec r1 and AC r1 for YNAB-1.
Evidence: <link to snapshot attachment>
Decision: allow implementation planning. Open concerns: none.
```

For plan approval, name the plan revision and approved spec/AC revisions. Copy the comment permalink for the PR. Jira records the commenter and time. A status move or a comment posted by an agent using your token does not independently prove a human approved it. These are personal working agreements, not tamper-proof or independently enforced approvals.

Create or reuse the first Task: **Set up the YNAB MCP repository and delivery workflow**. If it was created for J2, update that existing ticket. Record the actual assigned key; `YNAB-1` below is an example. Give it ACs for public visibility, PR-only delivery, Codex cloud review, instructions/template, meaningful checks, and bidirectional navigation. This issue covers the initial bootstrap commit and the first workflow PR.

**Checkpoint J3:** The board shows the stages, the bootstrap ticket exists, and its intent is approved. Continue its spec and plan in Chapter 2 before substantive implementation.

## 1.4 Check GitHub identity and create the repository once

On each development machine, check:

```bash
gh auth status
gh api user --jq .login
gh repo view tzehon/ynab-mcp --json nameWithOwner,visibility,url
```

If GitHub CLI is absent, install it from [the official CLI site](https://cli.github.com/). If unauthenticated, run `gh auth login` and select your personal account. Confirm the login is `tzehon` before repository creation. A failed repository lookup can mean missing access or network failure; verify in the signed-in browser before concluding the repository does not exist.

If the repository exists, confirm its owner and privacy and clone it into your chosen projects directory. Do not initialize over an existing checkout.

If it does not exist, use GitHub **New repository**: owner `tzehon`, name `ynab-mcp`, **Public**. Select **Add a README** to establish the initial default branch. This is GitHub's minimal repository-creation seed, not a direct push of implementation code; a PR needs an existing base commit. Put no private identifiers in the seed. All subsequent content changes, including replacing that README and adding CI/instructions, go through a PR. Do not use the former direct-to-main bootstrap commands.

Clone from your chosen parent directory:

```bash
gh repo clone tzehon/ynab-mcp
cd ynab-mcp
git config user.name 'YOUR_COMMIT_NAME'
git config user.email 'YOUR_VERIFIED_OR_GITHUB_NOREPLY_EMAIL'
git remote -v
git status --short --branch
```

Use your actual Git identity. Confirm that the remote's default branch is `main`. Prepare the setup ticket's accepted plan in Chapter 2 before implementation. Then create a feature branch using its actual Jira key:

```bash
git switch -c YNAB-123-delivery-foundations
```

After implementing and reviewing that planned change, stage only intended files, commit with the real key, and push the feature branch:

```bash
git commit -m "YNAB-123: Establish delivery workflow"
git push -u origin YNAB-123-delivery-foundations
```

Open a PR targeting `main`, using the PR template and issue link. Never run `git push origin main`, including for documentation, fixes, or bootstrap application code. Fixes after review stay on the PR branch. Merge through GitHub after review and checks; do not enable automatic merging by default.

**Checkpoint G1:** The remote is `tzehon/ynab-mcp`, visibility is Public, the local remote matches, and `main` has the minimal GitHub-created seed. The first implementation PR follows in Chapter 2.

## 1.5 Configure PR protection and Codex cloud review

For this public repository, configure protection/rules for `main`: require PRs, disallow force pushes and deletion, apply to administrators where supported, and add passing named CI checks after the first workflow has run. Avoid routine bypasses. [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

For an existing repository, inspect **Settings → Rules → Rulesets** before creating another rule. Reuse an equivalent rule rather than adding duplicates. The configuration applied on 7 November 2026 is:

1. Create a branch ruleset named **main-pr-only**, set enforcement to **Active**, and target exactly `refs/heads/main`.
2. Leave the bypass list empty, including administrators and apps.
3. Enable **Restrict deletions**, **Block force pushes**, and **Require a pull request before merging**.
4. Set required approving reviews to **0** for this solo project; require review-thread resolution and dismiss stale approvals on new commits. Do not require code-owner or last-push approval without another eligible human reviewer.
5. Save the ruleset. After the first real CI workflow runs, return to add its exact required check names. Do not invent check names before they exist.
6. Verify the effective rules and branch SHA with read-only commands; do not test by pushing to main:

```bash
gh api repos/tzehon/ynab-mcp/rulesets
gh api repos/tzehon/ynab-mcp/rules/branches/main
gh api repos/tzehon/ynab-mcp/branches/main --jq '{protected,sha:.commit.sha}'
```

The effective rules should include `pull_request`, `deletion` and `non_fast_forward`; check the ruleset detail for an empty bypass list. This verifies configuration, not a rejected-push experiment. [GitHub ruleset API](https://docs.github.com/en/rest/repos/rules)

Do not require your own approving review when you authored the PR. A solo workflow uses your review of the diff, Codex findings and CI, followed by an explicit GitHub merge. Codex cloud review is additional evidence; do not assume it satisfies a required human approval or automatically blocks merging. [GitHub approval rules](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews)

Before the first implementation PR:

1. Connect the public `ynab-mcp` repository to Codex's GitHub integration and verify repository access.
2. Open [Codex code review settings](https://chatgpt.com/settings/code-review), select the repository and enable automatic review under Review code.
3. In the repository’s **Shared repository settings → Review code**, keep **Automatic review** on and set **Trigger → On every push**. This repository override covers later pushes without changing other repositories’ personal defaults. If **Review → Follow personal preferences** is selected, confirm personal Automatic review is on for the PR author. The saved trigger was verified for this repository on 7 November 2026. Opening a PR is not sufficient without these settings.
4. Put concise `## Code Review Rules` in root `AGENTS.md` through the first PR. Use the guide's template as a starting point.
5. Open the implementation PR as ready for review. Confirm that a Codex review actually appears; check its reviewed revision after further commits. If a fresh review does not run, request `@codex review` in the PR and wait for the result.

Record settings completion separately from first-review evidence. Settings alone do not prove that a review ran or that CI blocks merging; verify both against the first implementation PR and its later pushes. Native cloud review is the selected first-release workflow; the separate API-backed Jira-aware reviewer in Chapter 2 is optional later work. [Official OpenAI review instructions](https://learn.chatgpt.com/docs/third-party/github)

## 1.6 Connect native traceability

1. From Jira's app marketplace, install **GitHub for Atlassian**, checking that the publisher is Atlassian.
2. Connect the intended GitHub account and grant access to `ynab-mcp`; check selected repository access rather than assuming all repositories are needed.
3. Use the actual issue key in branch names, PR titles and **every pushed commit**. Add a full Jira issue URL in each PR description. [Atlassian setup and conventions](https://support.atlassian.com/jira-cloud-administration/docs/integrate-with-github/)
4. If your GitHub plan supports custom autolinks, open **Repository settings → Autolink references**. Configure numeric prefix `YNAB-` and URL `https://YOUR-SITE.atlassian.net/browse/YNAB-<num>`. Otherwise keep full issue URLs in PR and commit bodies. [GitHub autolinks](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/configuring-autolinks-to-reference-external-resources)
5. Configure squash merging to default to the PR title. Before merging, verify the final commit message still includes the key; the message can be edited. [Squash settings](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)

Use [the PR template](./templates/pull_request_template.md) at `.github/pull_request_template.md` in the new repository. Its issue link, approval evidence and AC-to-check mapping are mandatory information, even before a validator exists.

After Chapter 2 creates and merges the first real setup PR, return to validate: Jira issue → **Development → PR count → PR**; GitHub PR → Jira link; commit → Jira link. If Development is hidden, inspect the issue layout and development permissions. Jira displays linked records, with a 100-commit display limit; do not treat it as an exhaustive historical archive. [Development UI](https://support.atlassian.com/jira-software-cloud/docs/view-development-information-for-an-issue/)

**Checkpoint G2 / P1-links (complete at Chapter 2 C6):** Save the ticket URL, PR URL, one commit URL and the successful navigation result. If synchronization is missing, check installation/repository access and key spelling before creating a second connection. For now, once J3/G1 and integration configuration are complete, continue to [Chapter 2](./02-codex-workflow.md); do not create an unplanned PR merely to finish this checkbox early.
