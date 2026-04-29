"""Supervisor graph for the agentic workflow.

This is a **workflow** in Anthropic's "Building effective agents" sense
— phase order is hardcoded and routing edges are deterministic Python.
Each phase node, however, is itself a real ReAct **agent** built via
`langgraph.prebuilt.create_react_agent` with a phase-specific tool belt,
so within a phase the LLM picks tools, evaluates results, and decides
when to stop. The combination is a workflow with embedded agents — see
WALKTHROUGH.md for the full story.

The outer shape (use `render_graph_mermaid()` for the rendered version):

    START → triage → retrieval → diagnosis ──(conf ≥ 0.7)──→ remediation → END
                          ▲          │                              │
                          │          └──(low conf, retries<2)──→ inc_diagnosis_retry
                          │                                         │
                          └─────────────────────────────────────────┘
                          ▲          │
                          │          └──(retries exhausted)──→ escalation → END
                          │
                          └──(verify failed, retries<1)──── inc_remediation_retry
                                                            ◀─── from remediation
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.nodes.diagnosis import make_diagnosis_node
from noc_copilot.agent.nodes.remediation import make_remediation_node
from noc_copilot.agent.nodes.retrieval import make_retrieval_node
from noc_copilot.agent.nodes.routing import (
    escalation_node,
    increment_diagnosis_retry,
    increment_remediation_retry,
    route_after_diagnosis,
    route_after_remediation,
)
from noc_copilot.agent.nodes.triage import make_triage_node
from noc_copilot.agent.state import NOCAgentState
from noc_copilot.embeddings.voyage import VoyageEmbedder


def build_noc_agent(db: AsyncIOMotorDatabase, embedder: VoyageEmbedder):
    """Build and compile the agent graph.

    The returned object is a compiled LangGraph that takes an initial
    state (see `state.initial_state(alarm)`) and runs the agent to
    completion or escalation.
    """
    graph = StateGraph(NOCAgentState)

    graph.add_node("triage", make_triage_node(db))
    graph.add_node("retrieval", make_retrieval_node(db, embedder))
    graph.add_node("diagnosis", make_diagnosis_node())
    graph.add_node("remediation", make_remediation_node(db))

    # Counter nodes — pure functions that bump retry counters when a
    # loop fires. Splitting these out keeps the routing readable and
    # makes the loop visible in the graph diagram.
    graph.add_node("inc_diagnosis_retry", increment_diagnosis_retry)
    graph.add_node("inc_remediation_retry", increment_remediation_retry)

    # Escalation terminal — used when retries are exhausted before any
    # diagnosis was committed.
    graph.add_node("escalation", escalation_node)

    # ---- Linear forward edges ----
    graph.add_edge(START, "triage")
    graph.add_edge("triage", "retrieval")
    graph.add_edge("retrieval", "diagnosis")

    # ---- Diagnosis → (remediation | retry retrieval | escalate) ----
    graph.add_conditional_edges(
        "diagnosis",
        route_after_diagnosis,
        {
            "remediation": "remediation",
            "retrieval": "inc_diagnosis_retry",
            "escalate": "escalation",
        },
    )
    graph.add_edge("inc_diagnosis_retry", "retrieval")

    # ---- Remediation → (end | retry retrieval) ----
    graph.add_conditional_edges(
        "remediation",
        route_after_remediation,
        {
            "end": END,
            "retrieval": "inc_remediation_retry",
        },
    )
    graph.add_edge("inc_remediation_retry", "retrieval")

    # ---- Escalation is terminal ----
    graph.add_edge("escalation", END)

    return graph.compile()


def render_graph_mermaid() -> str:
    """Static Mermaid representation for the UI. Mirrors the graph above.

    We render this from a fixed string rather than asking the compiled
    graph for `get_graph().draw_mermaid()` because the static version
    has tidier labels and is stable across LangGraph minor versions.
    """
    return """flowchart LR
    START([START]) --> triage["triage<br/>(ReAct)"]
    triage --> retrieval["retrieval<br/>(ReAct)"]
    retrieval --> diagnosis["diagnosis<br/>(ReAct)"]
    diagnosis -->|"confidence ≥ 0.7"| remediation["remediation<br/>(ReAct)"]
    diagnosis -->|"low conf, retries < 2"| retry1[+1 diagnosis_retry]
    retry1 --> retrieval
    diagnosis -->|"retries exhausted"| escalation["escalation"]
    remediation -->|"verification failed,<br/>retries < 1"| retry2[+1 remediation_retry]
    retry2 --> retrieval
    remediation -->|"terminal status"| END([END])
    escalation --> END

    classDef phase fill:#74b9ff,stroke:#0984e3,color:#fff
    classDef counter fill:#fdcb6e,stroke:#e17055,color:#000
    classDef terminal fill:#d63031,stroke:#b71540,color:#fff
    class triage,retrieval,diagnosis,remediation phase
    class retry1,retry2 counter
    class escalation terminal
"""
