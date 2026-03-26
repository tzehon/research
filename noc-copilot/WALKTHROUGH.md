# NOC Copilot — Code Walkthrough

A step-by-step explanation of how the agent pipeline works, following the data flow from alarm to remediation.

---

## The Big Picture

This is one agent with four steps — every alarm goes through the same pipeline in order. Think of it as automating exactly what your NOC engineer does manually, but in seconds instead of an hour.

```
Alarm → Triage → Retrieval → Diagnosis → Remediation
```

Everything runs on MongoDB as a single platform — operational data, search, and vector embeddings all in one place. No stitching together Elasticsearch for text, Pinecone for vectors, and Postgres for data.

---

## Step 1: Triage — "What are we dealing with?"

> **File:** `src/noc_copilot/agent/nodes/triage.py`

```python
# Look up the network element that fired the alarm
element = await db.network_inventory.find_one({"element_id": alarm["source"]})

# Check: was there recent maintenance on this element? (last 7 days)
# This is often the smoking gun — "someone changed something yesterday"
for entry in element["maintenance_log"]:
    if entry["date"] >= seven_days_ago:
        recent_maintenance.append(entry)

# Find other active alarms at the same site or region
# Are we looking at an isolated issue or a wider outage?
correlated = await db.alarms.find({
    "status": "active",
    "$or": [{"source": /same site/}, {"region": alarm["region"]}]
})
```

Plain MongoDB queries — no search indexes needed here. We're just enriching the alarm with context.

**Output → passes to next step:** the network element details, any recent maintenance, and correlated alarms.

---

## Step 2: Retrieval — "Have we seen this before?"

> **File:** `src/noc_copilot/agent/nodes/retrieval.py`

```python
# Generate an embedding of the alarm description
query_embedding = voyage.embed(
    "critical radio Excessive UL BLER on Cell-3...",
    model="voyage-4-large",     # 1024 dimensions
    input_type="query"          # asymmetric — optimized for queries vs documents
)

# Hybrid search: combines vector similarity + keyword matching
# in a SINGLE aggregation pipeline, entirely server-side
db.incidents.aggregate([{
    "$rankFusion": {
        "pipelines": {
            "vector": [{"$vectorSearch": { queryVector: embedding, limit: 5 }}],
            "text":   [{"$search": { compound: { must: [{ text: "UL BLER..." }] }}}]
        },
        "weights": { "vector": 0.6, "text": 0.4 }
    }
}])

# Same hybrid search on runbooks
db.runbooks.aggregate([{ "$rankFusion": { ... } }])
```

This is where MongoDB's hybrid search shines. The vector component catches semantic matches — an alarm saying "packet loss" finds an incident titled "uplink quality degradation" even though the words are completely different. The text component catches exact terms — if the alarm says "RET" and a runbook says "RET", that's a direct hit. `$rankFusion` combines both ranked lists without you having to merge results client-side.

**Output → passes to next step:** top 5 similar past incidents and top 5 relevant runbook sections.

---

## Step 3: Diagnosis — "What's the root cause?"

> **File:** `src/noc_copilot/agent/nodes/diagnosis.py`

```python
# Send ALL gathered context to Claude in XML-tagged sections
response = claude.messages.create(
    model="claude-sonnet",
    prompt=f"""
        <alarm>{alarm details, metrics}</alarm>
        <network_element>{type, vendor, model, site}</network_element>
        <recent_maintenance>{RET tilt adjustment yesterday}</recent_maintenance>
        <correlated_alarms>{any related alarms}</correlated_alarms>
        <similar_past_incidents>{top 5 with root causes and resolutions}</similar_past_incidents>
        <relevant_runbook_sections>{top 5 procedures}</relevant_runbook_sections>

        Return a JSON diagnosis with confidence score.
    """
)
```

Claude returns structured JSON:

```json
{
    "probable_root_cause": "RET antenna tilt was over-adjusted during maintenance",
    "confidence": 0.92,
    "reasoning": "The element had a RET adjustment 24 hours prior...",
    "supporting_evidence": ["maintenance log shows...", "similar incident..."],
    "differential_diagnoses": [
        {"cause": "Hardware failure", "confidence": 0.06,
         "why_less_likely": "gradual pattern, not sudden"}
    ]
}
```

Claude isn't guessing — it's reasoning over real evidence from your database. The similar incident scored 0.943 cosine similarity, the maintenance log shows a change yesterday, and the runbook confirms the procedure. The confidence score is calibrated: 0.9+ means strong match with corroborating evidence.

**Output → passes to next step:** the diagnosis and confidence score.

---

## Step 4: Remediation — "What do we do about it?"

> **File:** `src/noc_copilot/agent/nodes/remediation.py`

```python
# Claude adapts the past resolution to THIS specific element
action = claude.messages.create(
    prompt=f"""
        <diagnosis>{root cause, confidence}</diagnosis>
        <past_resolutions>{top 2 incident resolutions}</past_resolutions>
        <runbook_steps>{top 2 procedures}</runbook_steps>
        Recommend a specific action for THIS alarm.
    """
)
# → "revert RET angle on gNB-SITE-A12-001 Sector 3 from 8 to 5 degrees"

# Auto-remediation gate: TWO conditions must be true
auto = (
    confidence > 0.9                              # high confidence
    AND action matches ["revert RET angle", ...]  # pre-approved safe action
)

# Persist everything for audit trail
db.diagnoses.insert_one({
    alarm, diagnosis, confidence, action, evidence_chain
})
```

### Three outcomes

| Confidence | Action | Result |
|-----------|--------|--------|
| > 0.9 | Matches pre-approved pattern | Auto-remediate (no human needed) |
| 0.7 – 0.9 | Any | Recommend action, require human approval |
| < 0.7 | Any | Escalate to engineer with investigation direction |

The pre-approved actions are low-risk, reversible operations:
- `revert config parameter`
- `revert RET angle`
- `revert firmware`
- `restart service`
- `clear alarm`

The evidence chain records every step so you can audit exactly why the agent made that decision. Critical for regulated environments.

---

## From Pipeline to Agent

The four steps above work — but they're a **pipeline**, not an agent. Every alarm runs the same steps in the same order, regardless of what happens along the way. A link-down alarm gets the same three triage queries as a CPU-high alarm. A low-confidence diagnosis still marches forward to remediation. The LLM never decides what to do next — it fills in a slot and moves on.

So what makes an LLM into an agent?

**An agent decides its own next step based on what it's learned so far.** A pipeline has a fixed path through the code. An agent has a graph with branches, loops, and tool calls — and the LLM is the one choosing which edges to follow.

Here's how each step of this pipeline could become agentic, in order of impact:

### Agentic triage: let the LLM choose what to investigate

Currently, triage runs the same three DB queries for every alarm: look up the element, check maintenance, find correlated alarms. But a link-down alarm on a microwave radio needs different context than a CPU-high alarm on a core router.

Give the LLM tools instead of hardcoding the queries:

```python
tools = [
    lookup_element,            # "what device is this?"
    check_maintenance,         # "did someone change something recently?"
    find_correlated_alarms,    # "is this part of a wider outage?"
    check_topology_neighbors,  # "what's on the other end of this link?"
    query_perf_metrics,        # "show me the KPI trend for the last 24h"
    check_config_changes,      # "was there a config push recently?"
]

# The LLM calls tools in a loop until it decides it has enough context
triage_agent = create_react_agent(model, tools)
```

Now the LLM sees a link-down alarm and thinks: "I should check both ends of this link" — something the hardcoded version never does. For a performance degradation alarm, it pulls KPI history. For a config-drift alarm, it checks recent config pushes. The LLM is making decisions, not just filling slots.

### Agentic retrieval: search → evaluate → refine

Currently, retrieval fires one hybrid search and moves on, even if the results are poor. An agent would evaluate the results and try again:

```
retrieval → assess results ─── good (score > 0.6) ──→ diagnosis
                │
                └── poor results ──→ reformulate query ──→ retrieval (retry)
```

```python
def route_after_retrieval(state):
    top_score = state["similar_incidents"][0]["score"] if state["similar_incidents"] else 0
    if top_score > 0.6 or state.get("retrieval_attempts", 0) >= 2:
        return "diagnosis"
    return "reformulate"   # LLM rewrites the search query and loops back

graph.add_conditional_edges("retrieval", route_after_retrieval)
graph.add_edge("reformulate", "retrieval")  # loop
```

The key difference: the system reacts to what it found (or didn't find) rather than blindly proceeding.

### Agentic diagnosis: low confidence → go back for more evidence

This is the highest-value loop. If diagnosis returns low confidence, the current pipeline just labels it "ESCALATION REQUIRED" and gives up. An agent would try harder:

```
diagnosis ─── confidence ≥ 0.7 ──→ remediation
    │
    └── confidence < 0.7 ──→ retrieval (with refined query from diagnosis hints)
```

```python
def route_after_diagnosis(state):
    if state["confidence"] >= 0.7:
        return "remediation"
    if state.get("diagnosis_retries", 0) < 2:
        return "retrieval"     # loop back with better search terms
    return "escalation"        # give up after 2 attempts

graph.add_conditional_edges("diagnosis", route_after_diagnosis)
```

The diagnosis node already produces differential diagnoses — "might be a fiber cut, might be hardware failure". On a retry, the retrieval node uses those hypotheses to search more specifically instead of repeating the same generic query. The agent is refining its own understanding.

### Agentic remediation: validate before acting

Currently, remediation asks the LLM for one action string. An agent would plan and validate:

```python
remediation_tools = [
    check_maintenance_window,   # "is there an active change window?"
    verify_backup_exists,       # "can we roll back if this goes wrong?"
    estimate_blast_radius,      # "what services depend on this element?"
    execute_remediation_step,   # actually perform the action
    verify_alarm_cleared,       # "did it work?"
]
```

Instead of outputting "revert RET angle to 5 degrees" and hoping someone executes it correctly, the agent checks preconditions, executes the change, and verifies the result — a closed loop.

### The spectrum

```
Pipeline                                          Agent
(current)                                       (target)
   │                                                │
   ▼                                                ▼
Fixed steps,         Conditional        Tool-calling     Fully autonomous:
no branching,        edges: retry       loops: LLM       investigate, diagnose,
LLM fills slots      on low scores     chooses actions   act, verify, learn
```

You don't have to go all the way to the right. Even adding one conditional edge (diagnosis → retry retrieval on low confidence) transforms the system from "four sequential LLM calls" to something that adapts to what it finds. That's the core shift: **the LLM stops being a function that gets called and starts being the thing that decides what to call next.**

---

## The Result

```
Manual NOC process:  ~45 min to diagnose + ~30 min to resolve = ~75 min
NOC Copilot:         ~8 seconds
```

### Why MongoDB as the single platform

| Without MongoDB | With MongoDB |
|----------------|-------------|
| Postgres for operational data | One database for everything |
| Elasticsearch for text search | Full Text Search built in |
| Pinecone/Weaviate for vectors | Vector Search built in |
| Client-side result merging | `$rankFusion` server-side in one pipeline |
| 3+ systems to deploy and maintain | Single platform |

One aggregation pipeline does it all — operational data, full-text search, vector search, and hybrid search. No separate vector database, no separate search engine, no client-side result merging.
