# Protocol and dependency sources

Checked 2026-10-12 against official documentation and the installed tools.

- [OpenAI Codex app-server](https://developers.openai.com/codex/app-server): stdio JSONL, initialization, thread/turn lifecycle, structured output, approval requests and streaming events. **Installed Codex 0.155.1 schema is the compatibility authority**; newer web documentation can describe newer features. `docs/protocol/` contains selected generated schemas. Generated TypeScript was also inspected during implementation.
- [Grafana Docker OpenTelemetry LGTM](https://grafana.com/docs/opentelemetry/docker-lgtm/): local demo/testing stack, OTLP and persistence. [Upstream collector configuration](https://github.com/grafana/docker-otel-lgtm/blob/main/docker/otelcol-config.yaml) and [Prometheus OTLP configuration](https://github.com/grafana/docker-otel-lgtm/blob/main/docker/prometheus.yaml) establish local service endpoints. The pinned 0.36.0 stack is customized with a versioned Prometheus scrape receiver and data sources.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), [configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md), [advanced usage](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md). Installed 1.10.1 `--help` was checked for profile isolation, workspace roots, local URL allowlists and telemetry opt-outs.
- [Prometheus histogram guidance](https://prometheus.io/docs/practices/histograms/) and [histogram_quantile](https://prometheus.io/docs/prometheus/latest/querying/functions/#histogram_quantile): aggregate buckets before quantiles.

Pinned containers: `grafana/otel-lgtm:0.36.0`, `postgres:17.6-alpine` (multi-architecture tags, native arm64 selected). Exact npm dependencies and transitive integrity hashes are in `package-lock.json`; the app has its own lockfile. Major runtime packages: Svelte 5.57.2, Vite 8.3.4, TypeScript 5.9.3, OTel Node SDK 0.223.0 / resources 2.9.0, pg 8.23.1, prom-client 15.1.3, MCP SDK 1.32.1, Chrome DevTools MCP 1.10.1. prom-client 15.1.3 is deprecated upstream in favor of a newer package; it is deliberately pinned here for classic histogram compatibility, and does not make any external calls.

No direct model API calls are used. Authentication is the user's existing Codex login. Runtime browser/telemetry evidence is local, but evidence sent into Codex inference leaves the machine for OpenAI processing.

Verified pulled arm64 images on OrbStack; Compose also pins these immutable manifest digests:

- LGTM: `sha256:57c04cbd8e7022f32bb84c4ac005d79baf8b08e2c5be44facf11f5f1f9944ba2`
- PostgreSQL: `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`

[MCP approval configuration](https://developers.openai.com/codex/mcp/): the explicit local Chrome tool allowlist is pre-authorized for this demo; unlisted tools are disabled. Telemetry tools advertise read-only, non-destructive, closed-world annotations. This does not grant shell escalation or browser access to the controller.
