# Presenter script

1. **Establish trust.** Run `npm run demo`. Open the storefront and Grafana. Start Traffic. Point out the 30-second window, actual sample count and freshness. Wait for healthy data rather than promising a latency number.
2. **Introduce the incident.** Click Deploy Regression. Explain that this deploys another git revision of application code. The database fixture, load and telemetry remain equivalent. Watch p95 climb, then wait for the sustained-breach gate.
3. **Follow the investigation.** Switch to Investigation. Show actual app-server events, browser tools and the telemetry desk. Open a trace waterfall and correlated logs. The activity stream shows tool work and public findings, not hidden reasoning. Model runtime varies; use the evidence desk while it works.
4. **Review the evidence.** Switch to Fix & Verification. Show diagnosis and application diff. Compare the affected baseline and separate candidate. Explain warm-up, alternating rounds, sample/error gates, and that these are client benchmark numbers rather than deployed server p95. Show the draft PR, or the explicit publishing-unconfigured state and local PR body.
5. **Close the loop.** Deploy Candidate Locally. Return to Overview and wait for fresh samples and sustained recovery. Local improvement becomes local recovery only here. Stop traffic; Reset Demo preserves evidence/edits while preparing another run. Ctrl+C stops owned processes and containers.

If Blocked appears, narrate the exact reason. Do not call a completed model turn a successful fix. Retry keeps the same incident/thread and respects budgets; reset is an explicit new run. See `docs/VERIFICATION.md` for measured rehearsal results and any untested paths.
