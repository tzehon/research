# Validation record

Initial preparation on 2026-11-03 created no Railway/Auth0 resources, read or stored no real API key, and left the active Codex TOML unchanged. Subsequent checks against the user-created Auth0 setup and empty Railway project are noted below; no deployment has been applied by the assistant.

## Local checks

- TypeScript type-check of gateway, Railway definitions, scripts, and tests.
- 17 passing unit/config/IaC tests: RS256 token validation; invalid signature/issuer/audience/client/scope/expiry; user identity stability across refresh; distinct users; credential/metadata stripping; model/route/request-size restrictions; incremental SSE; upstream status preservation.
- Authorization transport regression: accept a valid signed token in `Authorization`, reject missing/malformed/legacy-only credentials and actual repeated Authorization fields before key provisioning, and replace the client token with the server-only per-user key on the LiteLLM hop.
- Codex config test: render native `gateway_oauth` with omitted `delivery` (default Authorization), preserve unrelated settings, install into a temporary home, reject restoration after intervening edits, and restore the original bytes.
- Railway definition test: evaluate the SDK resource definitions with fake secrets, one database volume, and provider key present only in LiteLLM. This is not a live Railway plan.
- Volume sizing: 500 MB for fresh and pre-existing local configs, explicit larger-size override, and rejection of invalid sizes. The user-run apply failed on the old 1,024 MB volume; a read-only history query returned `Max size of 500 MB on current plan. Please select a valid size or upgrade`. No database volume or running service instance was present after that failure. The corrected apply has not yet been run by the assistant.
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

## Live qualification still to perform

After the account setup/deployment steps:

1. Apply Auth0 resources and create test users.
2. Run a Railway plan/apply and verify health and private services.
3. Use the installed desktop app's native gateway sign-in prompt and Auth0 browser callback.
4. Check actual OpenAI model availability, completed SSE, tool calls, and replayed follow-up turns.
5. Wait for expiry and verify automatic refresh in Codex, with stable user attribution.
6. Confirm two users' usage/spend in Postgres. The optional smoke script can exercise both accounts independently.
7. Verify revocation/expired-grant behavior against Auth0 and the deployed gateway.
8. Restore normal ChatGPT-provider configuration, destroy the Railway lab, recreate it, and repeat the native login test.

Only completing those checks establishes end-to-end desktop compatibility. The separately implemented browser smoke command does not substitute for the desktop test.
