A runnable local lab demonstrates how a performance agent can detect, diagnose, and fix real production slowdowns using [Codex](https://codex.storage/) to autonomously investigate and patch application code. When a synthetic storefront's p95 latency breaches a threshold for a sustained period, Codex analyzes telemetry through [Chrome DevTools MCP](https://modelcontextprotocol.io/introduction) and a read-only observability MCP, then edits an isolated git worktree—all while a deterministic controller independently validates correctness and performance improvements before optionally creating a GitHub PR. Everything runs locally on Apple Silicon Macs using [OrbStack](https://orbstack.dev/) for containers, with no cloud dependencies except optional Codex inference and GitHub operations.

**Key features:**
- Real monitoring breach triggers autonomous investigation (Prometheus/Grafana/Tempo stack)
- Sandboxed Codex turns with browser + telemetry tools, constrained write access
- Independent A/B benchmarks validate both correctness and 30%+ p95 improvement
- Recovery confirmed only after fresh deployed measurements cross threshold
- One-command demo with configurable thresholds, windows, and optional GitHub publishing