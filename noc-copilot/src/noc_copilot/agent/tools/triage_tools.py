"""Triage tools: the LLM decides what context to gather per alarm.

Each tool wraps a focused MongoDB query against the operational
collections (`network_inventory`, `alarms`). The LLM picks tools based on
the alarm category — link-down alarms call `check_topology_neighbors`,
performance alarms call `query_kpi_history`, etc. — and stops once it
believes it has enough context to hand off to retrieval.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Annotated

from langchain_core.tools import InjectedToolCallId, tool
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.tools._common import make_tool_command, truncate
from noc_copilot.db.collections import ALARMS, NETWORK_INVENTORY


PHASE = "triage"


def _parse_date(d) -> datetime | None:
    if isinstance(d, datetime):
        return d
    if isinstance(d, str):
        try:
            return datetime.fromisoformat(d.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def make_triage_tools(db: AsyncIOMotorDatabase):
    """Build the triage toolset bound to a database connection."""

    @tool
    async def lookup_network_element(
        element_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Look up the network element that fired the alarm.

        Returns vendor, model, type, site, region, and current operational
        status. ALWAYS call this first — every other triage tool needs the
        element to be identified.

        Args:
            element_id: The network element ID (e.g. "gNB-SG-C01").
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one({"element_id": element_id})

        if not element:
            return make_tool_command(
                phase=PHASE,
                tool_name="lookup_network_element",
                args={"element_id": element_id},
                state_update={"network_element": None},
                summary=f"No element found with id={element_id}.",
                tool_call_id=tool_call_id,
                started_at=started,
            )

        # Strip the embedding (large) and convert _id to string for serialization
        cleaned = {k: v for k, v in element.items() if k != "embedding"}
        if "_id" in cleaned:
            cleaned["_id"] = str(cleaned["_id"])

        summary = (
            f"Found {element.get('type')} {element.get('vendor')} {element.get('model')} "
            f"at {element.get('site_name')} ({element.get('region')}). "
            f"Status: {element.get('status')}. Sectors: {element.get('sectors')}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="lookup_network_element",
            args={"element_id": element_id},
            state_update={"network_element": cleaned},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def check_recent_maintenance(
        element_id: str,
        days: int,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Check the maintenance log of a network element for recent activity.

        Often the smoking gun — "someone changed something yesterday and now
        we have an alarm." Call this whenever the alarm timing or symptoms
        could plausibly be linked to a configuration or hardware change.

        Args:
            element_id: The element ID to inspect.
            days: Lookback window in days. Use 7 for a default sweep, 1–3
                for tight correlation, 30+ for slow-burn issues.
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one({"element_id": element_id})
        recent: list[dict] = []
        if element and element.get("maintenance_log"):
            cutoff = datetime.utcnow() - timedelta(days=days)
            for entry in element["maintenance_log"]:
                d = _parse_date(entry.get("date"))
                if d and d >= cutoff:
                    recent.append({
                        "date": entry.get("date"),
                        "action": entry.get("action"),
                        "engineer": entry.get("engineer"),
                    })

        if not recent:
            summary = f"No maintenance on {element_id} in the last {days} days."
        else:
            lines = [
                f"  • {m['date']}: {truncate(m['action'], 100)} (by {m.get('engineer', 'unknown')})"
                for m in recent
            ]
            summary = f"Found {len(recent)} maintenance entries in last {days} days:\n" + "\n".join(lines)

        return make_tool_command(
            phase=PHASE,
            tool_name="check_recent_maintenance",
            args={"element_id": element_id, "days": days},
            state_update={"recent_maintenance": recent},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def find_correlated_alarms(
        site_id: str,
        region: str,
        exclude_alarm_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Find other active alarms at the same site or region.

        Helps distinguish an isolated issue (one alarm) from a wider outage
        (many alarms clustered at a site). Call this whenever you suspect
        the alarm might not be standalone.

        Args:
            site_id: Site ID from the network element (e.g. "SITE-C01").
            region: Region name (e.g. "Central").
            exclude_alarm_id: The current alarm ID, to exclude from results.
        """
        started = time.perf_counter()
        cursor = db[ALARMS].find(
            {
                "alarm_id": {"$ne": exclude_alarm_id},
                "status": "active",
                "$or": [
                    {"source": {"$regex": f".*{site_id}.*"}},
                    {"region": region},
                ],
            },
            {"embedding": 0},
        ).limit(10)
        correlated = await cursor.to_list(length=10)
        # Make _id JSON-safe
        for a in correlated:
            if "_id" in a:
                a["_id"] = str(a["_id"])

        if not correlated:
            summary = f"No correlated active alarms at {site_id} or in {region}."
        else:
            lines = [
                f"  • [{a.get('severity')}] {a.get('source')}: {truncate(a.get('description', ''), 80)}"
                for a in correlated[:5]
            ]
            summary = f"{len(correlated)} correlated alarms found:\n" + "\n".join(lines)

        return make_tool_command(
            phase=PHASE,
            tool_name="find_correlated_alarms",
            args={"site_id": site_id, "region": region},
            state_update={"correlated_alarms": correlated},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def check_topology_neighbors(
        element_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Find neighbouring network elements at the same site.

        Use this for transport/link/microwave alarms where the issue could
        be on the *other end* of a link, not the element that fired the
        alarm. Returns elements that share a site_id with the target.

        Args:
            element_id: The element to find neighbours for.
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one({"element_id": element_id})
        if not element:
            return make_tool_command(
                phase=PHASE,
                tool_name="check_topology_neighbors",
                args={"element_id": element_id},
                state_update={},
                summary=f"Element {element_id} not found, cannot resolve topology.",
                tool_call_id=tool_call_id,
                started_at=started,
            )

        site_id = element.get("site_id")
        cursor = db[NETWORK_INVENTORY].find(
            {"site_id": site_id, "element_id": {"$ne": element_id}},
            {"embedding": 0, "maintenance_log": 0},
        ).limit(20)
        neighbors = await cursor.to_list(length=20)
        for n in neighbors:
            if "_id" in n:
                n["_id"] = str(n["_id"])

        if not neighbors:
            summary = f"No topology neighbours at {site_id}."
        else:
            lines = [
                f"  • {n.get('element_id')} ({n.get('type')} {n.get('vendor')} {n.get('model')}, status={n.get('status')})"
                for n in neighbors
            ]
            summary = f"{len(neighbors)} neighbour(s) at {site_id}:\n" + "\n".join(lines)

        return make_tool_command(
            phase=PHASE,
            tool_name="check_topology_neighbors",
            args={"element_id": element_id},
            state_update={"topology_neighbors": neighbors},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def query_kpi_history(
        element_id: str,
        metric: str,
        hours: int,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Query historical KPI values for an element.

        Returns a deterministic synthetic series anchored on the alarm's
        current metrics — the last value matches the alarm, earlier values
        regress toward a baseline. Useful for distinguishing a sudden
        change (recent maintenance / hardware fault) from a gradual drift
        (capacity issue / interference).

        Args:
            element_id: Element to query.
            metric: Metric name (e.g. "ul_bler_pct", "dl_throughput_mbps",
                "rsl_dbm", "battery_voltage_v"). Must match a key in the
                alarm's metrics.
            hours: Lookback window in hours (1–24).
        """
        started = time.perf_counter()

        # Find the alarm for this element to anchor the series
        alarm = await db[ALARMS].find_one(
            {"source": element_id, "status": "active"},
            {"embedding": 0},
        )
        if not alarm or metric not in (alarm.get("metrics") or {}):
            summary = f"No alarm metric '{metric}' available for {element_id}."
            return make_tool_command(
                phase=PHASE,
                tool_name="query_kpi_history",
                args={"element_id": element_id, "metric": metric, "hours": hours},
                state_update={},
                summary=summary,
                tool_call_id=tool_call_id,
                started_at=started,
            )

        current = float(alarm["metrics"][metric])
        # Synthetic baselines: deterministic from element_id + metric
        seed = (hash(element_id + metric) & 0xFFFF) / 0xFFFF
        baseline = current * (1.0 + 0.5 * (1 - seed))  # baseline is ~25–75% above current
        # Linearly regress toward baseline going back in time
        n_samples = max(4, min(hours, 24))
        series = []
        for i in range(n_samples):
            t = i / (n_samples - 1)  # 0 → 1, oldest → newest
            v = baseline + t * (current - baseline)
            series.append(round(v, 2))

        kpi = {
            "element_id": element_id,
            "metric": metric,
            "hours": hours,
            "samples": series,
            "baseline": round(baseline, 2),
            "current": round(current, 2),
            "delta_pct": round(100 * (current - baseline) / baseline, 1) if baseline else 0.0,
        }

        trend = (
            "sudden drop" if abs(kpi["delta_pct"]) > 30 and n_samples >= 4 and series[-2] < baseline * 0.9
            else "gradual change"
        )
        summary = (
            f"{metric} on {element_id} over last {hours}h: "
            f"baseline={kpi['baseline']}, current={kpi['current']} "
            f"({kpi['delta_pct']:+.1f}%). Pattern: {trend}."
        )

        # Merge into kpi_history dict (per-metric)
        return make_tool_command(
            phase=PHASE,
            tool_name="query_kpi_history",
            args={"element_id": element_id, "metric": metric, "hours": hours},
            state_update={"kpi_history": {f"{element_id}:{metric}": kpi}},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def check_recent_config_changes(
        element_id: str,
        hours: int,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Find recent configuration-class actions on an element.

        Like `check_recent_maintenance` but filters specifically for actions
        that mention config / firmware / RET / parameter changes. Useful
        when you suspect a config drift or firmware regression.

        Args:
            element_id: Element to inspect.
            hours: Lookback window in hours.
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one({"element_id": element_id})
        changes: list[dict] = []
        if element and element.get("maintenance_log"):
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            keywords = ("config", "firmware", "ret", "parameter", "upgrade", "tilt", "azimuth")
            for entry in element["maintenance_log"]:
                d = _parse_date(entry.get("date"))
                action = (entry.get("action") or "").lower()
                if d and d >= cutoff and any(kw in action for kw in keywords):
                    changes.append({
                        "date": entry.get("date"),
                        "action": entry.get("action"),
                        "engineer": entry.get("engineer"),
                    })

        if not changes:
            summary = f"No config/firmware changes on {element_id} in last {hours}h."
        else:
            lines = [
                f"  • {c['date']}: {truncate(c['action'], 100)}" for c in changes
            ]
            summary = f"{len(changes)} config-class change(s) in last {hours}h:\n" + "\n".join(lines)

        return make_tool_command(
            phase=PHASE,
            tool_name="check_recent_config_changes",
            args={"element_id": element_id, "hours": hours},
            state_update={"config_changes": changes},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    return [
        lookup_network_element,
        check_recent_maintenance,
        find_correlated_alarms,
        check_topology_neighbors,
        query_kpi_history,
        check_recent_config_changes,
    ]
