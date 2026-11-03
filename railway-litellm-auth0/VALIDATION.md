# Validation record

Initial preparation on 2026-11-03 created no Railway/Auth0 resources, read or stored no real API key, and left the active Codex TOML unchanged. Subsequent checks against the user-created Auth0 setup and empty Railway project are noted below; no deployment has been applied by the assistant.

## Local checks

- TypeScript type-check of gateway, Railway definitions, scripts, and tests.
- 20 passing unit/config/IaC/diagnostic tests: RS256 token validation; invalid signature/issuer/audience/client/scope/expiry; user identity stability across refresh; distinct users; credential/metadata stripping; model/route/request-size restrictions; incremental SSE; upstream status preservation.
- Authorization transport regression: accept a valid signed token in `Authorization`, reject missing/malformed/legacy-only credentials and actual repeated Authorization fields before key provisioning, and replace the client token with the server-only per-user key on the LiteLLM hop.
- Codex configuration recovery: 16 Python regression cases run through the Node test suite, using temporary homes only. They cover native OAuth defaults, plugin removal, added projects/comments, exact restoration, conflicted edits and explicit recovery, invalid current TOML, checksum/symlink protection, old journals, missing local settings, repeat restore, and manually restored configuration.
- Railway definition test: evaluate the SDK resource definitions with fake secrets, one database volume, and provider key present only in LiteLLM. This is not a live Railway plan.
- Volume sizing: 500 MB for fresh and pre-existing local configs, explicit larger-size override, and rejection of invalid sizes. The user-run apply failed on the old 1,024 MB volume; a read-only history query returned `Max size of 500 MB on current plan. Please select a valid size or upgrade`. No database volume or running service instance was present after that failure. The corrected apply has not yet been run by the assistant.
- Apply diagnostics: filter failed IaC operations by environment and attempt time, ignore unrelated history, and redact raw/URL-encoded local secrets. The read-only `diagnose` command retrieved the actual 500 MB limit error, and a live plan with the corrected default succeeded. No corrected apply/deployment was attempted.
- Native IaC evaluation regression: reproduces the misleading minimum-CLI error when the SDK probes the inherited Node executable, then passes with the wrapper's Railway executable environment. The real SDK version check remains enabled.
- A read-only live Railway plan against the user-created project succeeded: 4 resources to add, 0 to change, 0 to destroy. No apply/deploy was performed.
- Auth0 provider `1.60.0`: initialization, formatting, and `terraform validate`.
- Gateway deployment Docker image built successfully using Node `22.22.2-bookworm-slim` and production dependencies.
- LiteLLM deployment image built from `ghcr.io/berriai/litellm:v1.106.6` and started with its actual database migration entrypoint.
- Real local LiteLLM + PostgreSQL test: concurrent first login, separate identities/keys, persisted user budgets/rate limits, repeat lookup after restart, rejection after seed changes, and no key re-creation after revocation. Test containers/volumes were removed.
- Clean `npm ci` completed on Node `26.13.0` / npm `11.20.0`, including Railway's postinstall binary download; `npm run railway -- --version` reported `5.71.0`, and `config plan --help` worked. This was verified after removing the incompatible `tar` 7 override that broke fresh installs. The earlier zero-audit result with that override did not establish installer compatibility.
- `npm audit --omit=dev` reported zero vulnerabilities. The full development dependency audit reports one high and one critical finding through the pinned Railway npm installer's `tar` 6 dependency; these upstream findings remain unresolved and are excluded from the gateway image by `npm ci --omit=dev`.

The container test caught and fixed an IPv6-only LiteLLM listener that passed an internal health check but was not reachable through IPv4. New Railway environments have internal IPv4, and the corrected listener is tested on IPv4.

## Installed Codex recognition check

App version: `26.1027.61615`; bundled CLI: `0.166.0-alpha.5.1` (the standalone Homebrew CLI was `0.163.0`). A read-only app-server probe used temporary command-line overrides and fake public endpoint/client settings, not a modified TOML. Both forms—omitting `delivery` as in the supplied example, and explicitly selecting the `Authorization` header—returned the following `account/gatewayOAuth/read` result:

```json
{
  "providerId": "railway-authorization-probe",
  "providerName": "Authorization delivery check",
  "required": true,
  "status": "notReady",
  "error": null
}
```

This verifies that the installed app's backend accepts both Authorization configuration forms; the lab uses omitted `delivery` to match the supplied example. The public gateway guide still described Authorization as reserved when checked on 2026-11-03, so that restriction was not treated as authoritative for this installed build. This read-only check does not observe an outgoing authenticated request or verify a completed Auth0 grant or the desktop UI interaction.

## Recovery incident investigation

On 2026-11-03, the saved installed configuration and the failed-restore configuration differed semantically only by removal of the `computer-history@openai-bundled` plugin entry. The desktop startup log recorded that plugin removal. The old whole-file checksum guard therefore refused a routine Codex edit. The corrected restore compares the original, installed, and current files, preserves unrelated settings, validates the merged result, and archives recovery copies. Explicit `restore --original` remains available when edits conflict. The user's manually restored active configuration matched the original backup byte for byte. Replaying the actual saved incident through the new merge restored the original settings while preserving the plugin removal. The stale installation journal was archived and cleared without changing the active file bytes or modification time.

Auth0 recorded a successful browser login at 09:59:01 UTC. The available Codex log recorded cancellation of its pending gateway login at 09:58:26 UTC, and no successful token exchange was observed in the inspected Auth0 logs. This is consistent with returning to a canceled attempt; the original on-screen error was not available, so it is not a confirmed complete diagnosis of the login failure.

A read-only probe using the installed Codex backend and actual public lab OAuth settings, with both `requires_openai_auth` and `delivery` omitted, returned `required: true`, `status: notReady`, `error: null`. The active TOML's checksum remained unchanged. Codex source confirms `requires_openai_auth` defaults to false. This probe establishes config acceptance, not successful login or inference.

A subsequent browser sign-in used that installed Codex backend in a separate process with the real lab provider, leaving the normal desktop TOML unchanged. An older browser tab returned `OAuth callback state did not match`; inspection confirmed its state belonged to another attempt. The fresh tab's callback state matched, the browser displayed `Sign-in complete`, `account/gatewayOAuth/login` completed successfully, and `account/gatewayOAuth/read` in that process returned `status: succeeded`, `error: null`. The encrypted gateway credential file was updated. No model request was sent.

A fresh backend process subsequently returned `status: notReady`, `error: null`. Reuse of the saved grant after restart is therefore **not qualified** by this test; the live desktop restart/refresh checks below remain required. No credential-store mode was changed to work around this result. The normal desktop config stayed byte-for-byte identical to the original throughout.


## Public dashboard check

On 2026-11-03, after the user deployed the lab, Railway reported successful deployments for all three services. At the user's request, a generated HTTPS domain was added to LiteLLM on port 4000. An unauthenticated GET to `/ui` returned its HTML page with HTTP 200; an unauthenticated GET to `/v1/models` returned HTTP 401. No credentials were submitted to the UI, and no Codex/Auth0 settings were changed by this networking action. This check does not qualify native desktop SSO.

## Desktop request reached the deployed gateway and LiteLLM

On 2026-11-03, the user's desktop screenshots showed two downstream request failures after authentication: `gpt-6.1-sol` reached LiteLLM/OpenAI but its `user` value was 69 characters against a 64-character limit; selecting `gpt-6-astra` then returned the gateway's model-allowlist 403. Gateway code verifies the JWT before the allowlist check and key provisioning. A read-only LiteLLM user lookup confirmed the matching Auth0-derived user and server-only key were created at 10:28:53 UTC, with `gpt-6.1-sol` allowed and zero spend. This proves authenticated routing, not a completed model reply.

The gateway now hashes the existing internal ID into a separate 64-character upstream `user` value. Internal IDs, deterministic keys, budgets, revocation behavior, and the spend-log ownership join remain unchanged. Regression tests use an actual JWT verifier with a local signing key, enforce the upstream 64-character constraint, and verify that the existing key owner is preserved. The model-allowlist error now names the allowed models. Type-check and all 20 tests passed. The corrected gateway has not been deployed by this change; live inference remains to be retried after deployment.

## Fresh sign-in for repeatable demos

On 2026-11-03, the installer was changed to request fresh login on each switch into the lab. It adds Auth0 `prompt=login` plus a public per-install `codex_demo_run` marker to the authorization URL. The checked Codex implementation keys grants by that full URL, so each install selects an unused credential entry. Existing grants and primary ChatGPT credentials are not deleted or revoked. `--reuse-login` selects the previous stable configuration for normal reuse testing. Reopening without reinstalling may still reuse the grant for that run.

Two added temporary-home regressions exercise repeated fresh installs/restores, credential-file preservation, unchanged OAuth endpoints/scopes, and stable reuse mode. `npm run check`, all 20 Node tests (including 16 Python cases), and `git diff --check` passed. The initial sandboxed test invocation could not bind localhost (`EPERM`); the full suite passed when run with localhost access.

A probe using the installed Codex backend and process-only generated provider settings returned `required: true`, `status: notReady`, `error: null`. Its native login handoff retained `prompt=login` and the fresh marker, used PKCE S256, and supplied the exact registered loopback callback. The attempt was canceled before authentication. Fetching that authorization URL with a temporary cookie jar reached Auth0 `/u/login` with HTTP 200 and username/password fields. The initial HTTP probe without cookies returned 400 after the redirect; adding the required transient cookie handling resolved it. No user credentials were submitted, no token exchange or model request was made, and checksums of the active TOML, ChatGPT auth file, and encrypted gateway grant file stayed unchanged. A complete desktop sign-in using the new default remains a user-run check.

## Gateway model picker (2026-11-04)

The installer and preview now build an ignored local catalog from the selected Codex home's `models_cache.json`, filtering to the lab allowlist while preserving model metadata. The configured allowlist is `gpt-6.1-sol` only. Restore reinstates the prior catalog setting, or removes the override when the original configuration had none.

Validation: `npm run check`, all 20 Node tests (including 22 Python configuration cases), and `git diff --check` passed. Six added Python cases cover metadata preservation and filtering, original catalog restoration with later config edits, missing/invalid cache rejection before mutation, preview isolation, allowlist/default validation, and `CODEX_HOME` selection. Existing tests continue covering credential preservation, legacy journals, and restore conflicts. The initial sandboxed full suite could not bind localhost; it passed with localhost access.

A temporary-home probe ran the installed desktop's bundled CLI `0.166.0-alpha.5.1` through `initialize` and `model/list`. Normal mode returned the bundled full model list; the generated catalog returned only `gpt-6.1-sol`, visible and default, even with `includeHidden: true`; restore returned the exact original config and the same full list. Native gateway mode correctly required sign-in before `model/list`, so catalog parsing/list behavior was verified using an offline test-provider override. This is not a signed-in desktop UI or existing-chat selection check. No inference, browser login, deployment, or real credential/config change was performed. A real local catalog and TOML preview were generated; the next normal install/restore cycle uses the new behavior.

## Live qualification still to perform

Auth0 resources, test users, the Railway services, native login, and authenticated desktop routing are already present. Remaining checks:

1. Deploy the gateway user-length fix and verify readiness.
2. Select `gpt-6.1-sol` in a new desktop chat; verify a completed reply, SSE, tool calls, and follow-up turns.
3. Wait for expiry and verify automatic refresh in Codex, with stable user attribution.
4. Restart Codex and verify reuse or recovery of the saved gateway grant.
5. Confirm two users' usage/spend in Postgres. The optional smoke script can exercise both accounts independently.
6. Verify revocation/expired-grant behavior against Auth0 and the deployed gateway.
7. Restore normal ChatGPT-provider configuration, destroy the Railway lab, recreate it, and repeat the native login test.

Only completing those checks establishes end-to-end desktop compatibility. The separately implemented browser smoke command does not substitute for the desktop test.
