"""
Decision trace system for RetentionAI.

Every scoring event generates a trace — a timestamped record of every
pipeline step from input validation through to the final recommendation.
This borrows the observability philosophy from modern AI platforms
(Arize, LangSmith, etc.) where every inference is inspectable.

Traces are stored in memory (last N traces) for the portfolio version.
In production, these would go to a database or observability backend.
"""

from __future__ import annotations

import datetime
import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field


MAX_TRACES = 500


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

    def to_dict(self) -> dict:
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
    """Thread-safe in-memory trace store with bounded capacity."""

    def __init__(self, max_traces: int = MAX_TRACES):
        self._traces: OrderedDict[str, DecisionTrace] = OrderedDict()
        self._max = max_traces
        self._lock = threading.Lock()

    def store(self, trace: DecisionTrace) -> None:
        with self._lock:
            self._traces[trace.trace_id] = trace
            while len(self._traces) > self._max:
                self._traces.popitem(last=False)

    def get(self, trace_id: str) -> DecisionTrace | None:
        with self._lock:
            return self._traces.get(trace_id)

    def list_recent(self, limit: int = 50) -> list[dict]:
        with self._lock:
            items = list(self._traces.values())[-limit:]
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
                for t in reversed(items)
            ]

    def count(self) -> int:
        with self._lock:
            return len(self._traces)


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
