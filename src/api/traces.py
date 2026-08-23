"""Decision trace system for RetentionAI with persistent database storage.

Every scoring event generates a trace — a timestamped record of every
pipeline step from input validation through to the final recommendation.

Traces are stored durably in the database (SQLite/PostgreSQL) and can be
inspected for transparency and pipeline performance debugging.
"""

from __future__ import annotations

import datetime
import json
import logging
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from src.db.models import DecisionTraceModel
from src.db.session import get_db_session

logger = logging.getLogger(__name__)


@dataclass
class TraceStep:
    """One step in a decision trace."""
    step_name: str
    timestamp: str
    duration_ms: float
    status: str  # "completed", "skipped", "error"
    details: dict = field(default_factory=dict)


@dataclass
class DecisionTrace:
    """Complete trace of a scoring event."""
    trace_id: str
    customer_id: str
    started_at: str
    completed_at: str | None = None
    total_duration_ms: float = 0.0
    steps: list[TraceStep] = field(default_factory=list)
    model_version: str | None = None
    final_recommendation: str | None = None
    calibrated_probability: float | None = None
    conformal_set: list[int] | None = None
    priority_score: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "customer_id": self.customer_id,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "total_duration_ms": self.total_duration_ms,
            "model_version": self.model_version,
            "final_recommendation": self.final_recommendation,
            "calibrated_probability": self.calibrated_probability,
            "conformal_set": self.conformal_set,
            "priority_score": self.priority_score,
            "steps": [
                {
                    "step_name": s.step_name,
                    "timestamp": s.timestamp,
                    "duration_ms": s.duration_ms,
                    "status": s.status,
                    "details": s.details,
                }
                for s in self.steps
            ],
        }


class TraceStore:
    """Persistent database-backed trace store with SQLite/PostgreSQL engine."""

    def __init__(self):
        self._lock = threading.Lock()

    def store(self, trace: DecisionTrace) -> None:
        """Persist decision trace to database."""
        with self._lock:
            try:
                with get_db_session() as session:
                    model = DecisionTraceModel(
                        trace_id=trace.trace_id,
                        customer_id=trace.customer_id,
                        started_at=trace.started_at,
                        completed_at=trace.completed_at,
                        total_duration_ms=trace.total_duration_ms,
                        model_version=trace.model_version,
                        final_recommendation=trace.final_recommendation,
                        calibrated_probability=trace.calibrated_probability,
                        conformal_set_json=json.dumps(trace.conformal_set) if trace.conformal_set else None,
                        priority_score=trace.priority_score,
                        steps_json=json.dumps([
                            {
                                "step_name": s.step_name,
                                "timestamp": s.timestamp,
                                "duration_ms": s.duration_ms,
                                "status": s.status,
                                "details": s.details,
                            }
                            for s in trace.steps
                        ]),
                    )
                    session.merge(model)
            except Exception as exc:
                logger.error("Failed to persist decision trace %s to database: %s", trace.trace_id, exc)

    def get(self, trace_id: str) -> DecisionTrace | None:
        """Retrieve decision trace by ID from database."""
        try:
            with get_db_session() as session:
                row = session.query(DecisionTraceModel).filter_by(trace_id=trace_id).first()
                if not row:
                    return None
                steps_data = json.loads(row.steps_json) if row.steps_json else []
                steps = [
                    TraceStep(
                        step_name=s.get("step_name", ""),
                        timestamp=s.get("timestamp", ""),
                        duration_ms=s.get("duration_ms", 0.0),
                        status=s.get("status", "completed"),
                        details=s.get("details", {}),
                    )
                    for s in steps_data
                ]
                return DecisionTrace(
                    trace_id=row.trace_id,
                    customer_id=row.customer_id,
                    started_at=row.started_at,
                    completed_at=row.completed_at,
                    total_duration_ms=row.total_duration_ms,
                    steps=steps,
                    model_version=row.model_version,
                    final_recommendation=row.final_recommendation,
                    calibrated_probability=row.calibrated_probability,
                    conformal_set=json.loads(row.conformal_set_json) if row.conformal_set_json else None,
                    priority_score=row.priority_score,
                )
        except Exception as exc:
            logger.error("Failed to query decision trace %s: %s", trace_id, exc)
            return None

    def list_recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """List most recent decision traces from database."""
        try:
            with get_db_session() as session:
                rows = (
                    session.query(DecisionTraceModel)
                    .order_by(DecisionTraceModel.started_at.desc())
                    .limit(limit)
                    .all()
                )
                return [
                    {
                        "trace_id": t.trace_id,
                        "customer_id": t.customer_id,
                        "started_at": t.started_at,
                        "total_duration_ms": t.total_duration_ms,
                        "final_recommendation": t.final_recommendation,
                        "calibrated_probability": t.calibrated_probability,
                        "priority_score": t.priority_score,
                    }
                    for t in rows
                ]
        except Exception as exc:
            logger.error("Failed to list recent traces: %s", exc)
            return []

    def count(self) -> int:
        """Count total decision traces in database."""
        try:
            with get_db_session() as session:
                return session.query(DecisionTraceModel).count()
        except Exception as exc:
            logger.error("Failed to count traces: %s", exc)
            return 0


# Singleton trace store for the application
trace_store = TraceStore()


class TraceBuilder:
    """Context manager for building a decision trace step by step."""

    def __init__(self, customer_id: str, model_version: str | None = None):
        self.trace = DecisionTrace(
            trace_id=f"D-{uuid.uuid4().hex[:8].upper()}",
            customer_id=customer_id,
            started_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            model_version=model_version,
        )
        self._step_start: float | None = None

    def add_step(
        self,
        step_name: str,
        *,
        status: str = "completed",
        duration_ms: float = 0.0,
        details: dict | None = None,
    ) -> None:
        self.trace.steps.append(
            TraceStep(
                step_name=step_name,
                timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                duration_ms=round(duration_ms, 2),
                status=status,
                details=details or {},
            )
        )

    def complete(
        self,
        *,
        recommendation: str | None = None,
        calibrated_probability: float | None = None,
        conformal_set: list[int] | None = None,
        priority_score: float | None = None,
        total_duration_ms: float = 0.0,
    ) -> DecisionTrace:
        self.trace.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.trace.total_duration_ms = round(total_duration_ms, 2)
        self.trace.final_recommendation = recommendation
        self.trace.calibrated_probability = calibrated_probability
        self.trace.conformal_set = conformal_set
        self.trace.priority_score = priority_score
        trace_store.store(self.trace)
        return self.trace
