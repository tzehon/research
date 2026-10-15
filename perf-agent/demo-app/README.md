# Forma storefront

Local, deterministic product catalog backed by PostgreSQL. `src/search.mjs` owns search and inventory retrieval. `server.mjs` owns HTTP, telemetry, and the UI. Start with `npm ci && npm start`; environment: DATABASE_URL, PORT, SERVICE_NAME, REVISION, DEPLOYMENT_ID, OTEL_EXPORTER_OTLP_ENDPOINT. See the separate perf-agent controller for the local database fixture and runtime orchestration.
