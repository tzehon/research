"""Rich-based terminal demo runner for NOC Copilot."""

import asyncio
import time
import logging

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich.text import Text
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.columns import Columns
from rich.markdown import Markdown
from rich.syntax import Syntax
from rich import box

from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.db.collections import ALARMS
from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.graph import build_noc_agent
from noc_copilot.embeddings.voyage import VoyageEmbedder

logger = logging.getLogger(__name__)
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


def display_alarm_dashboard(alarms: list[dict]) -> None:
    """Display the active alarm dashboard."""
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
        table.add_row(
            str(i),
            alarm.get("alarm_id", ""),
            Text(f"{emoji} {sev.upper()}", style=color),
            alarm.get("category", ""),
            alarm.get("source", ""),
            alarm.get("region", ""),
            alarm.get("description", "")[:80] + "...",
        )

    console.print()
    console.print(table)
    console.print()


def display_triage_results(state: dict) -> None:
    """Display triage/enrichment results."""
    console.print(Panel("[bold cyan]STEP 1: TRIAGE & ENRICHMENT[/bold cyan]", border_style="cyan"))

    alarm = state.get("alarm", {})
    source_id = alarm.get("source", "?")
    region = alarm.get("region", "?")
    element = state.get("network_element")
    site_id = element.get("site_id", "?") if element else "?"
    pseudo = (
        f'# 1. Look up network element\n'
        f'db.network_inventory.find_one({{ element_id: "{source_id}" }})\n'
        f'\n'
        f'# 2. Find correlated active alarms (same site or region)\n'
        f'db.alarms.find({{\n'
        f'  status: "active",\n'
        f'  $or: [{{ source: /.*{site_id}.*/ }}, {{ region: "{region}" }}]\n'
        f'}})'
    )
    console.print(Panel(Syntax(pseudo, "javascript", theme="monokai"), title="[dim]MongoDB Queries[/dim]", border_style="dim"))

    if element:
        table = Table(title="Network Element", box=box.SIMPLE, border_style="dim")
        table.add_column("Field", style="bold")
        table.add_column("Value")
        for key in ["element_id", "type", "vendor", "model", "site_name", "region", "status"]:
            if key in element:
                table.add_row(key, str(element[key]))
        console.print(table)
    else:
        console.print("[dim]No network element found for this alarm source.[/dim]")

    maintenance = state.get("recent_maintenance", [])
    if maintenance:
        console.print(f"\n[bold yellow]⚠ Recent Maintenance ({len(maintenance)} entries):[/bold yellow]")
        for m in maintenance:
            console.print(f"  • {m.get('date', 'N/A')}: {m.get('action', 'N/A')} (by {m.get('engineer', 'unknown')})")
    else:
        console.print("\n[dim]No recent maintenance activity.[/dim]")

    correlated = state.get("correlated_alarms", [])
    if correlated:
        console.print(f"\n[bold]Correlated Active Alarms ({len(correlated)}):[/bold]")
        for a in correlated[:5]:
            sev = a.get("severity", "")
            console.print(f"  • [{SEVERITY_COLORS.get(sev, 'white')}][{sev.upper()}][/] {a.get('description', '')[:80]}")
    else:
        console.print("\n[dim]No correlated alarms found.[/dim]")

    console.print()


def display_retrieval_results(state: dict) -> None:
    """Display search/retrieval results."""
    console.print(Panel("[bold cyan]STEP 2: KNOWLEDGE RETRIEVAL[/bold cyan]", border_style="cyan"))

    alarm = state.get("alarm", {})
    category = alarm.get("category", "?")
    desc_short = alarm.get("description", "")[:60]
    pseudo = (
        f'# 1. Generate query embedding\n'
        f'query_embedding = voyage.embed("{desc_short}...",\n'
        f'                              model="voyage-4-large", input_type="query")  // 1024 dims\n'
        f'\n'
        f'# 2. Hybrid search for similar incidents\n'
        f'db.incidents.aggregate([{{ $rankFusion: {{\n'
        f'  pipelines: {{\n'
        f'    vector: [{{ $vectorSearch: {{ queryVector: query_embedding,\n'
        f'                               filter: {{ category: "{category}" }}, limit: 5 }} }}],\n'
        f'    text:   [{{ $search: {{ compound: {{ must: [{{ text: {{ query: "...", path: [...] }} }}] }} }} }}]\n'
        f'  }},\n'
        f'  weights: {{ vector: 0.6, text: 0.4 }}\n'
        f'}} }}])\n'
        f'\n'
        f'# 3. Hybrid search for relevant runbooks (same pattern, domain="{category}")'
    )
    console.print(Panel(Syntax(pseudo, "javascript", theme="monokai"), title="[dim]Embedding + MongoDB Queries[/dim]", border_style="dim"))

    incidents = state.get("similar_incidents", [])
    if incidents:
        table = Table(title="Similar Past Incidents (Hybrid Search — $rankFusion)", box=box.SIMPLE, border_style="dim")
        table.add_column("Score", style="cyan", width=8)
        table.add_column("ID", width=10)
        table.add_column("Title", width=45)
        table.add_column("Root Cause", width=50)
        for inc in incidents[:5]:
            table.add_row(
                f"{inc.get('score', 0):.4f}",
                inc.get("incident_id", ""),
                inc.get("title", "")[:45],
                inc.get("root_cause", "")[:50],
            )
        console.print(table)
    else:
        console.print("[dim]No similar incidents found.[/dim]")

    runbooks = state.get("relevant_runbooks", [])
    if runbooks:
        table = Table(title="Relevant Runbook Sections (Hybrid Search — $rankFusion)", box=box.SIMPLE, border_style="dim")
        table.add_column("Score", style="cyan", width=8)
        table.add_column("ID", width=10)
        table.add_column("Runbook", width=35)
        table.add_column("Section", width=35)
        for rb in runbooks[:5]:
            table.add_row(
                f"{rb.get('score', 0):.4f}",
                rb.get("runbook_id", ""),
                rb.get("title", "")[:35],
                rb.get("section_title", "")[:35],
            )
        console.print(table)
    else:
        console.print("[dim]No relevant runbooks found.[/dim]")

    console.print()


def display_diagnosis_results(state: dict) -> None:
    """Display the LLM diagnosis."""
    console.print(Panel("[bold cyan]STEP 3: AI DIAGNOSIS[/bold cyan]", border_style="cyan"))

    pseudo = (
        '# Send all context to Claude for diagnosis\n'
        'claude.messages.create(\n'
        '  model="claude-sonnet",\n'
        '  prompt=f"""\n'
        '    <alarm>{alarm description + severity + category}</alarm>\n'
        '    <network_element>{type, vendor, model, site}</network_element>\n'
        '    <maintenance>{recent maintenance actions}</maintenance>\n'
        '    <similar_incidents>{top 5 incidents with root causes}</similar_incidents>\n'
        '    <runbooks>{top 5 runbook sections}</runbooks>\n'
        '  """\n'
        ')\n'
        '# Returns: { probable_root_cause, confidence, reasoning,\n'
        '#            supporting_evidence[], differential_diagnoses[] }'
    )
    console.print(Panel(Syntax(pseudo, "python", theme="monokai"), title="[dim]LLM Call[/dim]", border_style="dim"))

    diagnosis = state.get("diagnosis", {})
    confidence = state.get("confidence", 0)

    # Confidence meter
    bar_len = 30
    filled = int(confidence * bar_len)
    if confidence >= 0.9:
        color = "green"
    elif confidence >= 0.7:
        color = "yellow"
    else:
        color = "red"
    bar = f"[{color}]{'█' * filled}[/{color}]{'░' * (bar_len - filled)}"
    console.print(f"Confidence: {bar} {confidence:.1%}\n")

    console.print(f"[bold]Probable Root Cause:[/bold] {diagnosis.get('probable_root_cause', 'Unknown')}\n")

    reasoning = diagnosis.get("reasoning", "")
    if reasoning:
        console.print(Panel(reasoning, title="Reasoning Chain", border_style="dim"))

    evidence = diagnosis.get("supporting_evidence", [])
    if evidence:
        console.print("\n[bold]Supporting Evidence:[/bold]")
        for e in evidence:
            console.print(f"  ✓ {e}")

    diffs = diagnosis.get("differential_diagnoses", [])
    if diffs:
        console.print("\n[bold]Differential Diagnoses:[/bold]")
        for d in diffs:
            console.print(
                f"  • {d.get('cause', '')} (confidence: {d.get('confidence', 0):.0%}) — {d.get('why_less_likely', '')}"
            )

    console.print()


def display_remediation_results(state: dict) -> None:
    """Display the remediation recommendation."""
    console.print(Panel("[bold cyan]STEP 4: REMEDIATION[/bold cyan]", border_style="cyan"))

    pseudo = (
        '# 1. Adapt resolution from similar incidents to current context\n'
        'claude.messages.create(\n'
        '  model="claude-sonnet",\n'
        '  prompt=f"""\n'
        '    <alarm>{alarm}</alarm>\n'
        '    <diagnosis>{root_cause, confidence, reasoning}</diagnosis>\n'
        '    <past_resolutions>{top 2 incident resolutions}</past_resolutions>\n'
        '    <runbook_steps>{top 2 runbook procedures}</runbook_steps>\n'
        '  """\n'
        ')  // Returns: specific remediation action\n'
        '\n'
        '# 2. Check auto-remediation eligibility\n'
        'auto = confidence > 0.9 AND action matches\n'
        '       ["revert config parameter", "revert RET angle",\n'
        '        "revert firmware", "restart service", "clear alarm"]\n'
        '\n'
        '# 3. Persist diagnosis record\n'
        'db.diagnoses.insert_one({ alarm, diagnosis, confidence, action, evidence_chain })'
    )
    console.print(Panel(Syntax(pseudo, "python", theme="monokai"), title="[dim]LLM Call + MongoDB Write[/dim]", border_style="dim"))

    confidence = state.get("confidence", 0)
    auto = state.get("auto_remediable", False)
    action = state.get("recommended_action", "No action determined.")

    if confidence >= 0.9 and auto:
        console.print(Panel(
            f"[bold green]AUTO-REMEDIATION[/bold green]\n\n{action}",
            border_style="green",
            title="✅ Auto-Remediation Approved",
        ))
    elif confidence >= 0.7:
        console.print(Panel(
            f"[bold yellow]RECOMMENDED ACTION (human approval required)[/bold yellow]\n\n{action}",
            border_style="yellow",
            title="⚠️  Human Approval Required",
        ))
    else:
        console.print(Panel(
            f"[bold red]ESCALATION REQUIRED[/bold red]\n\nInsufficient confidence ({confidence:.0%}). Manual investigation needed.\n\n{action}",
            border_style="red",
            title="🚨 Escalation Required",
        ))

    evidence_chain = state.get("evidence_chain", [])
    if evidence_chain:
        console.print("\n[bold]Evidence Chain:[/bold]")
        for i, e in enumerate(evidence_chain, 1):
            console.print(f"  {i}. {e}")

    console.print()


async def process_alarm(alarm: dict, db: AsyncIOMotorDatabase, embedder: VoyageEmbedder) -> dict:
    """Process a single alarm through the NOC agent pipeline."""
    sev = alarm.get("severity", "")
    console.print(Panel(
        f"[{SEVERITY_COLORS.get(sev, 'white')}]Processing Alarm: {alarm.get('alarm_id', '')}[/]\n"
        f"{alarm.get('description', '')}",
        title=f"{SEVERITY_EMOJI.get(sev, '')} Alarm Details",
        border_style=SEVERITY_COLORS.get(sev, "white"),
    ))
    console.print()

    agent = build_noc_agent(db, embedder)
    initial_state: NOCAgentState = {
        "alarm": alarm,
        "network_element": None,
        "recent_maintenance": [],
        "correlated_alarms": [],
        "similar_incidents": [],
        "relevant_runbooks": [],
        "diagnosis": None,
        "confidence": 0.0,
        "recommended_action": None,
        "auto_remediable": False,
        "evidence_chain": [],
        "messages": [],
    }

    total_start = time.time()

    # LangGraph ainvoke runs the full pipeline (triage → retrieval → diagnosis → remediation)
    with console.status("[bold cyan]Running agent pipeline (triage → retrieval → diagnosis → remediation)...[/bold cyan]"):
        final_state = await agent.ainvoke(initial_state)

    total_elapsed = time.time() - total_start

    # Display results for each step
    display_triage_results(final_state)
    display_retrieval_results(final_state)
    display_diagnosis_results(final_state)
    display_remediation_results(final_state)

    # Display timing summary
    console.print(Panel(
        f"[bold]Total Processing Time: [cyan]{total_elapsed:.1f}s[/cyan][/bold]\n\n"
        f"[dim]Manual NOC process: ~45 min TTD + ~30 min TTR = ~75 min[/dim]\n"
        f"[bold green]NOC Copilot: {total_elapsed:.1f}s total[/bold green]  →  "
        f"[bold]{75 * 60 / max(total_elapsed, 0.1):.0f}x faster[/bold]",
        title="⏱️  Performance Comparison",
        border_style="green",
    ))

    return final_state


async def run_demo(db: AsyncIOMotorDatabase, embedder: VoyageEmbedder) -> None:
    """Run the full demo flow."""
    console.print(Panel(
        "[bold cyan]NOC Copilot[/bold cyan] — Autonomous Network Incident Resolution Agent\n"
        "[dim]MongoDB × Voyage AI × Claude × LangGraph[/dim]",
        border_style="cyan",
        padding=(1, 2),
    ))

    # Fetch active alarms
    cursor = db[ALARMS].find({"status": "active"}, {"embedding": 0}).sort("severity", 1)
    alarms = await cursor.to_list(length=20)

    if not alarms:
        console.print("[red]No active alarms found. Run load_data.py first.[/red]")
        return

    # Sort by severity priority
    severity_order = {"critical": 0, "major": 1, "minor": 2, "warning": 3}
    alarms.sort(key=lambda a: severity_order.get(a.get("severity", "warning"), 4))

    display_alarm_dashboard(alarms)

    # Process alarms interactively
    console.print("[bold]Select an alarm to process (enter number), or 'all' to process all, or 'q' to quit:[/bold]")

    while True:
        choice = console.input("[cyan]> [/cyan]").strip().lower()

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
