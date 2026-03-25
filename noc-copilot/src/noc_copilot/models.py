"""Pydantic models for all NOC Copilot data types."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Alarm(BaseModel):
    alarm_id: str
    timestamp: datetime
    source: str  # network element ID
    severity: str  # critical / major / minor / warning
    category: str  # radio / transport / core / power
    description: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    region: str
    network_slice: str | None = None
    status: str = "active"  # active / acknowledged / cleared
    embedding: list[float] | None = None


class Incident(BaseModel):
    incident_id: str
    title: str
    description: str
    root_cause: str
    resolution: str
    affected_elements: list[str] = Field(default_factory=list)
    category: str  # radio / transport / core / power
    severity: str
    ttd_minutes: int  # time to detect
    ttr_minutes: int  # time to resolve
    created_at: datetime
    resolved_at: datetime | None = None
    tags: list[str] = Field(default_factory=list)
    embedding: list[float] | None = None


class Runbook(BaseModel):
    runbook_id: str
    title: str
    section_title: str
    section_number: int
    content: str
    applicable_to: list[str] = Field(default_factory=list)  # e.g. ["5G NR", "LTE"]
    domain: str  # radio / transport / core
    last_updated: datetime
    embedding: list[float] | None = None


class NetworkElement(BaseModel):
    element_id: str
    type: str  # gNodeB / eNodeB / router / switch / UPF
    vendor: str  # Ericsson / Nokia / Huawei
    model: str
    site_id: str
    site_name: str
    region: str
    sectors: int | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    maintenance_log: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "active"  # active / maintenance / degraded


class AgentDiagnosis(BaseModel):
    alarm_id: str
    probable_root_cause: str
    confidence: float = Field(ge=0.0, le=1.0)
    supporting_evidence: list[str] = Field(default_factory=list)
    similar_incidents: list[str] = Field(default_factory=list)
    relevant_runbooks: list[str] = Field(default_factory=list)
    recommended_action: str | None = None
    auto_remediable: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
