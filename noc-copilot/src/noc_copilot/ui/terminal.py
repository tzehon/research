"""Rich-based terminal demo runner for NOC Copilot.

Streams the agent through LangGraph and renders, in order:
1. The static graph as an ASCII tree (so the audience sees the loops).
2. Per-phase tool timelines (which tools the LLM picked, latency, summary).
3. Loop markers when control jumps back to retrieval.
4. The final state — diagnosis, action, evidence chain.

The agent is genuinely live; the rendering just makes its decisions
legible.
"""

from __future__ import annotations

import time

from motor.motor_asyncio import AsyncIOMotorDatabase
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.tree import Tree

from noc_copilot.agent.graph import build_noc_agent
from noc_copilot.agent.state import initial_state
from noc_copilot.db.collections import ALARMS
from noc_copilot.embeddings.voyage import VoyageEmbedder

console = Console()

SEVERITY_COLORS = {
    "critical": "bold red",
    "major": "bold yellow",
    "minor": "yellow",
    "warning": "bold blue",
}

SEVERITY_EMOJI = {
    "critical": "🔴",
    "major": "🟠",
    "minor": "🟡",
    "warning": "🔵",
}

PHASE_COLORS = {
    "triage": "cyan",
    "retrieval": "magenta",
    "diagnosis": "yellow",
    "remediation": "green",
    "router": "white",
}


# ---------------------------------------------------------------------------
# Static rendering
# ---------------------------------------------------------------------------


def display_graph_tree() -> None:
    """ASCII tree of the agent graph, including the loops.

    This is the headline visual — it shows the agentic shape (per-phase
    ReAct loops + cross-phase conditional edges) before any alarm runs.
    """
    tree = Tree("[bold cyan]NOC Agent Graph[/bold cyan] — phase nodes are themselves ReAct loops")

    triage = tree.add("[cyan]triage[/cyan] (ReAct)")
    triage.add("[dim]tools: lookup_network_element, check_recent_maintenance,[/dim]")
    triage.add("[dim]       find_correlated_alarms, check_topology_neighbors,[/dim]")
    triage.add("[dim]       query_kpi_history, check_recent_config_changes[/dim]")

    retrieval = tree.add("[magenta]retrieval[/magenta] (ReAct, search→evaluate→refine)")
    retrieval.add("[dim]tools: search_similar_incidents, search_runbooks,[/dim]")
    retrieval.add("[dim]       evaluate_retrieval_quality (closes the loop)[/dim]")

    diagnosis = tree.add("[yellow]diagnosis[/yellow] (ReAct)")
    diagnosis.add("[dim]tools: propose_diagnosis | request_more_evidence[/dim]")
    diagnosis.add("[bold yellow]↺ if confidence < 0.7 and retries < 2 → retrieval[/bold yellow]")

    remediation = tree.add("[green]remediation[/green] (ReAct, check→act→verify)")
    remediation.add("[dim]tools: estimate_blast_radius, check_maintenance_window,[/dim]")
    remediation.add("[dim]       verify_backup_exists, execute_remediation_step,[/dim]")
    remediation.add("[dim]       verify_alarm_cleared, recommend_for_approval, escalate[/dim]")
    remediation.add("[bold yellow]↺ if verification failed and retries < 1 → retrieval[/bold yellow]")

    end = tree.add("[bold]END[/bold] — final_status ∈ {auto_remediated, human_approval_required, escalated}")
    end.add("[dim]Diagnosis + evidence chain persisted to MongoDB[/dim]")

    console.print(tree)
    console.print()


def display_alarm_dashboard(alarms: list[dict]) -> None:
    table = Table(
        title="🛰️  NOC Copilot — Active Alarm Dashboard",
        box=box.DOUBLE_EDGE,
        title_style="bold cyan",
        border_style="cyan",
        show_lines=True,
    )
    table.add_column("#", style="dim", width=3)
    table.add_column("Alarm ID", width=14)
    table.add_column("Severity", width=10)
    table.add_column("Category", width=10)
    table.add_column("Source", width=14)
    table.add_column("Region", width=10)
    table.add_column("Description", width=60)

    for i, alarm in enumerate(alarms, 1):
        sev = alarm.get("severity", "warning")
        color = SEVERITY_COLORS.get(sev, "white")
        emoji = SEVERITY_EMOJI.get(sev, "⚪")
        desc = (alarm.get("description") or "")[:80]
        table.add_row(
            str(i),
            alarm.get("alarm_id", ""),
            Text(f"{emoji} {sev.upper()}", style=color),
            alarm.get("category", ""),
            alarm.get("source", ""),
            alarm.get("region", ""),
            desc + ("…" if len(alarm.get("description", "")) > 80 else ""),
        )

    console.print()
    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Per-phase rendering of the captured trace
# ---------------------------------------------------------------------------


def display_tool_timeline(tool_calls: list[dict], phase: str, iteration: int = 1) -> None:
    """Render tool calls for a single phase iteration."""
    phase_calls = [tc for tc in tool_calls if tc.get("phase") == phase and tc.get("iteration", 1) == iteration]
    if not phase_calls:
        return

    color = PHASE_COLORS.get(phase, "white")
    title = f"[bold {color}]{phase.upper()}[/bold {color}]"
    if iteration > 1:
        title += f" [dim](iteration {iteration})[/dim]"

    table = Table(
        title=title,
        box=box.SIMPLE,
        border_style=color,
        show_header=True,
        header_style=f"bold {color}",
        show_lines=False,
    )
    table.add_column("#", width=3)
    table.add_column("Tool", style=f"bold {color}", width=30)
    table.add_column("Args", overflow="fold", width=40)
    table.add_column("Result", overflow="fold")
    table.add_column("ms", justify="right", width=6)

    for i, tc in enumerate(phase_calls, 1):
        args = tc.get("args", {})
        args_str = ", ".join(f"{k}={v!r}" for k, v in args.items())
        if len(args_str) > 60:
            args_str = args_str[:57] + "…"
        summary = (tc.get("result_summary") or "")
        # Strip multi-line result summaries to first 2 lines for table fit
        summary_lines = summary.splitlines()
        if len(summary_lines) > 2:
            summary = "\n".join(summary_lines[:2]) + " …"
        table.add_row(
            str(i),
            tc.get("tool", ""),
            args_str,
            summary,
            str(tc.get("latency_ms", 0)),
        )

    console.print(table)


def display_loop_marker(detail: str) -> None:
    """Print a divider when control loops back to a prior phase."""
    console.print()
    console.print(Panel(
        Text(f"↺  LOOP-BACK  ↺   {detail}", style="bold yellow", justify="center"),
        border_style="yellow",
        padding=(0, 2),
    ))
    console.print()


def display_phase_log(state: dict) -> None:
    """Replay the phase log in order, with tool tables interleaved."""
    log = state.get("phase_log", []) or []
    tool_calls = state.get("tool_calls", []) or []

    # Group log events by phase + iteration
    rendered_keys: set[tuple[str, int]] = set()

    for event in log:
        phase = event.get("phase", "")
        iteration = event.get("iteration", 1)
        ev = event.get("event", "")
        key = (phase, iteration)

        if ev == "completed":
            if key not in rendered_keys:
                display_tool_timeline(tool_calls, phase, iteration)
                rendered_keys.add(key)
        elif ev == "looped_back":
            display_loop_marker(event.get("detail", ""))
        elif ev == "escalated":
            console.print()
            console.print(Panel(
                f"[bold red]ESCALATED BY ROUTER[/bold red]: {event.get('detail', '')}",
                border_style="red",
            ))
            console.print()


# ---------------------------------------------------------------------------
# Live streaming progress
# ---------------------------------------------------------------------------


PHASE_EMOJI = {
    "triage": "🔍",
    "retrieval": "📚",
    "diagnosis": "🧠",
    "remediation": "🛠️",
}


def _phase_from_namespace(namespace: tuple) -> str | None:
    """Extract the outer phase name from a LangGraph subgraph namespace.

    `namespace` looks like ('triage:abc123', 'tools:def456'); the outer
    node name is the prefix before the first ':' of the first element.
    """
    if not namespace:
        return None
    head = namespace[0]
    if ":" in head:
        head = head.split(":", 1)[0]
    if head in PHASE_EMOJI:
        return head
    return None


def _format_args(args: dict) -> str:
    parts = []
    for k, v in (args or {}).items():
        s = repr(v)
        if len(s) > 40:
            s = s[:37] + "…"
        parts.append(f"{k}={s}")
    out = ", ".join(parts)
    return out if len(out) <= 80 else out[:77] + "…"


def _print_tool_call_live(tc: dict, color: str) -> None:
    name = tc.get("tool", "")
    args = _format_args(tc.get("args", {}))
    summary = (tc.get("result_summary") or "").splitlines()
    first_line = summary[0] if summary else ""
    if len(first_line) > 100:
        first_line = first_line[:97] + "…"
    latency = tc.get("latency_ms", 0)
    console.print(
        f"  [bold {color}]✓[/bold {color}] [bold]{name}[/bold]"
        f"[dim]({args})[/dim] "
        f"[dim]→[/dim] {first_line} "
        f"[dim]({latency}ms)[/dim]"
    )


def _print_phase_header(phase: str, iteration: int) -> None:
    color = PHASE_COLORS.get(phase, "white")
    emoji = PHASE_EMOJI.get(phase, "•")
    suffix = f" [dim](iteration {iteration})[/dim]" if iteration > 1 else ""
    console.print()
    console.print(
        f"[bold {color}]{emoji} {phase.upper()}[/bold {color}]{suffix} [dim]…[/dim]"
    )


async def stream_agent(agent, state: dict, config: dict) -> dict:
    """Run the agent via astream and emit live progress as tools fire.

    We subscribe to subgraph updates so individual tool calls inside each
    phase's ReAct loop are visible in real time, instead of the user
    staring at a single spinner for the entire run. The full final state
    is rebuilt by accumulating updates so we can return it at the end.
    """
    current_phase: tuple[str, int] | None = None
    final_state: dict = dict(state)

    async for namespace, update in agent.astream(
        state, config, stream_mode="updates", subgraphs=True
    ):
        if not isinstance(update, dict):
            continue

        for node_name, node_update in update.items():
            if not isinstance(node_update, dict):
                continue

            phase = _phase_from_namespace(namespace)

            # Render tool calls only from subgraph updates (mid-phase tool
            # firings). The outer phase node returns the same tool_calls
            # list when it completes — printing both would duplicate every
            # row.
            new_tool_calls = node_update.get("tool_calls") or []
            if phase and new_tool_calls:
                # Use the iteration recorded on the tool call itself so
                # loop-backs render under the right header.
                iteration = new_tool_calls[0].get("iteration", 1)
                key = (phase, iteration)
                if key != current_phase:
                    _print_phase_header(phase, iteration)
                    current_phase = key
                color = PHASE_COLORS.get(phase, "white")
                for tc in new_tool_calls:
                    _print_tool_call_live(tc, color)

            for event in node_update.get("phase_log") or []:
                ev = event.get("event")
                if ev == "looped_back":
                    display_loop_marker(event.get("detail", ""))
                    current_phase = None
                elif ev == "escalated":
                    console.print()
                    console.print(Panel(
                        f"[bold red]ESCALATED BY ROUTER[/bold red]: "
                        f"{event.get('detail', '')}",
                        border_style="red",
                    ))
                    current_phase = None

            # Outer-graph updates (no namespace) carry the canonical
            # state deltas — fold them into our accumulating snapshot so
            # we can render the final cards.
            if not namespace:
                for key, value in node_update.items():
                    if key in {"tool_calls", "phase_log", "evidence_chain", "messages"}:
                        existing = final_state.get(key) or []
                        final_state[key] = list(existing) + list(value or [])
                    elif key == "kpi_history":
                        merged = dict(final_state.get(key) or {})
                        merged.update(value or {})
                        final_state[key] = merged
                    else:
                        final_state[key] = value

    return final_state


# ---------------------------------------------------------------------------
# Final-state rendering
# ---------------------------------------------------------------------------


def display_diagnosis(state: dict) -> None:
    diagnosis = state.get("diagnosis") or {}
    confidence = state.get("confidence", 0.0) or 0.0
    if not diagnosis:
        return

    bar_len = 30
    filled = int(confidence * bar_len)
    color = "green" if confidence >= 0.9 else ("yellow" if confidence >= 0.7 else "red")
    bar = f"[{color}]{'█' * filled}[/{color}]{'░' * (bar_len - filled)}"

    console.print(Panel(
        f"[bold]Probable Root Cause:[/bold] {diagnosis.get('probable_root_cause', '?')}\n\n"
        f"Confidence: {bar} {confidence:.1%}\n\n"
        f"[bold]Reasoning:[/bold]\n{diagnosis.get('reasoning', '')}",
        title="[bold yellow]Diagnosis[/bold yellow]",
        border_style="yellow",
    ))

    evidence = diagnosis.get("supporting_evidence") or []
    if evidence:
        console.print("\n[bold]Supporting Evidence:[/bold]")
        for e in evidence:
            console.print(f"  ✓ {e}")

    diffs = diagnosis.get("differential_diagnoses") or []
    if diffs:
        console.print("\n[bold]Differential Diagnoses:[/bold]")
        for d in diffs:
            console.print(
                f"  • {d.get('cause', '')} "
                f"(confidence: {(d.get('confidence', 0) or 0):.0%}) — "
                f"{d.get('why_less_likely', '')}"
            )
    console.print()


def display_remediation_outcome(state: dict) -> None:
    final_status = state.get("final_status")
    action = state.get("recommended_action", "No action determined.")

    radius = state.get("blast_radius") or {}
    preconditions: list[str] = []
    if radius.get("risk"):
        preconditions.append(
            f"blast_radius: {radius.get('risk')} "
            f"({radius.get('co_located_active_elements', 0)} co-located, "
            f"high_traffic={radius.get('is_high_traffic')})"
        )
    if state.get("maintenance_window_ok") is not None:
        preconditions.append(f"maintenance_window_ok: {state.get('maintenance_window_ok')}")
    if state.get("backup_verified") is not None:
        preconditions.append(f"backup_verified: {state.get('backup_verified')}")

    pre_block = "\n".join(f"  • {p}" for p in preconditions)

    if final_status == "auto_remediated":
        verification = state.get("verification_result") or {}
        cleared = verification.get("cleared")
        body = (
            f"[bold green]AUTO-REMEDIATED[/bold green]\n\n"
            f"[bold]Action:[/bold] {action}\n\n"
            f"[bold]Preconditions:[/bold]\n{pre_block}\n\n"
            f"[bold]Verification:[/bold] alarm cleared = {cleared}"
        )
        title = "✅ Auto-Remediated"
        border = "green"
    elif final_status == "human_approval_required":
        body = (
            f"[bold yellow]RECOMMENDED ACTION (human approval required)[/bold yellow]\n\n"
            f"[bold]Action:[/bold] {action}\n\n"
            f"[bold]Preconditions:[/bold]\n{pre_block}"
        )
        title = "⚠️  Approval Required"
        border = "yellow"
    elif final_status == "escalated":
        body = (
            f"[bold red]ESCALATED[/bold red]\n\n{action}\n\n"
            f"[bold]Preconditions checked:[/bold]\n{pre_block or '  (n/a)'}"
        )
        title = "🚨 Escalation"
        border = "red"
    elif final_status == "verification_failed":
        body = (
            f"[bold red]VERIFICATION FAILED[/bold red]\n\nAction was attempted but the alarm did not clear.\n"
            f"{action}"
        )
        title = "❌ Verification Failed"
        border = "red"
    else:
        body = f"[bold]{final_status}[/bold]\n\n{action}"
        title = "Outcome"
        border = "white"

    console.print(Panel(body, title=title, border_style=border))
    console.print()


def display_evidence_chain(state: dict) -> None:
    chain = state.get("evidence_chain") or []
    if not chain:
        return
    console.print("[bold]Evidence Chain (audit):[/bold]")
    for i, e in enumerate(chain, 1):
        console.print(f"  {i}. {e}")
    console.print()


# ---------------------------------------------------------------------------
# Main run loop
# ---------------------------------------------------------------------------


async def process_alarm(
    alarm: dict,
    db: AsyncIOMotorDatabase,
    embedder: VoyageEmbedder,
) -> dict:
    sev = alarm.get("severity", "")
    console.print(Panel(
        f"[{SEVERITY_COLORS.get(sev, 'white')}]Processing Alarm: {alarm.get('alarm_id', '')}[/]\n"
        f"{alarm.get('description', '')}",
        title=f"{SEVERITY_EMOJI.get(sev, '')} Alarm Details",
        border_style=SEVERITY_COLORS.get(sev, "white"),
    ))
    console.print()

    agent = build_noc_agent(db, embedder)
    state = initial_state(alarm)

    total_start = time.time()
    # Stream tool calls live instead of sitting on a single spinner for
    # the whole run — see stream_agent for the rendering.
    final_state = await stream_agent(agent, state, {"recursion_limit": 80})
    elapsed = time.time() - total_start

    console.print()
    display_diagnosis(final_state)
    display_remediation_outcome(final_state)
    display_evidence_chain(final_state)

    n_tool_calls = len(final_state.get("tool_calls", []) or [])
    n_phases = len(final_state.get("phase_log", []) or [])
    console.print(Panel(
        f"[bold]Wall time: [cyan]{elapsed:.1f}s[/cyan][/bold]\n"
        f"Tool calls: {n_tool_calls}   Phase events: {n_phases}\n"
        f"[dim]Manual NOC process: ~45 min TTD + ~30 min TTR ≈ ~75 min[/dim]",
        title="⏱️  Performance",
        border_style="green",
    ))
    return final_state


async def run_demo(
    db: AsyncIOMotorDatabase,
    embedder: VoyageEmbedder,
) -> None:
    """Top-level demo loop. Lists active alarms and processes the chosen one."""
    console.print(Panel(
        "[bold cyan]NOC Copilot[/bold cyan] — Agentic Workflow for Network Incident Resolution\n"
        "[dim]MongoDB × Voyage AI × Anthropic × LangGraph[/dim]",
        border_style="cyan",
        padding=(1, 2),
    ))
    console.print()

    display_graph_tree()

    cursor = db[ALARMS].find({"status": "active"}, {"embedding": 0}).sort("severity", 1)
    alarms = await cursor.to_list(length=20)

    if not alarms:
        console.print("[red]No active alarms found. Run load_data.py first.[/red]")
        return

    severity_order = {"critical": 0, "major": 1, "minor": 2, "warning": 3}
    alarms.sort(key=lambda a: (severity_order.get(a.get("severity", "warning"), 4), a.get("alarm_id", "")))

    display_alarm_dashboard(alarms)

    console.print("[bold]Select an alarm to process (enter number), 'all' to process all, or 'q' to quit:[/bold]")

    while True:
        try:
            choice = console.input("[cyan]> [/cyan]").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break

        if choice == "q":
            break
        elif choice == "all":
            for alarm in alarms:
                await process_alarm(alarm, db, embedder)
                console.print("─" * 80)
            break
        else:
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(alarms):
                    await process_alarm(alarms[idx], db, embedder)
                else:
                    console.print("[red]Invalid selection.[/red]")
            except ValueError:
                console.print("[red]Enter a number, 'all', or 'q'.[/red]")

    console.print("\n[bold cyan]Demo complete. Thank you![/bold cyan]")


__all__ = ["run_demo", "process_alarm", "display_graph_tree", "display_alarm_dashboard"]
