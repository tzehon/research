# Presenter script

## Prepare a saved rehearsal

Before presenting, complete the steps below, ideally through measured recovery. Enter a descriptive rehearsal name and click **Save Run**. Expand **Saved runs** and open the saved run in a new tab. Its Overview, Investigation (including tool details), and Fix & Verification pages are a fixed snapshot, clearly labeled with the save time.

Keep that saved tab open. In the live tab, click **Reset Demo**, then begin the presentation. Show real-time activity in the live tab and switch to the saved tab whenever you want to show the completed diagnosis, tool calls, patch, and benchmark results. Reset and restart preserve saved runs and their evidence copies. The saved run URL can be bookmarked; after restarting the controller, use its launch link to authorize the browser again before opening the bookmark. Live logs/traces/Grafana are not replayed in a saved view; use the recorded tool responses and evidence files instead.

## Live walkthrough

1. **Establish trust.** Run `npm run demo`. Open the storefront and Grafana. Start Traffic. Point out the 30-second window, actual sample count and freshness. Wait for healthy data rather than promising a latency number.
2. **Introduce the incident.** Click Deploy Regression. Explain that this deploys another git revision of application code. The database fixture, load and telemetry remain equivalent. Watch p95 climb, then wait for the sustained-breach gate.
3. **Follow the investigation.** Switch to Investigation. Show actual app-server events, browser tools and the telemetry desk. Open a trace waterfall and correlated logs. The activity stream shows tool work and public findings, not hidden reasoning. Model runtime varies; use the evidence desk while it works.
4. **Review the evidence.** Switch to Fix & Verification. Show diagnosis and application diff. Compare the affected baseline and separate candidate. Explain warm-up, alternating rounds, sample/error gates, and that these are client benchmark numbers rather than deployed server p95. Show the draft PR, or the explicit publishing-unconfigured state and local PR body.
5. **Close the loop.** Deploy Candidate Locally. Return to Overview and wait for fresh samples and sustained recovery. Local improvement becomes local recovery only here. Stop traffic; Reset Demo preserves evidence/edits while preparing another run. Ctrl+C stops owned processes and containers.

If Blocked appears, narrate the exact reason. Do not call a completed model turn a successful fix. Retry keeps the same incident/thread and respects the time and attempt limits; reset is an explicit new run. See `docs/VERIFICATION.md` for measured rehearsal results and any untested paths.
