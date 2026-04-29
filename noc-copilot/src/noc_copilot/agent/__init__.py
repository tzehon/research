"""NOC Copilot agent package.

The agent is an **agentic workflow**: a LangGraph supervisor with a fixed
phase order (triage → retrieval → diagnosis → remediation), where each
phase node is itself a ReAct sub-agent that picks tools, evaluates
results, and decides when to stop. Conditional edges between phases let
diagnosis loop back to retrieval on low confidence and let remediation
loop back when verification fails — both bounded by retry counters.
"""

# LangGraph 1.0 deprecated `langgraph.prebuilt.create_react_agent` in favour
# of `langchain.agents.create_agent`. Both are functionally identical and
# the deprecated path remains supported through V2.0. Suppress the warning
# to keep the demo terminal clean.
import warnings

warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    message=r".*create_react_agent has been moved to `langchain\.agents`.*",
)
