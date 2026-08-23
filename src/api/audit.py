"""Audit record system for RetentionAI with persistent SQLite/PostgreSQL storage.

Every operational decision produces an audit record — a complete,
immutable snapshot of the decision context: who was assessed, what
model produced it, what policy was applied, and what was recommended.

Records are persisted to the database (data/retentionai.db or DATABASE_URL)
and survive server restarts, page refreshes, and redeployments.
"""

from __future__ import annotations

import datetime
import json
import logging
import threading
import uuid
from dataclasses import dataclass
from typing import Any

from src.db.models import AuditRecordModel
from src.db.session import get_db_session, init_db

logger = logging.getLogger(__name__)


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

    def to_dict(self) -> dict[str, Any]:
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
    """Persistent database-backed audit record store with SQLite/PostgreSQL engine."""

    def __init__(self):
        self._lock = threading.Lock()

    def store(self, record: AuditRecord) -> None:
        """Persist audit record to database."""
        with self._lock:
            try:
                with get_db_session() as session:
                    model = AuditRecordModel(
                        decision_id=record.decision_id,
                        customer_id=record.customer_id,
                        model_version=record.model_version,
                        policy_version=record.policy_version,
                        timestamp=record.timestamp,
                        calibrated_probability=record.calibrated_probability,
                        raw_probability=record.raw_probability,
                        conformal_set_json=json.dumps(record.conformal_set),
                        economic_threshold=record.economic_threshold,
                        above_threshold=record.above_threshold,
                        recommended_action=record.recommended_action,
                        decision_confidence=record.decision_confidence,
                        priority_score=record.priority_score,
                        customer_value=record.customer_value,
                        uncertainty_state=record.uncertainty_state,
                        trace_id=record.trace_id,
                        human_review_status=record.human_review_status,
                        reviewer=record.reviewer,
                        review_timestamp=record.review_timestamp,
                    )
                    session.merge(model)
            except Exception as exc:
                logger.error("Failed to persist audit record %s to database: %s", record.decision_id, exc)

    def get(self, decision_id: str) -> AuditRecord | None:
        """Retrieve audit record by decision ID from database."""
        try:
            with get_db_session() as session:
                row = session.query(AuditRecordModel).filter_by(decision_id=decision_id).first()
                if not row:
                    return None
                return AuditRecord(
                    decision_id=row.decision_id,
                    customer_id=row.customer_id,
                    model_version=row.model_version,
                    policy_version=row.policy_version,
                    timestamp=row.timestamp,
                    calibrated_probability=row.calibrated_probability,
                    conformal_set=json.loads(row.conformal_set_json) if row.conformal_set_json else [1],
                    raw_probability=row.raw_probability,
                    economic_threshold=row.economic_threshold,
                    above_threshold=row.above_threshold,
                    recommended_action=row.recommended_action,
                    decision_confidence=row.decision_confidence,
                    priority_score=row.priority_score,
                    customer_value=row.customer_value,
                    uncertainty_state=row.uncertainty_state,
                    trace_id=row.trace_id,
                    human_review_status=row.human_review_status,
                    reviewer=row.reviewer,
                    review_timestamp=row.review_timestamp,
                )
        except Exception as exc:
            logger.error("Failed to query audit record %s: %s", decision_id, exc)
            return None

    def list_recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """List most recent audit records from database."""
        try:
            with get_db_session() as session:
                rows = (
                    session.query(AuditRecordModel)
                    .order_by(AuditRecordModel.timestamp.desc())
                    .limit(limit)
                    .all()
                )
                return [r.to_dict() for r in rows]
        except Exception as exc:
            logger.error("Failed to list recent audit records: %s", exc)
            return []

    def count(self) -> int:
        """Count total audit records in database."""
        try:
            with get_db_session() as session:
                return session.query(AuditRecordModel).count()
        except Exception as exc:
            logger.error("Failed to count audit records: %s", exc)
            return 0

    def find_by_customer(self, customer_id: str) -> list[dict[str, Any]]:
        """Find all audit records for a given customer ID."""
        try:
            with get_db_session() as session:
                rows = (
                    session.query(AuditRecordModel)
                    .filter_by(customer_id=customer_id)
                    .order_by(AuditRecordModel.timestamp.desc())
                    .all()
                )
                return [r.to_dict() for r in rows]
        except Exception as exc:
            logger.error("Failed to find audit records for customer %s: %s", customer_id, exc)
            return []

    def update_review_status(
        self,
        decision_id: str,
        status: str,
        reviewer: str = "human_operator",
    ) -> bool:
        """Update review status of a decision (approved, rejected, escalated)."""
        try:
            with get_db_session() as session:
                row = session.query(AuditRecordModel).filter_by(decision_id=decision_id).first()
                if not row:
                    return False
                row.human_review_status = status
                row.reviewer = reviewer
                row.review_timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return True
        except Exception as exc:
            logger.error("Failed to update review status for %s: %s", decision_id, exc)
            return False


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
    human_review_status: str = "pending",
) -> AuditRecord:
    """Create and store a new persistent audit record."""
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
        human_review_status=human_review_status,
    )
    audit_store.store(record)
    return record
