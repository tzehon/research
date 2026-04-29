"""Phase-specific tool factories.

Each phase has its own bound toolset. The factories take their resource
dependencies (db, embedder) and return a list of LangChain tool objects
ready to bind to a chat model via `model.bind_tools(...)` or to pass into
`langgraph.prebuilt.create_react_agent`.
"""

from noc_copilot.agent.tools.diagnosis_tools import make_diagnosis_tools
from noc_copilot.agent.tools.remediation_tools import make_remediation_tools
from noc_copilot.agent.tools.retrieval_tools import make_retrieval_tools
from noc_copilot.agent.tools.triage_tools import make_triage_tools

__all__ = [
    "make_triage_tools",
    "make_retrieval_tools",
    "make_diagnosis_tools",
    "make_remediation_tools",
]
