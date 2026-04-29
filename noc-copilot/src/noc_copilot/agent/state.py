"""Agent state schema for the NOC Copilot LangGraph agent.

The state has three layers:

1. **Phase-shared facts** — what the agent has learned (network_element,
   similar_incidents, diagnosis, …). These accumulate as the graph progresses
   and feed prompts in later phases.
2. **Control state** — retry counters and routing flags used by the
   conditional edges. The graph reads these in `routing.py` to decide
   whether to loop back, advance, or escalate.
3. **Observability** — `tool_calls`, `phase_log`, and `evidence_chain`
   record what the agent *did*. These are not used for routing — they exist
   so the terminal/Streamlit UIs can render the trace.
"""

from typing import Annotated

# Pydantic 2.12+ introspects `TypedDict` schemas at runtime when our
# state types appear inside `Annotated[..., InjectedState]`. On Python
# < 3.12, only `typing_extensions.TypedDict` carries the metadata
# Pydantic needs; the stdlib `typing.TypedDict` raises
# PydanticUserError. Always import from typing_extensions for safety.
from typing_extensions import TypedDict

from langgraph.graph.message import add_messages
from langgraph.managed import RemainingSteps


def append_list(left: list, right: list) -> list:
    """Reducer: concatenate, replacing None with []."""
    return (left or []) + (right or [])


def merge_dict(left: dict, right: dict) -> dict:
    """Reducer: shallow-merge, right wins on key conflict."""
    return {**(left or {}), **(right or {})}


class ToolCall(TypedDict, total=False):
    """One observed tool invocation. Used purely for UI rendering."""
    phase: str            # "triage" | "retrieval" | "diagnosis" | "remediation"
    tool: str             # tool name
    args: dict            # arguments the LLM chose
    result_summary: str   # short, human-readable summary of the tool result
    latency_ms: int       # tool execution time
    iteration: int        # which inner-loop iteration of this phase


class PhaseEvent(TypedDict, total=False):
    """One phase-level event. Records loop-backs, escalations, transitions."""
    phase: str
    event: str            # "entered" | "completed" | "looped_back" | "escalated"
    detail: str
    iteration: int


class NOCAgentState(TypedDict, total=False):
    # ---- Input -----------------------------------------------------------
    alarm: dict

    # ---- Phase-shared facts (filled by tool calls) -----------------------
    network_element: dict | None
    recent_maintenance: list[dict]
    correlated_alarms: list[dict]
    topology_neighbors: list[dict]
    kpi_history: Annotated[dict, merge_dict]
    config_changes: list[dict]

    similar_incidents: list[dict]
    relevant_runbooks: list[dict]
    retrieval_query: str            # the most recent query string used

    diagnosis: dict | None
    confidence: float

    recommended_action: str | None
    auto_remediable: bool
    blast_radius: dict | None
    maintenance_window_ok: bool | None
    backup_verified: bool | None
    execution_result: dict | None
    verification_result: dict | None
    final_status: str | None        # "auto_remediated" | "human_approval" | "escalated"

    # ---- Control state (drives conditional edges) ------------------------
    retrieval_attempts: int
    diagnosis_retries: int
    remediation_retries: int
    next_phase: str | None          # set by routing for explicit handoff

    # ---- Observability ---------------------------------------------------
    tool_calls: Annotated[list[ToolCall], append_list]
    phase_log: Annotated[list[PhaseEvent], append_list]
    evidence_chain: Annotated[list[str], append_list]

    # ---- LangChain message history (per-phase ReAct loops) ---------------
    messages: Annotated[list, add_messages]

    # ---- Used by langgraph's create_react_agent to bound inner loops ----
    remaining_steps: RemainingSteps


def initial_state(alarm: dict) -> NOCAgentState:
    """Build a fresh state for one alarm run."""
    return {
        "alarm": alarm,
        "network_element": None,
        "recent_maintenance": [],
        "correlated_alarms": [],
        "topology_neighbors": [],
        "kpi_history": {},
        "config_changes": [],
        "similar_incidents": [],
        "relevant_runbooks": [],
        "retrieval_query": "",
        "diagnosis": None,
        "confidence": 0.0,
        "recommended_action": None,
        "auto_remediable": False,
        "blast_radius": None,
        "maintenance_window_ok": None,
        "backup_verified": None,
        "execution_result": None,
        "verification_result": None,
        "final_status": None,
        "retrieval_attempts": 0,
        "diagnosis_retries": 0,
        "remediation_retries": 0,
        "next_phase": None,
        "tool_calls": [],
        "phase_log": [],
        "evidence_chain": [],
        "messages": [],
    }
