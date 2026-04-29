"""Remediation tools: closed-loop check → execute → verify.

The remediation phase is where an agent earns its keep over a pipeline.
A pipeline says "here's what to do, hope it works." An agent checks
preconditions (maintenance window? blast radius? backup?), takes the
action, and *verifies the alarm cleared*. If verification fails, it
loops back through routing for re-investigation.

The execute and verify steps are mocks — they don't actually reconfigure
network elements. They write to a `remediation_actions` collection so
the agent's behaviour is auditable, and they return deterministic
success/failure based on whether the chosen action matches the safe
auto-remediable pattern list. That gives the demo predictable outcomes
without faking the agent.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Annotated

from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.tools._common import make_tool_command, truncate
from noc_copilot.db.collections import (
    NETWORK_INVENTORY,
    REMEDIATION_ACTIONS,
)


PHASE = "remediation"


# Safe, reversible action patterns the agent is permitted to auto-execute.
AUTO_REMEDIABLE_PATTERNS = [
    "revert config parameter",
    "revert ret angle",
    "revert firmware",
    "restart service",
    "clear alarm",
]


def _is_auto_remediable(action: str) -> bool:
    a = (action or "").lower()
    return any(p in a for p in AUTO_REMEDIABLE_PATTERNS)


def make_remediation_tools(db: AsyncIOMotorDatabase):
    """Build the remediation toolset bound to a database connection."""

    @tool
    async def estimate_blast_radius(
        element_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Estimate the operational blast radius of acting on an element.

        Counts neighbouring elements at the same site and returns whether
        the target is at a high-traffic site. Use this BEFORE proposing
        any action that could disrupt service. If blast radius is high,
        prefer to escalate rather than auto-remediate.

        Args:
            element_id: The element you intend to act on.
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one({"element_id": element_id})
        if not element:
            return make_tool_command(
                phase=PHASE,
                tool_name="estimate_blast_radius",
                args={"element_id": element_id},
                state_update={"blast_radius": {"unknown": True}},
                summary=f"Element {element_id} not found; cannot estimate blast radius.",
                tool_call_id=tool_call_id,
                started_at=started,
            )

        site_id = element.get("site_id")
        cursor = db[NETWORK_INVENTORY].find(
            {"site_id": site_id, "element_id": {"$ne": element_id}, "status": "active"},
            {"element_id": 1, "type": 1, "_id": 0},
        )
        cohort = await cursor.to_list(length=50)
        # Heuristic: high-traffic sites are Central or major business hubs
        high_traffic_regions = {"Central"}
        is_high_traffic = element.get("region") in high_traffic_regions

        risk = "high" if (is_high_traffic and len(cohort) >= 1) else (
            "medium" if len(cohort) >= 2 else "low"
        )

        radius = {
            "site_id": site_id,
            "site_name": element.get("site_name"),
            "co_located_active_elements": len(cohort),
            "region": element.get("region"),
            "is_high_traffic": is_high_traffic,
            "risk": risk,
            "neighbors": [c.get("element_id") for c in cohort],
        }

        summary = (
            f"Blast radius for {element_id}: site={site_id} "
            f"({element.get('site_name')}, {element.get('region')}), "
            f"{len(cohort)} co-located active element(s), "
            f"high_traffic={is_high_traffic}. Risk: {risk}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="estimate_blast_radius",
            args={"element_id": element_id},
            state_update={"blast_radius": radius},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def check_maintenance_window(
        element_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Check whether the element is currently inside an approved
        maintenance window.

        Returns False if the element's status is "maintenance" (already
        being worked on; we should not pile on) and True otherwise. In a
        real deployment this would query the change-management system.

        Args:
            element_id: The element you intend to act on.
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one(
            {"element_id": element_id}, {"status": 1, "_id": 0}
        )
        status = (element or {}).get("status", "unknown")
        ok = status != "maintenance"
        summary = (
            f"Maintenance-window check for {element_id}: status={status}, "
            f"safe_to_act={ok}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="check_maintenance_window",
            args={"element_id": element_id},
            state_update={"maintenance_window_ok": ok},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def verify_backup_exists(
        element_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Verify a config/firmware backup exists for the element.

        We can only auto-revert a change if there's something to revert
        TO. This tool returns True if the element has a `config` snapshot
        (which the inventory carries by default for our seed data).

        Args:
            element_id: The element to check.
        """
        started = time.perf_counter()
        element = await db[NETWORK_INVENTORY].find_one(
            {"element_id": element_id}, {"config": 1, "_id": 0}
        )
        ok = bool(element and element.get("config"))
        summary = (
            f"Backup check for {element_id}: snapshot_present={ok}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="verify_backup_exists",
            args={"element_id": element_id},
            state_update={"backup_verified": ok},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def execute_remediation_step(
        action: str,
        params: dict,
        tool_call_id: Annotated[str, InjectedToolCallId],
        state: Annotated[NOCAgentState, InjectedState],
    ) -> str:
        """Execute a remediation action and persist it to MongoDB.

        Only call this if:
        - confidence ≥ 0.9
        - action matches one of the safe auto-remediable patterns
          (revert RET angle, revert firmware, revert config parameter,
          restart service, clear alarm)
        - blast radius is low or medium
        - maintenance_window_ok is True
        - backup_verified is True

        If any of those is false, call `recommend_for_approval` or
        `escalate` instead.

        Args:
            action: Plain-English action string. Should start with one of
                the auto-remediable patterns.
            params: Dict of action-specific parameters. e.g.
                `{"element_id": "gNB-SG-C01", "sector": 3, "from": 8, "to": 5}`.
        """
        started = time.perf_counter()
        alarm = state.get("alarm") or {}
        confidence = float(state.get("confidence", 0.0) or 0.0)

        is_safe = _is_auto_remediable(action)
        # Deterministic outcome for the demo: succeed iff action matches a
        # safe pattern and confidence is high enough. This makes the demo
        # storyline reliable without faking the agent's behaviour.
        success = is_safe and confidence >= 0.9

        record = {
            "alarm_id": alarm.get("alarm_id"),
            "element_id": (state.get("network_element") or {}).get("element_id"),
            "action": action,
            "params": params,
            "confidence": confidence,
            "outcome": "success" if success else "rejected",
            "reason": (
                "Action executed (mock)" if success
                else "Action rejected: not on safe list or confidence too low"
            ),
            "executed_at": datetime.utcnow(),
        }
        try:
            await db[REMEDIATION_ACTIONS].insert_one(dict(record))
        except Exception:
            pass  # don't let DB issues kill the demo
        # Strip the datetime before returning to the LLM
        record_for_llm = {k: v for k, v in record.items() if k != "executed_at"}

        summary = (
            f"execute_remediation_step → {record['outcome']}. "
            f"Action: {truncate(action, 100)}. {record['reason']}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="execute_remediation_step",
            args={"action": truncate(action, 80), "params": params},
            state_update={
                "execution_result": record_for_llm,
                "recommended_action": action,
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def verify_alarm_cleared(
        alarm_id: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
        state: Annotated[NOCAgentState, InjectedState],
    ) -> str:
        """Check whether the alarm has cleared after a remediation step.

        Call this AFTER `execute_remediation_step`. In this demo it
        returns "cleared" if execution succeeded, otherwise "still active"
        — a real deployment would poll alarm sources or correlate KPIs.

        Args:
            alarm_id: The alarm to check.
        """
        started = time.perf_counter()
        execution = state.get("execution_result") or {}
        cleared = execution.get("outcome") == "success"
        verification = {
            "alarm_id": alarm_id,
            "cleared": cleared,
            "checked_at": datetime.utcnow().isoformat(),
        }
        summary = f"Alarm {alarm_id}: {'cleared' if cleared else 'still active'}."
        return make_tool_command(
            phase=PHASE,
            tool_name="verify_alarm_cleared",
            args={"alarm_id": alarm_id},
            state_update={
                "verification_result": verification,
                "final_status": "auto_remediated" if cleared else "verification_failed",
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def recommend_for_approval(
        action: str,
        rationale: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Recommend a remediation action that requires human approval.

        Use when confidence is in the 0.7–0.9 band, when the action is
        outside the safe auto-list, or when blast radius is high. The
        action is written to MongoDB but NOT executed.

        Args:
            action: The recommended action.
            rationale: Why this action and why human approval is needed.
        """
        started = time.perf_counter()
        record = {
            "action": action,
            "rationale": rationale,
            "requires_approval": True,
        }
        summary = (
            f"Recommended for human approval: {truncate(action, 120)}. "
            f"Rationale: {truncate(rationale, 200)}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="recommend_for_approval",
            args={"action": truncate(action, 80)},
            state_update={
                "recommended_action": action,
                "execution_result": record,
                "final_status": "human_approval_required",
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def escalate(
        reason: str,
        suggested_direction: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Escalate to a human engineer.

        Use when confidence is below 0.7, when no safe action applies, or
        when preconditions (blast radius, maintenance window, backup) make
        auto-action unsafe. Provide a clear suggested direction so the
        on-call engineer can pick up where the agent left off.

        Args:
            reason: One sentence on why this is being escalated.
            suggested_direction: One sentence on what the engineer should
                investigate first.
        """
        started = time.perf_counter()
        summary = f"ESCALATED: {reason}. Suggested direction: {suggested_direction}."
        return make_tool_command(
            phase=PHASE,
            tool_name="escalate",
            args={"reason": truncate(reason, 100)},
            state_update={
                "recommended_action": f"ESCALATION: {suggested_direction}",
                "final_status": "escalated",
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    return [
        estimate_blast_radius,
        check_maintenance_window,
        verify_backup_exists,
        execute_remediation_step,
        verify_alarm_cleared,
        recommend_for_approval,
        escalate,
    ]
