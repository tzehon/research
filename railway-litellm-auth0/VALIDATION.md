# Validation record

Prepared on 2026-11-03. No Railway/Auth0 resources were created, no real API key was read or stored, and the active Codex TOML was not changed.

## Local checks

- TypeScript type-check of gateway, Railway definitions, scripts, and tests.
- 15 passing unit/config/IaC tests: RS256 token validation; invalid signature/issuer/audience/client/scope/expiry; user identity stability across refresh; distinct users; credential/metadata stripping; model/route/request-size restrictions; incremental SSE; upstream status preservation.
- Codex config test: render native `gateway_oauth`, preserve unrelated settings, install into a temporary home, reject restoration after intervening edits, and restore the original bytes.
- Railway definition test: evaluate the SDK resource definitions with fake secrets, one database volume, and provider key present only in LiteLLM. This is not a live Railway plan.
- Auth0 provider `1.60.0`: initialization, formatting, and `terraform validate`.
- Gateway deployment Docker image built successfully using Node `22.22.2-bookworm-slim` and production dependencies.
- LiteLLM deployment image built from `ghcr.io/berriai/litellm:v1.106.6` and started with its actual database migration entrypoint.
- Real local LiteLLM + PostgreSQL test: concurrent first login, separate identities/keys, persisted user budgets/rate limits, repeat lookup after restart, rejection after seed changes, and no key re-creation after revocation. Test containers/volumes were removed.
- Clean `npm ci` completed on Node `26.13.0` / npm `11.20.0`, including Railway's postinstall binary download; `npm run railway -- --version` reported `5.71.0`, and `config plan --help` worked. This was verified after removing the incompatible `tar` 7 override that broke fresh installs. The earlier zero-audit result with that override did not establish installer compatibility.
- `npm audit --omit=dev` reported zero vulnerabilities. The full development dependency audit reports one high and one critical finding through the pinned Railway npm installer's `tar` 6 dependency; these upstream findings remain unresolved and are excluded from the gateway image by `npm ci --omit=dev`.

The container test caught and fixed an IPv6-only LiteLLM listener that passed an internal health check but was not reachable through IPv4. New Railway environments have internal IPv4, and the corrected listener is tested on IPv4.

## Installed Codex recognition check

App version: `26.1027.61615`; bundled CLI: `0.166.0-alpha.5.1` (the standalone Homebrew CLI was `0.163.0`). A read-only app-server probe used temporary command-line overrides and fake public endpoint/client settings, not a modified TOML. Its `account/gatewayOAuth/read` response was:

```json
{
  "providerId": "railway-lab-probe",
  "providerName": "Railway lab validation",
  "required": true,
  "status": "notReady",
  "error": null
}
```

This verifies that the installed app's backend recognizes the documented native OAuth configuration. It does not verify a completed Auth0 grant or the desktop UI interaction.

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
