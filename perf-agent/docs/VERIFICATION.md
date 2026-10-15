# Verification record

Verified on 2026-10-12 on an Apple Silicon Mac, OrbStack, Node 26.11.1, Codex CLI 0.155.1, Chrome DevTools MCP 1.10.1, and the digest-pinned Compose images. This records an actual run, not expected or simulated results. Latency and model behavior will vary between runs.

## Genuine end-to-end run

The explicit `npm run test:e2e` rehearsal passed using real HTTP traffic, the local PostgreSQL fixture, Prometheus histograms, Loki logs, Tempo traces, and actual Codex app-server turns. No GitHub target was configured.

| Observation                                              | Result                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| Initial healthy server p95                               | 29.6 ms                                                      |
| Sustained-breach server p95 at incident creation         | 499.8 ms, above 180 ms                                       |
| Incidents / Codex threads for this run                   | Exactly one / one                                            |
| Independent affected-baseline client p95                 | 490.7 ms                                                     |
| Independent candidate client p95                         | 45.3 ms                                                      |
| Aggregate client p95 improvement                         | 90.8%                                                        |
| Measured requests per version                            | 480 across three rounds                                      |
| Benchmark errors / missed load slots                     | Zero / zero for both versions                                |
| Correctness                                              | Six independently checked search cases per version passed    |
| Fresh deployed-app server p95 after candidate deployment | 29.6 ms, sustained below the recovery band                   |
| Publishing                                               | Unconfigured; real local branch and PR body ready, no PR URL |

Benchmark methodology: alternating baseline/candidate runs, 8 requests/second, 8 seconds warm-up before each 20-second measurement, three rounds per version, identical read-only fixture and runtime settings. Background monitored-app traffic remained running. Client histograms were aggregated before calculating p95. Candidate/baseline ratios by round were 0.088, 0.079 and 0.128. These measurements establish local improvement and subsequent local deployment recovery, not production recovery.

The foreground traffic generator recorded 18 failed requests across the two local deployment interruptions; these are visible separately from server 5xx and are not included in the separate candidate benchmark. Deployments intentionally replace the local process and are not zero-downtime rollouts.

Incident `71383141-ba64-4ee8-8643-3d3f5abc81f3` used thread `01a12dc0-45e4-7892-8789-4b70a0a2ad01`. The affected application revision was `b43990e64a28b3998db73e56512c8b79836a89a7`; Codex's actual application patch was committed as `c7d5b93465537e8c8ead2d3cd2dc6a4287880d1f` on `codex/perf-71383141`. The patch changed only `src/search.mjs`, replacing sequential inventory requests with a parameterized batch query.

Successful app-server events include all four telemetry MCP tools (`metrics_query`, `logs_query`, `traces_search`, `trace_get`) and Chrome visits to the storefront and provisioned Grafana dashboard, search-field interaction, network inspection, screenshot capture and performance-trace start/stop. The recorded distributed trace showed one product query followed by 24 sequential inventory queries. Browser captures and the performance trace were saved to the incident evidence directory. Public events streamed into the Investigation tab; reasoning items were filtered out.

The agent resumed the same thread between investigation and fixing. Its reported cumulative usage was 487,680 tokens, including cached input, within the configured 500,000-token soft limit. This is not a billing estimate or a promise of future usage. Earlier rehearsal failures exposed missing MCP approval metadata, an insufficient initial budget, and an incompatible log-exporter constructor; these were corrected before the passing run. The failed-run evidence was retained.

## Lifecycle and automated checks

- `npm test`: 17 tests passed, covering aggregate histogram quantiles, strict threshold/sustained breaches, stale or insufficient data, polling gaps, recovery hysteresis/cooldown, deployment boundaries, persistent incident deduplication, phase transitions, validation gates, real read-only MCP metadata, evidence requirements, PR wording, and stdio protocol/error/approval dispatch/reasoning filtering.
- `npm run check`: TypeScript controller and application JavaScript checks passed; Svelte reported zero errors and warnings.
- `npm run build`: production dashboard build passed.
- `npm run test:protocol`: actual installed app-server initialization, authentication and model-list requests passed without a model turn.
- Restart preserved the completed incident, thread ID and evidence without another investigation. Traffic did not silently restart.
- Online reset restored a deliberately modified inventory row, cleared active incident state and traffic counters, and preserved an untracked worktree edit and all result files.
- Offline reset removed only the project's Compose volumes. A subsequent fresh-volume launch seeded 48 products and 48 inventory rows, passed all six correctness cases, and produced fresh healthy p95 telemetry (29.0 ms at the first sufficiently sampled check).
- Explicit stop and SIGINT (Ctrl+C) cleanup were exercised. Owned Node processes and Compose services stopped, and evidence remained available.
- The final browser-evidence gate was also run against the recorded successful real tool events, including a URL without a trailing slash. UI final diagnosis rendering, immediate screenshot links, and reset refinements received subsequent type/build/lifecycle checks; another model investigation was not run solely for those refinements.

Ignored local evidence: `.local/results/e2e.json`, `.local/results/lifecycle.json`, `.local/results/tool-evidence.json`, archived SQLite state, and `.local/results/71383141-ba64-4ee8-8643-3d3f5abc81f3/{PR.md,benchmark.json,search.png,grafana.png,search-trace.json.gz}`. Reset preserves these files and the application worktrees. The framework's versioned files contain no credentials or raw private evidence.

## Not verified

GitHub branch push and draft-PR creation were not exercised because no application target remote was configured. The publisher, remote-base/revision checks, draft creation and idempotent lookup are implemented; use the explicit README setup with your chosen repository to exercise them. No repository, remote branch or PR was created for this verification. Abrupt host failure and multi-controller operation are not supported recovery modes; clean restart and same-thread phase reconnection were tested.
