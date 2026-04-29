# NOC Copilot — Code Walkthrough

A guided tour of the agentic workflow, from "alarm in" to "alarm cleared (or escalated)." Built for AI/agent engineers who want to see how the pieces fit and where the agency lives.

---

## What this is, plainly

This is **a workflow with embedded ReAct sub-agents**, not a fully autonomous agent. The distinction matters.

Following [Anthropic's "Building effective agents"](https://www.anthropic.com/research/building-effective-agents) taxonomy:

- A **workflow** is predefined code paths orchestrating LLM calls.
- An **agent** is the LLM dynamically directing its own process.

NOC Copilot's outer graph (the four-phase order) is a workflow — phase order is hardcoded and conditional edges are deterministic Python. Each *phase node* is then a real ReAct agent: the LLM picks which tools to call, evaluates their results, decides what to call next, chooses among terminal actions including loop-back-for-more-evidence and escalate-to-human, and stops on its own. So the system has substantive within-phase agency embedded in a workflow scaffold.

Why this shape:

- It demos well — phases are visible boundaries to narrate against, and you can see when control loops back.
- The LLM cannot do anything genuinely surprising at the architecture level — it can't decide to skip retrieval and act, or to invent a new phase. That's good for a regulated NOC context.
- It's the pattern Anthropic actually recommends for most production work; a flat ReAct over 18 tools would be flashier but more brittle.

```
              ┌─────────── refined evidence ────────────┐
              ▼                                         │
  START → triage → retrieval → diagnosis ──→ remediation │
       (ReAct)   (ReAct)     (ReAct)           (ReAct)  │
                                │                  │     │
                                └─ low conf, ──────┘     │
                                   retries < 2           │
                                                         │
                                ┌─ verification failed ──┘
                                │  retries < 1
                                ▼
                           retrieval (re-investigate)

  → END (auto_remediated / human_approval_required / escalated)
```

> **File:** [`src/noc_copilot/agent/graph.py`](src/noc_copilot/agent/graph.py) — the wiring.

---

## State, the spine

Everything the agent learns lives in one `NOCAgentState` (a `TypedDict` with reducers):

> **File:** [`src/noc_copilot/agent/state.py`](src/noc_copilot/agent/state.py) — full schema; the snippet below is a representative subset.

```python
class NOCAgentState(TypedDict, total=False):
    # Phase-shared facts (filled by tool calls; read by later phases)
    alarm: dict
    network_element: dict | None
    recent_maintenance: list[dict]
    correlated_alarms: list[dict]
    topology_neighbors: list[dict]
    config_changes: list[dict]
    kpi_history: Annotated[dict, merge_dict]
    similar_incidents: list[dict]
    relevant_runbooks: list[dict]
    diagnosis: dict | None
    confidence: float
    blast_radius: dict | None
    execution_result: dict | None
    verification_result: dict | None
    recommended_action: str | None
    final_status: str | None  # auto_remediated | human_approval_required | escalated

    # Control state — drives conditional edges
    retrieval_attempts: int
    diagnosis_retries: int
    remediation_retries: int
    next_phase: str | None  # set by tools to request handoff

    # Observability — for the UI, never read by routing
    tool_calls: Annotated[list, append_list]
    phase_log: Annotated[list, append_list]
    evidence_chain: Annotated[list, append_list]

    messages: Annotated[list, add_messages]
    remaining_steps: RemainingSteps   # required by create_react_agent
```

Three layers — facts, control, observability — kept distinct so it's easy to see what the agent learned, what drove a routing decision, and what the UI should render.

---

## Step 1: Triage — the LLM picks what to investigate

> **File:** [`src/noc_copilot/agent/nodes/triage.py`](src/noc_copilot/agent/nodes/triage.py)
> **Tools:** [`src/noc_copilot/agent/tools/triage_tools.py`](src/noc_copilot/agent/tools/triage_tools.py)

Six MongoDB-query tools. The LLM gets the alarm and a system prompt that tells it *which* tools fit *which* alarm patterns:

```python
tools = [
    lookup_network_element,        # always first
    check_recent_maintenance,      # 5G/RET-related alarms, recent symptoms
    find_correlated_alarms,        # site-wide outages, power/hardware alarms
    check_topology_neighbors,      # link-down, microwave, transport
    query_kpi_history,             # gradual vs sudden degradation
    check_recent_config_changes,   # config drift / firmware regression
]
```

For `ALM-DEMO-001` (radio + recent maintenance), the agent calls `lookup_network_element` → `check_recent_maintenance` and stops. Three calls, plenty of context.

For `ALM-DEMO-002` (microwave link signal degradation), the agent calls `lookup_network_element` → `check_topology_neighbors` → `find_correlated_alarms`. Same agent code, completely different tool selection because the alarm shape is different. **That is the within-phase agency you're paying for.**

Tools update outer state directly via `langgraph.types.Command`:

```python
return Command(update={
    "network_element": cleaned,           # fact
    "tool_calls": [tool_call_record],     # observability (append reducer)
    "messages": [ToolMessage(summary, tool_call_id=...)],  # for the inner LLM
})
```

The state update propagates to all later phases. The tool message goes back into the inner ReAct loop for the LLM to read on its next turn.

---

## Step 2: Retrieval — search → evaluate → maybe refine → search again

> **File:** [`src/noc_copilot/agent/nodes/retrieval.py`](src/noc_copilot/agent/nodes/retrieval.py)
> **Tools:** [`src/noc_copilot/agent/tools/retrieval_tools.py`](src/noc_copilot/agent/tools/retrieval_tools.py)

Three tools:

```python
search_similar_incidents(query, category)  # MongoDB $rankFusion over incidents
search_runbooks(query, domain)             # MongoDB $rankFusion over runbooks
evaluate_retrieval_quality()               # reads state, returns "good" or "poor"
```

The MongoDB hybrid search is the same `$rankFusion` pipeline as before — Voyage AI vector + full-text search, server-side, single aggregation. What changed is the **loop around it**:

```
search → evaluate → [poor + attempts < 2] → reformulate → search → ...
                  → [good or attempts ≥ 2] → stop
```

The system prompt instructs the LLM to call `evaluate_retrieval_quality` after each search; that tool reads `similar_incidents[0].score` and `relevant_runbooks[0].score` from state and returns a verdict plus a recommendation. The LLM then either reformulates and searches again, or stops. **The reformulation loop is genuinely LLM-driven** — the LLM judges its own work and decides to try harder.

The pipeline version of this code did one search and moved on, even when the top score was 0.18.

---

## Step 3: Diagnosis — commit, or ask for more evidence

> **File:** [`src/noc_copilot/agent/nodes/diagnosis.py`](src/noc_copilot/agent/nodes/diagnosis.py)
> **Tools:** [`src/noc_copilot/agent/tools/diagnosis_tools.py`](src/noc_copilot/agent/tools/diagnosis_tools.py)

Two tools — and the LLM has to call exactly one:

```python
propose_diagnosis(probable_root_cause, confidence, reasoning,
                  supporting_evidence, differential_diagnoses)
   # → state.diagnosis, state.confidence

request_more_evidence(refined_query, hypotheses, reason)
   # → state.next_phase = "retrieval"
   # → state.retrieval_query = refined_query
```

Both are typed: the LLM produces structured output via tool calls, not free-form JSON that has to be parsed. If the LLM says "I'm not sure", it has to provide the *next* search query and its hypotheses — that's what gets fed back into retrieval on the loop-back.

The conditional edge that follows is deterministic Python:

```python
def route_after_diagnosis(state):
    if state["next_phase"] == "retrieval" and state["diagnosis_retries"] < 2:
        return "retrieval"        # loop back with refined query
    if state["next_phase"] == "retrieval":  # retries exhausted
        return "escalate"
    if state["diagnosis"] is not None:
        return "remediation"
```

> **File:** [`src/noc_copilot/agent/nodes/routing.py`](src/noc_copilot/agent/nodes/routing.py)

So: **the *decision* to loop back is the LLM's** (it chose `request_more_evidence` over `propose_diagnosis`); the *plumbing* of looping back is code (this routing function plus the counter node and the cycle through `inc_diagnosis_retry → retrieval`). That's the pattern across the whole graph.

The retrieval-on-retry case is not just "search again with the same query." The LLM has produced *differential diagnoses* by this point ("might be hardware, might be config drift"), and the retrieval node sees those as hypotheses on the next pass. The LLM is refining its own understanding, evaluation by evaluation.

---

## Step 4: Remediation — closed loop: check → act → verify

> **File:** [`src/noc_copilot/agent/nodes/remediation.py`](src/noc_copilot/agent/nodes/remediation.py)
> **Tools:** [`src/noc_copilot/agent/tools/remediation_tools.py`](src/noc_copilot/agent/tools/remediation_tools.py)

Seven tools split into three roles:

```python
# Preconditions (read-only)
estimate_blast_radius        # how many services share this site? high-traffic region?
check_maintenance_window     # is the element already in maintenance?
verify_backup_exists         # can we revert if needed?

# Terminal actions (the LLM calls one and stops)
execute_remediation_step + verify_alarm_cleared   # if all preconditions OK and confidence ≥ 0.9
recommend_for_approval                            # if 0.7–0.9 or unsafe action
escalate                                          # if < 0.7 or risky preconditions
```

The system prompt encodes the auto-remediation rule explicitly. The LLM's choice between auto-act, recommend, and escalate is *legible*: you can read the tool calls in the trace and see why it chose what it did.

`execute_remediation_step` writes a record to a `remediation_actions` collection — the agent's actions are auditable in MongoDB, alongside the diagnoses. Real deployments would replace this with an actual element-management API call.

The verify step is where the closed loop closes. If `verify_alarm_cleared` returns `cleared=False`, state gets `final_status="verification_failed"`, and the routing edge sends control back to retrieval for another pass:

```python
def route_after_remediation(state):
    if state["final_status"] == "verification_failed" and state["remediation_retries"] < 1:
        return "retrieval"   # re-investigate with a fresh search
    return "end"
```

---

## Reproducibility for live demos

There is no replay layer. The agent calls Claude live every time. What keeps demo runs stable is:

1. **`temperature=0`** in `get_chat_model()` so the model's choices are as deterministic as the API allows.
2. **Engineered alarm fixtures** ([`src/noc_copilot/data/seed_data.py`](src/noc_copilot/data/seed_data.py)) where each demo alarm has a clear "right path" — `gNB-SG-C01` has a 2-day-old RET adjustment that the LLM will overwhelmingly pick up; `ALM-DEMO-005` is at a high-traffic site so blast radius forces escalation; etc.
3. **Tight tool docstrings** that nudge the LLM toward the expected ordering (always `lookup_network_element` first, then alarm-specific tools).

This is reproducible-enough for a live demo. It's not bulletproof — Claude can still drift — and any demo run does call the API. If a demo absolutely cannot tolerate live calls, fall back to recorded screen captures of a known-good run rather than re-introducing a replay layer.

---

## Per-alarm narrative arc

The six demo alarms are engineered to each hit a different agentic pattern. Live LLM choices vary slightly run-to-run; the column below is the *expected* path given the fixtures.

| Alarm           | Likely path                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `ALM-DEMO-001` (critical, radio, RET on `gNB-SG-C01`)  | Tight triage finds the recent RET adjustment, high-confidence diagnosis, auto-remediation closes the loop |
| `ALM-DEMO-002` (major, transport, `RTR-SG-01`)  | Triage shape shifts to `find_correlated_alarms` + `check_topology_neighbors` (no maintenance on this router); rain-fade diagnosis lands at human-approval level |
| `ALM-DEMO-003` (minor, core, `UPF-SG-01`, no user impact)  | Monitoring case — moderate-confidence diagnosis, conservative recommendation or watchful escalation         |
| `ALM-DEMO-004` (major, radio, `gNB-SG-W01`)  | Recent firmware upgrade surfaces in triage; first retrieval scores poorly → LLM reformulates → second retrieval lands |
| `ALM-DEMO-005` (critical, power, `gNB-SG-N01`)  | No auto-remediable action exists for hardware failure → agent escalates regardless of diagnostic confidence  |
| `ALM-DEMO-006` (warning, radio, `gNB-SG-E02`)  | Ambiguous external interference → diagnosis < 0.7 → loop back to retrieval → still ambiguous → escalate     |

Together they cover: tool selection per alarm shape, retrieval refinement, low-confidence loop-back, the safe-action allow-list as a guardrail, and graceful escalation. The full surface area an agent engineer cares about, demonstrated end to end in under a minute per alarm.

---

## Why MongoDB as the data plane

| Without | With MongoDB |
| ------- | ------------ |
| Postgres for operational data | One database for everything |
| Elasticsearch for text search | Atlas Search built in |
| Pinecone/Weaviate for vectors | Atlas Vector Search built in |
| Client-side merging of two ranked lists | `$rankFusion` server-side in one pipeline |
| Three systems to deploy | Single platform |

The workflow uses MongoDB three ways:

1. **Operational data** — `network_inventory`, `alarms`, `incidents`, `runbooks` (read by triage and retrieval tools).
2. **Hybrid search** — `$rankFusion` over the same collections, mixing Voyage AI vectors with full-text matches in one server-side aggregation.
3. **Agent memory** — `diagnoses` and `remediation_actions` collections record every decision the agent made and every action it took. That's the audit trail; in a real deployment it's also the seed data for fine-tuning the next iteration.

One platform, all three roles. No stitching.
