# CLAUDE.md — atlas-custom-role-test

## Overview

Test harness that verifies a collection-scoped read-only custom DB role on MongoDB Atlas. Uses only Atlas CLI and mongosh (no REST/curl).

## Run Commands

```bash
# Individual steps
./run.sh step1      # Seed test data via mongosh
./run.sh step2      # Create custom DB role via Atlas CLI
./run.sh step3      # Create DB user via Atlas CLI
./run.sh step4      # Verify permissions via mongosh

# All steps
./run.sh all

# Cleanup
./run.sh cleanup
```

## Architecture

- `run.sh` — Bash orchestrator. Sources `.env`, validates env vars, dispatches to step functions.
- `scripts/verify_as_test_user.mongo.js` — mongosh script run as the restricted user in step4.
- `.env` / `.env.sample` — Environment configuration.

## Key Environment Variables

- `MONGODB_URI_ADMIN` (required) — Admin connection string for mongosh.
- `ATLAS_PROJECT_ID` (required) — Atlas project ID for CLI commands.
- `ATLAS_PROFILE` (optional) — Named Atlas CLI profile.

## Dependencies

- Atlas CLI (authenticated, Organization Owner / Project Owner / Project Database Access Admin)
- mongosh
- Python 3 (standard library only — used for URI rewriting)
