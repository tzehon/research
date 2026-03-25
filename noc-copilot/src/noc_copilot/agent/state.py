"""Agent state schema for the NOC Copilot LangGraph agent."""

from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages


class NOCAgentState(TypedDict):
    # Input
    alarm: dict

    # Enrichment
    network_element: dict | None
    recent_maintenance: list[dict]
    correlated_alarms: list[dict]

    # Retrieval
    similar_incidents: list[dict]
    relevant_runbooks: list[dict]

    # Diagnosis
    diagnosis: dict | None
    confidence: float

    # Remediation
    recommended_action: str | None
    auto_remediable: bool
    evidence_chain: list[str]

    # Messages for LangGraph
    messages: Annotated[list, add_messages]
