"""Streamlit dashboard for NOC Copilot."""

import asyncio
import json
import threading
import time

import streamlit as st

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.db.collections import ALARMS, INCIDENTS, RUNBOOKS, NETWORK_INVENTORY, DIAGNOSES
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.search.full_text_search import search_runbooks_fulltext
from noc_copilot.search.hybrid_search import hybrid_search_runbooks, hybrid_search_incidents
from noc_copilot.agent.graph import build_noc_agent
from noc_copilot.agent.state import NOCAgentState


@st.cache_resource
def _get_background_loop():
    """Create a background event loop for running async code from Streamlit.

    Uses a dedicated daemon thread so ``run_coroutine_threadsafe`` never
    conflicts with Streamlit's own event loop.
    """
    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    return loop


@st.cache_resource
def init_resources():
    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    sync_db = MongoDBConnection.get_sync_db()
    embedder = VoyageEmbedder(api_key=settings.voyage_api_key, model=settings.voyage_model)
    return db, sync_db, embedder


def run_async(coro):
    """Submit a coroutine to the background loop and block until done."""
    return asyncio.run_coroutine_threadsafe(coro, _get_background_loop()).result()


async def _count_documents(collection, filter=None):
    """Run count_documents inside the background event loop."""
    return await collection.count_documents(filter or {})


async def _find_to_list(collection, filter, projection=None, sort=None, limit=None):
    """Run a Motor find().to_list() entirely inside the async event loop.

    Motor's to_list() calls get_event_loop() at invocation time, so the whole
    cursor chain must be built inside the background loop — not in Streamlit's
    ScriptRunner thread.
    """
    cursor = collection.find(filter, projection)
    if sort:
        cursor = cursor.sort(*sort)
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=limit or 100)


SEVERITY_COLORS = {
    "critical": "🔴",
    "major": "🟠",
    "minor": "🟡",
    "warning": "🔵",
}


def main():
    st.set_page_config(page_title="NOC Copilot", page_icon="🛰️", layout="wide")
    st.title("🛰️ NOC Copilot")
    st.caption("Autonomous Network Incident Resolution Agent — MongoDB × Voyage AI × Anthropic × LangGraph")

    db, sync_db, embedder = init_resources()

    # Sidebar — Active Alarms
    st.sidebar.header("Active Alarms")
    alarms = run_async(
        _find_to_list(db[ALARMS], {"status": "active"}, projection={"embedding": 0}, sort=("severity", 1), limit=20)
    )

    severity_order = {"critical": 0, "major": 1, "minor": 2, "warning": 3}
    alarms.sort(key=lambda a: severity_order.get(a.get("severity", "warning"), 4))

    selected_alarm = None
    for alarm in alarms:
        sev = alarm.get("severity", "")
        emoji = SEVERITY_COLORS.get(sev, "⚪")
        label = f"{emoji} {alarm['alarm_id']} — {alarm.get('description', '')[:50]}..."
        if st.sidebar.button(label, key=alarm["alarm_id"]):
            st.session_state["selected_alarm"] = alarm

    if "selected_alarm" in st.session_state:
        selected_alarm = st.session_state["selected_alarm"]

    # Metrics bar
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Active Alarms", len(alarms))
    with col2:
        critical = sum(1 for a in alarms if a.get("severity") == "critical")
        st.metric("Critical", critical)
    with col3:
        inc_count = run_async(_count_documents(db[INCIDENTS]))
        st.metric("Historical Incidents", inc_count)
    with col4:
        rb_count = run_async(_count_documents(db[RUNBOOKS]))
        st.metric("Runbook Sections", rb_count)

    # Tabs
    tab1, tab2, tab3 = st.tabs(["Agent Flow", "Search Explorer", "Data Explorer"])

    with tab1:
        if selected_alarm:
            st.subheader(f"Processing: {selected_alarm['alarm_id']}")
            sev = selected_alarm.get("severity", "")
            st.markdown(f"**Severity:** {SEVERITY_COLORS.get(sev, '')} {sev.upper()}")
            st.markdown(f"**Category:** {selected_alarm.get('category', '')}")
            st.markdown(f"**Source:** {selected_alarm.get('source', '')}")
            st.markdown(f"**Description:** {selected_alarm.get('description', '')}")

            if st.button("🚀 Run Agent Pipeline", type="primary"):
                with st.spinner("Running NOC Copilot agent pipeline..."):
                    start = time.time()
                    agent = build_noc_agent(db, embedder)
                    initial_state: NOCAgentState = {
                        "alarm": selected_alarm,
                        "network_element": None,
                        "recent_maintenance": [],
                        "correlated_alarms": [],
                        "similar_incidents": [],
                        "relevant_runbooks": [],
                        "diagnosis": None,
                        "confidence": 0.0,
                        "recommended_action": None,
                        "auto_remediable": False,
                        "evidence_chain": [],
                        "messages": [],
                    }
                    result = run_async(agent.ainvoke(initial_state))
                    elapsed = time.time() - start

                st.success(f"Pipeline complete in {elapsed:.1f}s")

                # Triage
                with st.expander("Step 1: Triage & Enrichment", expanded=True):
                    source_id = selected_alarm.get("source", "?")
                    region = selected_alarm.get("region", "?")
                    el = result.get("network_element")
                    site_id = el.get("site_id", "?") if el else "?"
                    st.code(
                        f'db.network_inventory.find_one({{ element_id: "{source_id}" }})\n'
                        f'\n'
                        f'db.alarms.find({{\n'
                        f'  status: "active",\n'
                        f'  $or: [{{ source: /.*{site_id}.*/ }}, {{ region: "{region}" }}]\n'
                        f'}})',
                        language="javascript",
                    )
                    if el:
                        st.json({k: v for k, v in el.items() if k not in ("_id", "embedding", "maintenance_log", "config")})
                    maint = result.get("recent_maintenance", [])
                    if maint:
                        st.warning(f"⚠️ {len(maint)} recent maintenance entries found")
                        for m in maint:
                            st.write(f"- {m.get('date')}: {m.get('action')}")
                    correlated = result.get("correlated_alarms", [])
                    if correlated:
                        st.info(f"🔗 {len(correlated)} correlated active alarm(s) found")
                        for a in correlated[:5]:
                            st.write(f"- **[{a.get('severity', '').upper()}]** {a.get('description', '')[:100]}")
                    else:
                        st.write("No correlated alarms found.")

                # Retrieval
                with st.expander("Step 2: Knowledge Retrieval", expanded=True):
                    category = selected_alarm.get("category", "?")
                    desc_short = selected_alarm.get("description", "")[:60]
                    st.code(
                        f'query_embedding = voyage.embed("{desc_short}...",\n'
                        f'                              model="voyage-4-large", input_type="query")  // 1024 dims\n'
                        f'\n'
                        f'db.incidents.aggregate([{{ $rankFusion: {{\n'
                        f'  pipelines: {{\n'
                        f'    vector: [{{ $vectorSearch: {{ queryVector: query_embedding,\n'
                        f'               filter: {{ category: "{category}" }}, limit: 5 }} }}],\n'
                        f'    text:   [{{ $search: {{ compound: {{ must: [{{ text: ... }}] }} }} }}]\n'
                        f'  }}, weights: {{ vector: 0.6, text: 0.4 }}\n'
                        f'}} }}])\n'
                        f'\n'
                        f'db.runbooks.aggregate([...same $rankFusion pattern, domain="{category}"...])',
                        language="javascript",
                    )
                    incs = result.get("similar_incidents", [])
                    if incs:
                        st.markdown("**Similar Past Incidents (Hybrid Search — $rankFusion):**")
                        for inc in incs[:5]:
                            st.markdown(
                                f"- `{inc.get('score', 0):.4f}` **{inc.get('incident_id', '')}** — "
                                f"{inc.get('title', '')}  \n"
                                f"  Root cause: {inc.get('root_cause', '')[:100]}"
                            )
                    rbs = result.get("relevant_runbooks", [])
                    if rbs:
                        st.markdown("**Relevant Runbook Sections (Hybrid Search — $rankFusion):**")
                        for rb in rbs[:5]:
                            st.markdown(
                                f"- `{rb.get('score', 0):.4f}` **{rb.get('runbook_id', '')}** — "
                                f"{rb.get('title', '')} — {rb.get('section_title', '')}"
                            )

                # Diagnosis
                with st.expander("Step 3: AI Diagnosis", expanded=True):
                    st.code(
                        'claude.messages.create(model="claude-sonnet", prompt=f"""\n'
                        '  <alarm>{description, severity, category}</alarm>\n'
                        '  <network_element>{type, vendor, model, site}</network_element>\n'
                        '  <maintenance>{recent actions}</maintenance>\n'
                        '  <similar_incidents>{top 5 with root causes}</similar_incidents>\n'
                        '  <runbooks>{top 5 sections}</runbooks>\n'
                        '""")\n'
                        '// Returns: { probable_root_cause, confidence, reasoning,\n'
                        '//            supporting_evidence[], differential_diagnoses[] }',
                        language="python",
                    )
                    diag = result.get("diagnosis", {})
                    conf = result.get("confidence", 0)
                    st.progress(conf, text=f"Confidence: {conf:.0%}")
                    st.markdown(f"**Root Cause:** {diag.get('probable_root_cause', 'Unknown')}")
                    if diag.get("reasoning"):
                        st.markdown(f"**Reasoning:** {diag['reasoning']}")
                    evidence = diag.get("supporting_evidence", [])
                    if evidence:
                        st.markdown("**Supporting Evidence:**")
                        for e in evidence:
                            st.markdown(f"- ✓ {e}")
                    diffs = diag.get("differential_diagnoses", [])
                    if diffs:
                        st.markdown("**Differential Diagnoses:**")
                        for d in diffs:
                            st.markdown(f"- {d.get('cause', '')} ({d.get('confidence', 0):.0%}) — {d.get('why_less_likely', '')}")

                # Remediation
                with st.expander("Step 4: Remediation", expanded=True):
                    st.code(
                        'claude.messages.create(model="claude-sonnet", prompt=f"""\n'
                        '  <alarm>{alarm}</alarm>\n'
                        '  <diagnosis>{root_cause, confidence}</diagnosis>\n'
                        '  <past_resolutions>{top 2 incident resolutions}</past_resolutions>\n'
                        '  <runbook_steps>{top 2 procedures}</runbook_steps>\n'
                        '""")  // Returns: specific remediation action\n'
                        '\n'
                        'auto = confidence > 0.9 AND action in\n'
                        '  ["revert config parameter", "revert RET angle", ...]\n'
                        '\n'
                        'db.diagnoses.insert_one({ alarm, diagnosis, action, evidence_chain })',
                        language="python",
                    )
                    action = result.get("recommended_action", "")
                    conf = result.get("confidence", 0)
                    auto = result.get("auto_remediable", False)
                    if conf >= 0.9 and auto:
                        st.success(f"✅ AUTO-REMEDIATION: {action}")
                    elif conf >= 0.7:
                        st.warning(f"⚠️ RECOMMENDED (approval needed): {action}")
                    else:
                        st.error(f"🚨 ESCALATION REQUIRED: {action}")
                    evidence_chain = result.get("evidence_chain", [])
                    if evidence_chain:
                        st.markdown("**Evidence Chain:**")
                        for i, e in enumerate(evidence_chain, 1):
                            st.markdown(f"{i}. {e}")

                # Timing
                st.markdown("---")
                col1, col2 = st.columns(2)
                with col1:
                    st.metric("NOC Copilot", f"{elapsed:.1f}s")
                with col2:
                    st.metric("Manual Process (est.)", "~75 min")
        else:
            st.info("Select an alarm from the sidebar to process.")

    with tab2:
        st.subheader("Search Explorer")

        search_type = st.selectbox(
            "Search Type",
            ["Hybrid $rankFusion (Incidents)", "Full-Text Search (Runbooks)", "Hybrid $rankFusion (Runbooks)", "Hybrid $scoreFusion (Runbooks)"],
        )
        query = st.text_input("Search Query", value="UL BLER high block error rate 5G NR")

        col1, col2 = st.columns(2)
        with col1:
            domain_filter = st.selectbox("Domain Filter", [None, "radio", "transport", "core", "power"])
        with col2:
            limit = st.slider("Result Limit", 1, 20, 5)

        if st.button("🔍 Search"):
            with st.spinner("Searching..."):
                embedding = embedder.embed_query(query)

            domain_str = f', filter: {{ domain: "{domain_filter}" }}' if domain_filter else ""
            category_str = f', filter: {{ category: "{domain_filter}" }}' if domain_filter else ""

            if search_type == "Hybrid $rankFusion (Incidents)":
                st.code(
                    f'db.incidents.aggregate([{{ $rankFusion: {{\n'
                    f'  input: {{\n'
                    f'    vector: [{{ $vectorSearch: {{ query: "{query}"{category_str}, limit: {limit} }} }}],\n'
                    f'    text:   [{{ $search: {{ text: {{ query: "{query}" }} }} }}]\n'
                    f'  }},\n'
                    f'  weights: {{ vector: 0.6, text: 0.4 }}\n'
                    f'}} }}])',
                    language="javascript",
                )
            elif search_type == "Full-Text Search (Runbooks)":
                filter_line = f'\n  , filter: {{ domain: "{domain_filter}" }}' if domain_filter else ""
                st.code(
                    f'db.runbooks.aggregate([{{ $search: {{\n'
                    f'  text: {{ query: "{query}", path: ["title", "section_title", "content"] }}{filter_line}\n'
                    f'}} }}])\n'
                    f'.limit({limit})',
                    language="javascript",
                )
            else:
                method = "rankFusion" if "rankFusion" in search_type else "scoreFusion"
                st.code(
                    f'db.runbooks.aggregate([{{ ${method}: {{\n'
                    f'  input: {{\n'
                    f'    vector: [{{ $vectorSearch: {{ query: "{query}"{domain_str}, limit: {limit} }} }}],\n'
                    f'    text:   [{{ $search: {{ text: {{ query: "{query}" }} }} }}]\n'
                    f'  }},\n'
                    f'  weights: {{ vector: 0.6, text: 0.4 }}\n'
                    f'}} }}])',
                    language="javascript",
                )

            with st.spinner("Running search..."):
                if search_type == "Hybrid $rankFusion (Incidents)":
                    results = run_async(hybrid_search_incidents(db[INCIDENTS], query, embedding, category=domain_filter, limit=limit, method="rankFusion"))
                elif search_type == "Full-Text Search (Runbooks)":
                    results = run_async(search_runbooks_fulltext(db[RUNBOOKS], query, domain=domain_filter, limit=limit))
                elif search_type == "Hybrid $rankFusion (Runbooks)":
                    results = run_async(hybrid_search_runbooks(db[RUNBOOKS], query, embedding, domain=domain_filter, limit=limit, method="rankFusion"))
                else:
                    results = run_async(hybrid_search_runbooks(db[RUNBOOKS], query, embedding, domain=domain_filter, limit=limit, method="scoreFusion"))

            st.markdown(f"**{len(results)} results found**")
            for i, r in enumerate(results, 1):
                with st.expander(f"Result {i} — Score: {r.get('score', 0):.4f} — {r.get('title', r.get('incident_id', ''))}"):
                    display = {k: v for k, v in r.items() if k not in ("_id", "embedding")}
                    # Truncate scoreDetails for display
                    if "scoreDetails" in display:
                        st.json(display["scoreDetails"])
                        del display["scoreDetails"]
                    st.json(display)

    with tab3:
        st.subheader("Data Explorer")
        collection = st.selectbox("Collection", [INCIDENTS, RUNBOOKS, ALARMS, NETWORK_INVENTORY, DIAGNOSES])
        docs = run_async(_find_to_list(db[collection], {}, projection={"embedding": 0}, limit=20))
        st.markdown(f"**Showing {len(docs)} documents from `{collection}`**")
        for doc in docs:
            doc.pop("_id", None)
            with st.expander(doc.get("title", doc.get("alarm_id", doc.get("element_id", doc.get("incident_id", "Document"))))):
                st.json(doc)


if __name__ == "__main__":
    main()
