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

The agreed storage policy uses the 1Password Secure Note **YNAB MCP deployment** as the private setup register. Generic progress, versions, public repository links and next steps go in PROGRESS.md. Account-specific identifiers and deployment configuration go in 1Password even when they are not credentials. Raw financial responses are not setup records and do not belong in either repository.

| Item | Where it belongs | On another machine |
| --- | --- | --- |
| GitHub CLI and Codex account sign-in | Each client's normal credential storage | Sign in using the normal flow; a clone does not transfer sessions |
| Git author name and no-reply email | Repository-local `.git/config` in both checkouts | Reapply the agreed identity; do not copy the entire `.git` directory |
| Atlassian authorization | The selected Codex/ChatGPT integration | Check the existing connection; reauthenticate if needed |
| Codex YNAB MCP endpoint, public client ID and callback configuration | Host-local MCP configuration; private setup register for reference | Add the same service, verify the machine's actual callback and log in again |
| ChatGPT YNAB MCP connection | Intended ChatGPT account/workspace | Inspect and reuse the account-side connection; do not recreate it solely for a new computer |
| Auth0 tenant/issuer, API audience, owner subject, client IDs, callbacks and YNAB plan allowlist | Private setup register; required values later copied to their intended Auth0/client/Railway settings | Reuse the recorded resources and verify current values |
| YNAB personal access token | 1Password and the Railway service's protected `YNAB_ACCESS_TOKEN` variable | Not needed on a machine that only calls the hosted service; local development uses fixtures |
| ChatGPT confidential OAuth client secret | 1Password and the ChatGPT connection's credential fields | Not a Railway variable or Codex configuration value |
| Codex OAuth client secret | None in the planned public native-client design | Use its public client ID and interactive login |
| OAuth access/refresh tokens | Client-managed credential storage | Let the client authenticate; do not paste tokens into the guide or copy token caches |

This is the planned storage arrangement, not evidence that credentials have been created or installed. The Phase 0 review does not require inspecting 1Password contents, generating tokens, or changing provider settings. At this point the private note is user-confirmed; YNAB service credentials and client registrations remain later work.

When preparing a new machine, clone the repositories, configure local Git identity, sign into the required clients and consult the private register. Do not copy an entire `.codex` directory between machines. Add the real YNAB token to Railway only after the fixture-mode authentication checks pass in both clients.

**Checkpoint P0:** the guide is available locally, GitHub identity is correct, required local tools run, client eligibility is known, and PROGRESS.md records the choices. Continue to [Jira and GitHub](01-jira-and-github.md).
