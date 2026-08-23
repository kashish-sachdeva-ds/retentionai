"""
Audit record system for RetentionAI.

Every operational decision produces an audit record — a complete,
immutable snapshot of the decision context: who was assessed, what
model produced it, what policy was applied, and what was recommended.

This transforms "Can we trust this recommendation?" from a theoretical
question into a first-class, inspectable product feature.

Records are stored in memory for the portfolio version.  In production,
these would be persisted to a database with proper retention policies.
"""

from __future__ import annotations

import datetime
import json
import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field


MAX_RECORDS = 1000


@dataclass
class AuditRecord:
    """Immutable decision record for one customer assessment."""
    decision_id: str
    customer_id: str
    model_version: str
    policy_version: str
    timestamp: str

    # Prediction
    calibrated_probability: float
    conformal_set: list[int]
    raw_probability: float | None = None

    # Decision
    economic_threshold: float = 0.0833
    above_threshold: bool = False
    recommended_action: str = ""
    decision_confidence: str = ""
    priority_score: float = 0.0

    # Context
    customer_value: float = 0.0
    uncertainty_state: str = ""
    trace_id: str | None = None

    # Review
    human_review_status: str = "pending"  # pending, approved, rejected, escalated
    reviewer: str | None = None
    review_timestamp: str | None = None

    def to_dict(self) -> dict:
        return {
            "decision_id": self.decision_id,
            "customer_id": self.customer_id,
            "model_version": self.model_version,
            "policy_version": self.policy_version,
            "timestamp": self.timestamp,
            "calibrated_probability": self.calibrated_probability,
            "conformal_set": self.conformal_set,
            "raw_probability": self.raw_probability,
            "economic_threshold": self.economic_threshold,
            "above_threshold": self.above_threshold,
            "recommended_action": self.recommended_action,
            "decision_confidence": self.decision_confidence,
            "priority_score": self.priority_score,
            "customer_value": self.customer_value,
            "uncertainty_state": self.uncertainty_state,
            "trace_id": self.trace_id,
            "human_review_status": self.human_review_status,
            "reviewer": self.reviewer,
            "review_timestamp": self.review_timestamp,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


class AuditStore:
    """Thread-safe in-memory audit record store."""

    def __init__(self, max_records: int = MAX_RECORDS):
        self._records: OrderedDict[str, AuditRecord] = OrderedDict()
        self._max = max_records
        self._lock = threading.Lock()

    def store(self, record: AuditRecord) -> None:
        with self._lock:
            self._records[record.decision_id] = record
            while len(self._records) > self._max:
                self._records.popitem(last=False)

    def get(self, decision_id: str) -> AuditRecord | None:
        with self._lock:
            return self._records.get(decision_id)

    def list_recent(self, limit: int = 50) -> list[dict]:
        with self._lock:
            items = list(self._records.values())[-limit:]
            return [r.to_dict() for r in reversed(items)]

    def count(self) -> int:
        with self._lock:
            return len(self._records)

    def find_by_customer(self, customer_id: str) -> list[dict]:
        with self._lock:
            return [
                r.to_dict()
                for r in self._records.values()
                if r.customer_id == customer_id
            ]


# Singleton audit store
audit_store = AuditStore()


def create_audit_record(
    customer_id: str,
    model_version: str,
    calibrated_probability: float,
    conformal_set: list[int],
    recommended_action: str,
    decision_confidence: str,
    priority_score: float,
    customer_value: float,
    uncertainty_state: str,
    above_threshold: bool,
    trace_id: str | None = None,
    raw_probability: float | None = None,
) -> AuditRecord:
    """Create and store a new audit record."""
    record = AuditRecord(
        decision_id=f"A-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer_id,
        model_version=model_version or "unknown",
        policy_version="priority-v1",
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        calibrated_probability=calibrated_probability,
        conformal_set=conformal_set,
        raw_probability=raw_probability,
        above_threshold=above_threshold,
        recommended_action=recommended_action,
        decision_confidence=decision_confidence,
        priority_score=priority_score,
        customer_value=customer_value,
        uncertainty_state=uncertainty_state,
        trace_id=trace_id,
    )
    audit_store.store(record)
    return record
