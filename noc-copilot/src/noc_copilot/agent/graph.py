"""LangGraph agent graph definition for NOC Copilot."""

from functools import partial
from langgraph.graph import StateGraph, END
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.nodes.triage import triage_node
from noc_copilot.agent.nodes.retrieval import retrieval_node
from noc_copilot.agent.nodes.diagnosis import diagnosis_node
from noc_copilot.agent.nodes.remediation import remediation_node
from noc_copilot.embeddings.voyage import VoyageEmbedder


def build_noc_agent(db: AsyncIOMotorDatabase, embedder: VoyageEmbedder):
    graph = StateGraph(NOCAgentState)

    graph.add_node("triage", partial(triage_node, db=db))
    graph.add_node("retrieval", partial(retrieval_node, db=db, embedder=embedder))
    graph.add_node("diagnosis", diagnosis_node)
    graph.add_node("remediation", partial(remediation_node, db=db))

    graph.set_entry_point("triage")
    graph.add_edge("triage", "retrieval")
    graph.add_edge("retrieval", "diagnosis")
    graph.add_edge("diagnosis", "remediation")
    graph.add_edge("remediation", END)

    return graph.compile()
