"""Streamlit dashboard for the agentic NOC Copilot workflow.

Layout:

- Sidebar
    - Active alarm list
    - Collection counts

- Main
    1. Live Mermaid render of the agent graph (showing per-phase ReAct
       loops + cross-phase conditional edges).
    2. When an alarm is selected, the agent runs and we render:
       - Phase-by-phase tool timeline (expander per phase iteration)
       - Loop-back markers
       - Diagnosis card with confidence bar
       - Remediation outcome card
       - Evidence chain
       - Raw final state (collapsed)
"""

from __future__ import annotations

import asyncio
import json
import queue as _queue
import threading

import streamlit as st

from noc_copilot.agent.graph import build_noc_agent, render_graph_mermaid
from noc_copilot.agent.state import initial_state
from noc_copilot.config import get_settings
from noc_copilot.db.collections import (
    ALARMS,
    DIAGNOSES,
    INCIDENTS,
    NETWORK_INVENTORY,
    REMEDIATION_ACTIONS,
    RUNBOOKS,
)
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.embeddings.voyage import VoyageEmbedder


# ---------------------------------------------------------------------------
# Resource setup (cached)
# ---------------------------------------------------------------------------


@st.cache_resource
def _get_background_loop():
    loop = asyncio.new_event_loop()
    threading.Thread(target=loop.run_forever, daemon=True).start()
    return loop


def run_async(coro):
    return asyncio.run_coroutine_threadsafe(coro, _get_background_loop()).result()


@st.cache_resource
def init_resources():
    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    sync_db = MongoDBConnection.get_sync_db()
    embedder = VoyageEmbedder(api_key=settings.voyage_api_key, model=settings.voyage_model)
    return db, sync_db, embedder


async def _find_to_list(collection, filter, projection=None, sort=None, limit=None):
    cursor = collection.find(filter, projection)
    if sort:
        cursor = cursor.sort(*sort)
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=limit or 100)


SEVERITY_EMOJI = {
    "critical": "🔴",
    "major": "🟠",
    "minor": "🟡",
    "warning": "🔵",
}

PHASE_EMOJI = {
    "triage": "🔍",
    "retrieval": "📚",
    "diagnosis": "🧠",
    "remediation": "🛠️",
    "router": "🔀",
}


# ---------------------------------------------------------------------------
# Render helpers
# ---------------------------------------------------------------------------


def render_graph_section() -> None:
    st.subheader("Agent graph")
    st.caption(
        "Each phase node is itself a ReAct sub-agent — within a node the LLM "
        "picks tools and decides when to stop. Between nodes, conditional edges "
        "loop back to retrieval when the diagnosis is low-confidence or when a "
        "remediation step fails verification."
    )
    st.markdown(f"```mermaid\n{render_graph_mermaid()}\n```")


def render_tool_timeline(tool_calls: list[dict], phase: str, iteration: int = 1) -> None:
    """Render tool calls for one phase iteration as a bordered table."""
    phase_calls = [tc for tc in tool_calls if tc.get("phase") == phase and tc.get("iteration", 1) == iteration]
    if not phase_calls:
        return

    rows = []
    for i, tc in enumerate(phase_calls, 1):
        args = tc.get("args", {})
        args_str = ", ".join(f"{k}={v!r}" for k, v in args.items())
        rows.append({
            "#": i,
            "tool": tc.get("tool", ""),
            "args": args_str,
            "result": tc.get("result_summary", ""),
            "ms": tc.get("latency_ms", 0),
        })
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_phase_log(state: dict) -> None:
    log = state.get("phase_log", []) or []
    tool_calls = state.get("tool_calls", []) or []

    st.subheader("Trace")

    rendered_keys: set[tuple[str, int]] = set()

    for event in log:
        phase = event.get("phase", "")
        iteration = event.get("iteration", 1)
        ev = event.get("event", "")
        key = (phase, iteration)

        if ev == "completed":
            if key in rendered_keys:
                continue
            rendered_keys.add(key)
            emoji = PHASE_EMOJI.get(phase, "•")
            label = f"{emoji} {phase.upper()}"
            if iteration > 1:
                label += f"  (iteration {iteration})"
            label += f"  — {event.get('detail', '')}"
            with st.expander(label, expanded=(phase == "diagnosis" or phase == "remediation")):
                render_tool_timeline(tool_calls, phase, iteration)
        elif ev == "looped_back":
            st.warning(f"↺  LOOP-BACK: {event.get('detail', '')}")
        elif ev == "escalated":
            st.error(f"🚨 Escalated by router: {event.get('detail', '')}")


def render_diagnosis_card(state: dict) -> None:
    diagnosis = state.get("diagnosis") or {}
    confidence = state.get("confidence", 0.0) or 0.0
    if not diagnosis:
        return

    color = "🟢" if confidence >= 0.9 else "🟡" if confidence >= 0.7 else "🔴"
    st.subheader(f"{color} Diagnosis")
    st.markdown(f"**Probable root cause:** {diagnosis.get('probable_root_cause', '?')}")
    st.progress(min(max(confidence, 0.0), 1.0))
    st.caption(f"Confidence: {confidence:.1%}")

    with st.expander("Reasoning", expanded=False):
        st.write(diagnosis.get("reasoning", ""))

    evidence = diagnosis.get("supporting_evidence") or []
    if evidence:
        st.markdown("**Supporting evidence:**")
        for e in evidence:
            st.markdown(f"- {e}")

    diffs = diagnosis.get("differential_diagnoses") or []
    if diffs:
        st.markdown("**Differential diagnoses:**")
        for d in diffs:
            st.markdown(
                f"- {d.get('cause', '')} "
                f"({(d.get('confidence', 0) or 0):.0%}) — "
                f"{d.get('why_less_likely', '')}"
            )


def render_remediation_card(state: dict) -> None:
    final_status = state.get("final_status")
    action = state.get("recommended_action", "")

    radius = state.get("blast_radius") or {}
    pre_lines: list[str] = []
    if radius.get("risk"):
        pre_lines.append(
            f"blast_radius: **{radius.get('risk')}** "
            f"({radius.get('co_located_active_elements', 0)} co-located, "
            f"high_traffic={radius.get('is_high_traffic')})"
        )
    if state.get("maintenance_window_ok") is not None:
        pre_lines.append(f"maintenance_window_ok: **{state.get('maintenance_window_ok')}**")
    if state.get("backup_verified") is not None:
        pre_lines.append(f"backup_verified: **{state.get('backup_verified')}**")

    if final_status == "auto_remediated":
        st.success(f"✅ AUTO-REMEDIATED  \n**Action:** {action}")
        verification = state.get("verification_result") or {}
        st.caption(f"Verification: alarm cleared = {verification.get('cleared')}")
    elif final_status == "human_approval_required":
        st.warning(f"⚠️  HUMAN APPROVAL REQUIRED  \n**Action:** {action}")
    elif final_status == "escalated":
        st.error(f"🚨 ESCALATED  \n{action}")
    elif final_status == "verification_failed":
        st.error("❌ VERIFICATION FAILED — action attempted but alarm did not clear.")
    else:
        st.info(f"Status: {final_status}")

    if pre_lines:
        st.markdown("**Preconditions:**")
        for p in pre_lines:
            st.markdown(f"- {p}")


def render_evidence_chain(state: dict) -> None:
    chain = state.get("evidence_chain") or []
    if not chain:
        return
    with st.expander("Evidence chain (audit)", expanded=False):
        for i, e in enumerate(chain, 1):
            st.markdown(f"{i}. {e}")


# ---------------------------------------------------------------------------
# Live streaming of agent runs
# ---------------------------------------------------------------------------


def _phase_from_namespace(namespace: tuple) -> str | None:
    """Outer phase name from a LangGraph subgraph namespace tuple."""
    if not namespace:
        return None
    head = namespace[0]
    if ":" in head:
        head = head.split(":", 1)[0]
    return head if head in PHASE_EMOJI else None


def stream_agent_to_status(agent, init_state: dict, config: dict, status) -> dict:
    """Drive `agent.astream` from the background loop; render each tool call.

    Streamlit is synchronous, so we shuttle (namespace, update) tuples
    from the background asyncio loop through a thread-safe queue. The
    main script thread drains the queue, appends a markdown line per
    tool call into the open `st.status` container, and accumulates the
    full final state to return.
    """
    q: _queue.Queue = _queue.Queue()
    SENTINEL = object()
    holder: dict = {}

    async def _run():
        accum = dict(init_state)
        try:
            async for ns, update in agent.astream(
                init_state, config, stream_mode="updates", subgraphs=True
            ):
                q.put((ns, update))
                # Outer-graph updates carry the canonical state deltas.
                if not ns and isinstance(update, dict):
                    for _node, node_update in update.items():
                        if not isinstance(node_update, dict):
                            continue
                        for k, v in node_update.items():
                            if k in {"tool_calls", "phase_log", "evidence_chain", "messages"}:
                                existing = accum.get(k) or []
                                accum[k] = list(existing) + list(v or [])
                            elif k == "kpi_history":
                                merged = dict(accum.get(k) or {})
                                merged.update(v or {})
                                accum[k] = merged
                            else:
                                accum[k] = v
        finally:
            holder["state"] = accum
            q.put(SENTINEL)

    fut = asyncio.run_coroutine_threadsafe(_run(), _get_background_loop())

    current_phase: tuple[str, int] | None = None

    while True:
        item = q.get()
        if item is SENTINEL:
            break
        ns, update = item
        if not isinstance(update, dict):
            continue

        for node_name, node_update in update.items():
            if not isinstance(node_update, dict):
                continue

            phase = _phase_from_namespace(ns)

            # Render only mid-phase subgraph tool firings. The outer
            # phase node re-emits the same tool_calls list when it
            # completes; printing both would duplicate every row.
            new_tool_calls = node_update.get("tool_calls") or []
            if phase and new_tool_calls:
                iteration = new_tool_calls[0].get("iteration", 1)
                key = (phase, iteration)
                if key != current_phase:
                    suffix = f" (iteration {iteration})" if iteration > 1 else ""
                    status.markdown(f"\n**{PHASE_EMOJI[phase]} {phase.upper()}{suffix}**")
                    status.update(label=f"{PHASE_EMOJI[phase]} {phase.capitalize()}…")
                    current_phase = key
                for tc in new_tool_calls:
                    name = tc.get("tool", "")
                    summary = (tc.get("result_summary") or "").splitlines()
                    first = summary[0] if summary else ""
                    if len(first) > 140:
                        first = first[:137] + "…"
                    latency = tc.get("latency_ms", 0)
                    status.markdown(f"- ✓ `{name}` → {first}  _({latency}ms)_")

            for event in node_update.get("phase_log") or []:
                ev = event.get("event")
                if ev == "looped_back":
                    status.markdown(f"\n⚠️ **Loop-back:** {event.get('detail', '')}")
                    current_phase = None
                elif ev == "escalated":
                    status.markdown(f"\n🚨 **Escalated:** {event.get('detail', '')}")
                    current_phase = None

    fut.result()  # surface any background exception
    return holder["state"]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    st.set_page_config(page_title="NOC Copilot — Agent", page_icon="🛰️", layout="wide")
    st.title("🛰️  NOC Copilot")
    st.caption(
        "Agentic Network Incident Resolution — MongoDB × Voyage AI × Anthropic × LangGraph"
    )

    db, sync_db, embedder = init_resources()

    # ---- Sidebar: alarm list ----
    with st.sidebar:
        st.header("Active alarms")
        alarms = run_async(
            _find_to_list(
                db[ALARMS], {"status": "active"}, projection={"embedding": 0},
                sort=("severity", 1), limit=20,
            )
        )
        severity_order = {"critical": 0, "major": 1, "minor": 2, "warning": 3}
        alarms.sort(key=lambda a: (severity_order.get(a.get("severity", "warning"), 4), a.get("alarm_id", "")))

        for alarm in alarms:
            sev = alarm.get("severity", "")
            label = f"{SEVERITY_EMOJI.get(sev, '⚪')} {alarm['alarm_id']} — {(alarm.get('description') or '')[:50]}…"
            if st.button(label, key=alarm["alarm_id"], use_container_width=True):
                st.session_state["selected_alarm"] = alarm
                st.session_state["last_run"] = None  # reset prior run

        st.markdown("---")
        st.header("Collection counts")
        counts = {
            "alarms": run_async(db[ALARMS].count_documents({})),
            "incidents": run_async(db[INCIDENTS].count_documents({})),
            "runbooks": run_async(db[RUNBOOKS].count_documents({})),
            "network_inventory": run_async(db[NETWORK_INVENTORY].count_documents({})),
            "diagnoses": run_async(db[DIAGNOSES].count_documents({})),
            "remediation_actions": run_async(db[REMEDIATION_ACTIONS].count_documents({})),
        }
        for name, n in counts.items():
            st.markdown(f"- **{name}**: {n}")

    # ---- Main panel ----
    render_graph_section()
    st.markdown("---")

    selected = st.session_state.get("selected_alarm")
    if not selected:
        st.info("Pick an alarm from the sidebar to run the agent.")
        return

    sev = selected.get("severity", "")
    st.subheader(f"{SEVERITY_EMOJI.get(sev, '⚪')} {selected.get('alarm_id')} — {selected.get('source')}")
    st.markdown(f"**Description:** {selected.get('description')}")
    st.json(selected.get("metrics", {}), expanded=False)

    last_run = st.session_state.get("last_run")
    if last_run is None or last_run.get("alarm_id") != selected.get("alarm_id"):
        if st.button("▶  Run agent", type="primary"):
            agent = build_noc_agent(db, embedder)
            init = initial_state(selected)
            with st.status("Starting agent…", expanded=True) as status:
                final_state = stream_agent_to_status(
                    agent, init, {"recursion_limit": 80}, status,
                )
                status.update(label="✓ Agent run complete", state="complete", expanded=False)
            st.session_state["last_run"] = {
                "alarm_id": selected.get("alarm_id"),
                "state": final_state,
            }
            st.rerun()
        return

    state = last_run["state"]

    render_phase_log(state)
    st.markdown("---")
    col1, col2 = st.columns([1, 1])
    with col1:
        render_diagnosis_card(state)
    with col2:
        render_remediation_card(state)
    st.markdown("---")
    render_evidence_chain(state)

    with st.expander("Raw final state (debug)", expanded=False):
        # Strip non-JSON-serializable bits before display
        safe = {
            k: v for k, v in state.items()
            if k not in {"messages"}
        }
        try:
            st.json(safe, expanded=False)
        except Exception:
            st.code(json.dumps(safe, default=str, indent=2)[:50_000])

    if st.button("Clear and pick another alarm"):
        st.session_state.pop("last_run", None)
        st.session_state.pop("selected_alarm", None)
        st.rerun()


if __name__ == "__main__":
    main()
