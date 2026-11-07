# Phase 0 — accounts, choices, and each machine

Return to [the guide](README.md). Complete this chapter before creating paid resources. Repeating this chapter should verify existing resources, not create duplicates.

## 0.1 Record the initial decisions

1. Open [PROGRESS.md](PROGRESS.md). Decide whether its non-secret resource register is safe in the research repo's current visibility. Use a private register for identifiers you do not want public.
2. Use the agreed application repository name `ynab-mcp` with **Public** visibility. Changes go through feature branches and PRs with Codex cloud review; never push directly to `main`. This guide's `tzehon` owner comes from the research remote; verify the owner/account when creating the new repository.
3. Keep proposed Jira key `YNAB`, or replace it consistently in templates and checks. Do not assume the first actual issue number will be 1.
4. Confirm the first release is read-only and for your own account. Later writes are a separate accepted specification.
5. Choose a secret manager you can access from every machine. Create an item named, for example, `YNAB MCP deployment`, initially containing only resource links and notes. Keep token values out of the progress file.

## 0.2 Check access before building

| Service | Action now | Record |
| --- | --- | --- |
| GitHub | Sign in; confirm the intended owner and public-repo protection features | Owner, visibility decision, CI/branch protection availability |
| Jira | If none exists, use the Free signup in Phase 1; avoid creating a second site if one already exists | Site URL and selected plan after signup |
| Railway | Use your existing account; inspect workspace, plan, usage/billing and member permissions | Workspace name; no project yet |
| YNAB | Sign in to the web app; confirm you can open Developer Settings | Eligibility only; no token in docs |
| Codex | Update/sign in and check MCP configuration is available | Client version and account/workspace |
| ChatGPT | Open Plugins and check that Add custom MCP server is available in your account/workspace | Available / unavailable / admin action needed |
| Auth0 | Reuse an appropriate existing tenant or plan to create an isolated one in Phase 3a | Existing tenant or not yet created |

If ChatGPT cannot add custom MCP servers, resolve that account/workspace requirement before treating dual-client access as achievable. A working Codex connection does not demonstrate ChatGPT access. Follow [current connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt); older Apps/Connectors labels may differ.

The existing `research/railway-litellm-auth0` lab is a useful account reference. Its **model gateway OAuth** configuration is a different integration from MCP. Do not copy gateway settings, model-provider overrides, or its secret files into this project.

## 0.3 Prepare a development machine

Use a supported macOS, Linux, or Windows/WSL development environment. Commands here use a POSIX shell; use Git Bash/WSL or equivalent commands on Windows. Choose a working directory such as `~/projects`; do not hardcode another machine's `/Users/...` paths.

1. Install Git from [Git downloads](https://git-scm.com/downloads) and GitHub CLI from [its installation guide](https://github.com/cli/cli#installation).
2. Install a supported Node.js LTS through your preferred version manager or [Node downloads](https://nodejs.org/en/download). Node 26 and 24 are LTS at this guide's verification date. Choose one compatible with the selected SDK; record an exact tested version in the application repo rather than relying on the word `latest`. [Release schedule](https://nodejs.org/en/about/previous-releases)
3. Install/update Codex using the official installation route for your platform. Keep your normal account login; this MCP service does not replace the model provider.
4. Railway's web dashboard is sufficient for the initial deployment. Install its CLI only if you choose the CLI path in Phase 4.
5. Run the checks below. Install any missing tool before continuing.

```sh
git --version
gh --version
node --version
npm --version
codex --version
```

Authenticate GitHub interactively:

```sh
gh auth login
gh auth status
gh api user --jq .login
```

Use browser login; do not paste a token into a committed script. Confirm Git commit identity with `git config user.name` and `git config user.email`. If either is missing or wrong, set the intended values for this repository; consider your GitHub no-reply email. Do not overwrite global configuration unnecessarily.

## 0.4 Obtain or refresh the guide

If the research repository is not on this machine, run from your chosen parent directory:

```sh
gh repo clone tzehon/research
cd research
```

If it already exists, open that checkout, verify `git remote -v`, then:

```sh
git status --short --branch
git pull --ff-only
```

If the checkout is dirty, preserve/commit your own work first. If fast-forward fails, inspect the divergence; do not reset or force-push. Open `ynab-mcp-sdlc-guide/README.md` and your progress register. Clone the application repository only after Phase 1 has actually created it.

## 0.5 Separate account identity from application configuration

Each machine needs its own GitHub and Codex login. Jira/Atlassian integration authorization and the YNAB MCP authorization are separate connections. A repository clone does not carry those sessions. Later, Codex logs in to your hosted MCP endpoint; the YNAB personal token stays on Railway and is not needed merely to use the service from a second machine.

Keep these portable, non-secret facts: repository URLs, Jira issue links, service endpoint, selected versions, workflow status, and next checkpoint. Keep these private: passwords, tokens, OAuth client secrets, refresh tokens, and raw financial responses. Do not copy an entire `.codex` directory between machines.

**Checkpoint P0:** the guide is available locally, GitHub identity is correct, required local tools run, client eligibility is known, and PROGRESS.md records the choices. Continue to [Jira and GitHub](01-jira-and-github.md).
