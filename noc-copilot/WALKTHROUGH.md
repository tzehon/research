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
