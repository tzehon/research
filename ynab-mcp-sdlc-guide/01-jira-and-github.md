# 1. Set up Jira and GitHub

This chapter prepares the proposed private repository `tzehon/ynab-mcp` and a personal Jira Cloud Free project. It is a runbook, not evidence that either has been created. Check before every create step; resume existing resources rather than duplicating them. Documentation checked **6 November 2026**.

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

Open **Project/Space settings → Fields → Add fields → Create field**. Create the paragraph fields below, then add them to the Task and Bug layouts under **Work types**. Existing fields should be reused within this project, not recreated. Put them in the main description area when the layout allows it. [Atlassian field configuration](https://support.atlassian.com/jira-software-cloud/docs/customize-an-issues-fields-in-team-managed-projects/)

| Field | Contents |
|---|---|
| Description, built in | Intent: problem, outcome, constraints, exclusions, open questions |
| Spec, paragraph | Behavior and design decisions, including unresolved concerns |
| Plan, paragraph | Implementation order, risks, files/components and verification |
| Acceptance criteria, paragraph | Stable IDs such as `AC-1`, each with observable pass conditions |

Use [the issue template](./templates/issue.md) as the starting content. If setting a default Description is unavailable, paste the template when creating the issue; no paid template app is required.

When Codex is connected in Chapter 2, ask it to read a sample issue and report the **actual custom field IDs** for these fields. Save the mapping with the site URL and cloud ID in setup notes. API scripts must use verified IDs, not guessed `customfield_12345` values. Display names alone are ambiguous across projects.

**Checkpoint J2:** A Task shows all four fields, and text survives save/reload.

## 1.3 Define stages and approval records

In **Project/Space settings → Work types → Task → Edit workflow**, configure these statuses, apply the workflow, then map the statuses to board columns. Repeat for Bug or share the workflow. Newly added statuses may allow transitions from anywhere by default; the arrows below describe our process, not a claim that Jira has enforced every gate. [Atlassian workflow editing](https://support.atlassian.com/jira-software-cloud/docs/create-edit-and-delete-statuses-in-team-managed-projects/)

```text
Idea → Spec review → Plan review → Ready to build
     → In progress → In review → Ready to release → Done
```

Keep Idea through Ready to build in the To do category; In progress through Ready to release in In progress; only Done in Done. You may group several statuses into one board column. Add a route back to the relevant review stage when scope changes.

Use these explicit gates:

| Gate | Human decision | Result |
|---|---|---|
| Intent | Is the problem worth addressing? | Approve intent; allow spec drafting |
| Spec | Are behavior, constraints and ACs correct? | Approve spec; move to Plan review |
| Plan | Is this implementation and verification adequate? | Approve plan; move to Ready to build |
| PR | Does this exact change satisfy the approved scope? | Review current head SHA, then merge |
| Completion | Is the intended result usable and verified? | Move Ready to release to Done |

Before approval, capture the current intent/spec/plan/AC text in a timestamped snapshot attached to the Jira issue, for example `YNAB-1-approved-r1.json`. Include issue key, site, custom field IDs, revision labels, capture time, and Jira's observed updated timestamp. This is historical evidence; **the current Jira fields remain authoritative**. Do not edit an old snapshot to match later decisions.

Post the approval yourself in Jira, for example:

```text
Approved spec r1 and AC r1 for YNAB-1.
Evidence: <link to snapshot attachment>
Decision: allow implementation planning. Open concerns: none.
```

For plan approval, name the plan revision and approved spec/AC revisions. Copy the comment permalink for the PR. Jira records the commenter and time. A status move or a comment posted by an agent using your token does not independently prove a human approved it. These are personal working agreements, not tamper-proof or independently enforced approvals.

Create the first Task: **Set up the YNAB MCP repository and delivery workflow**. Record the actual assigned key; `YNAB-1` below is an example. Give it ACs for repository privacy, instructions/template, meaningful checks, and bidirectional navigation. This issue covers the initial bootstrap commit and the first workflow PR.

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

If it does not exist, use GitHub **New repository**: owner `tzehon`, name `ynab-mcp`, **Private**. Leave automatic README, license and `.gitignore` initialization unchecked so the initial commit can carry the Jira key. Create the empty remote, then from your chosen parent directory run:

```bash
gh repo clone tzehon/ynab-mcp
cd ynab-mcp
```

An empty-repository warning is expected. Do not run this over an existing directory. Before creating the first commit, set **repository-local** identity:

```bash
git config user.name 'YOUR_COMMIT_NAME'
git config user.email 'YOUR_VERIFIED_OR_GITHUB_NOREPLY_EMAIL'
git config --get user.name
git config --get user.email
```

Use actual values from your personal GitHub email settings. Git author identity and the authenticated GitHub account are separate. On a new machine, verify both again.

For the minimal bootstrap, create `README.md` in your editor stating the project's purpose and Jira project URL. Review it, then run the following with the **actual** issue key substituted for `YNAB-123`:

```bash
git add README.md
git commit -m "YNAB-123: Initialize YNAB MCP repository"
git branch -M main
git push -u origin main
```

These initialization commands are for the verified empty repo only. Record this one-time direct bootstrap in the ticket; subsequent work uses PRs. Do not copy private YNAB data, tokens or exported budgets into the README.

**Checkpoint G1:** The remote is `tzehon/ynab-mcp`, visibility is Private, the local remote matches, and the bootstrap commit has the ticket key.

## 1.5 Set realistic solo review rules

For a private personal repository, protected branches require GitHub Pro or an applicable higher plan. If supported, add protection for `main`: require PRs and passing named CI checks; block force pushes/deletion and bypasses where available. Until CI has run, the check names may not be selectable. Return after the first successful workflow run. [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

Do **not** require an approving review from yourself when you author the PR: GitHub forbids authors approving their own PRs. For a solo project, manually review and merge after checks; a second human reviewer can become a required gate later. A `CODEOWNERS` entry by itself is not independent review. [GitHub approval rules](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews)

If staying on GitHub Free with this private repository, record that PR/CI discipline is manual rather than technically enforced. Also defer deployment gates: environment required reviewers on Free, Pro and Team are limited to public repositories. [Environment availability](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## 1.6 Connect native traceability

1. From Jira's app marketplace, install **GitHub for Atlassian**, checking that the publisher is Atlassian.
2. Connect the intended GitHub account and grant access to `ynab-mcp`; check selected repository access rather than assuming all repositories are needed.
3. Use the actual issue key in branch names, PR titles and **every pushed commit**. Add a full Jira issue URL in each PR description. [Atlassian setup and conventions](https://support.atlassian.com/jira-cloud-administration/docs/integrate-with-github/)
4. If your GitHub plan supports custom autolinks, open **Repository settings → Autolink references**. Configure numeric prefix `YNAB-` and URL `https://YOUR-SITE.atlassian.net/browse/YNAB-<num>`. Otherwise keep full issue URLs in PR and commit bodies. [GitHub autolinks](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/configuring-autolinks-to-reference-external-resources)
5. Configure squash merging to default to the PR title. Before merging, verify the final commit message still includes the key; the message can be edited. [Squash settings](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)

Use [the PR template](./templates/pull_request_template.md) at `.github/pull_request_template.md` in the new repository. Its issue link, approval evidence and AC-to-check mapping are mandatory information, even before a validator exists.

After Chapter 2 creates and merges the first real setup PR, return to validate: Jira issue → **Development → PR count → PR**; GitHub PR → Jira link; commit → Jira link. If Development is hidden, inspect the issue layout and development permissions. Jira displays linked records, with a 100-commit display limit; do not treat it as an exhaustive historical archive. [Development UI](https://support.atlassian.com/jira-software-cloud/docs/view-development-information-for-an-issue/)

**Checkpoint G2 / P1-links (complete at Chapter 2 C6):** Save the ticket URL, PR URL, one commit URL and the successful navigation result. If synchronization is missing, check installation/repository access and key spelling before creating a second connection. For now, once J3/G1 and integration configuration are complete, continue to [Chapter 2](./02-codex-workflow.md); do not create an unplanned PR merely to finish this checkbox early.
