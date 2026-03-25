"""Triage node: enrich alarm with network element data, maintenance history, and correlated alarms."""

import logging
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.db.collections import NETWORK_INVENTORY, ALARMS

logger = logging.getLogger(__name__)


async def triage_node(state: dict, *, db: AsyncIOMotorDatabase) -> dict:
    alarm = state["alarm"]
    source_id = alarm["source"]

    # 1. Look up network element
    element = await db[NETWORK_INVENTORY].find_one({"element_id": source_id})

    # 2. Check recent maintenance (last 7 days)
    recent_maintenance = []
    if element and element.get("maintenance_log"):
        cutoff = datetime.utcnow() - timedelta(days=7)
        for entry in element["maintenance_log"]:
            entry_date = entry.get("date")
            if isinstance(entry_date, str):
                entry_date = datetime.fromisoformat(entry_date)
            if entry_date and entry_date >= cutoff:
                recent_maintenance.append(entry)

    # 3. Find correlated alarms (same site or region, active)
    correlated = []
    if element:
        cursor = db[ALARMS].find({
            "alarm_id": {"$ne": alarm["alarm_id"]},
            "status": "active",
            "$or": [
                {"source": {"$regex": f".*{element.get('site_id', 'NONE')}.*"}},
                {"region": alarm.get("region")}
            ]
        }, {"embedding": 0}).limit(10)
        correlated = await cursor.to_list(length=10)

    logger.info(
        "Triage complete: element=%s, maintenance_entries=%d, correlated_alarms=%d",
        source_id, len(recent_maintenance), len(correlated)
    )

    return {
        "network_element": element,
        "recent_maintenance": recent_maintenance,
        "correlated_alarms": correlated,
    }
