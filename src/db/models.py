"""SQLAlchemy database models for RetentionAI persistent storage.

Supports SQLite (default) and PostgreSQL (via DATABASE_URL).
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class AuditRecordModel(Base):
    """Immutable audit record for every retention decision."""
    __tablename__ = "audit_records"

    decision_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), nullable=False, index=True)
    model_version = Column(String(64), nullable=False)
    policy_version = Column(String(64), nullable=False, default="priority-v1")
    timestamp = Column(String(64), nullable=False, index=True)
    calibrated_probability = Column(Float, nullable=False)
    raw_probability = Column(Float, nullable=True)
    conformal_set_json = Column(Text, nullable=False, default="[1]")
    economic_threshold = Column(Float, nullable=False, default=0.0833)
    above_threshold = Column(Boolean, nullable=False, default=True)
    recommended_action = Column(String(128), nullable=False)
    decision_confidence = Column(String(32), nullable=False)
    priority_score = Column(Float, nullable=False)
    customer_value = Column(Float, nullable=False)
    uncertainty_state = Column(String(64), nullable=False)
    trace_id = Column(String(64), nullable=True, index=True)
    human_review_status = Column(String(32), nullable=False, default="pending")
    reviewer = Column(String(64), nullable=True)
    review_timestamp = Column(String(64), nullable=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "customer_id": self.customer_id,
            "model_version": self.model_version,
            "policy_version": self.policy_version,
            "timestamp": self.timestamp,
            "calibrated_probability": self.calibrated_probability,
            "raw_probability": self.raw_probability,
            "conformal_set": json.loads(self.conformal_set_json) if self.conformal_set_json else [1],
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


class DecisionTraceModel(Base):
    """Step-by-step execution trace for transparency and pipeline debugging."""
    __tablename__ = "decision_traces"

    trace_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), nullable=False, index=True)
    started_at = Column(String(64), nullable=False, index=True)
    completed_at = Column(String(64), nullable=True)
    total_duration_ms = Column(Float, nullable=False)
    model_version = Column(String(64), nullable=True)
    final_recommendation = Column(String(128), nullable=True)
    calibrated_probability = Column(Float, nullable=True)
    conformal_set_json = Column(Text, nullable=True)
    priority_score = Column(Float, nullable=True)
    steps_json = Column(Text, nullable=False, default="[]")

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
            "conformal_set": json.loads(self.conformal_set_json) if self.conformal_set_json else None,
            "priority_score": self.priority_score,
            "steps": json.loads(self.steps_json) if self.steps_json else [],
        }


class PredictionEventModel(Base):
    """Event log of raw predictions for temporal aggregation and stream monitoring."""
    __tablename__ = "prediction_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(String(64), nullable=False, index=True)
    customer_id = Column(String(64), nullable=False, index=True)
    timestamp = Column(String(64), nullable=False, index=True)
    model_version = Column(String(64), nullable=False)
    calibrated_probability = Column(Float, nullable=False)
    raw_probability = Column(Float, nullable=True)
    conformal_set_json = Column(Text, nullable=False, default="[1]")
    recommended_action = Column(String(128), nullable=False)
    priority_score = Column(Float, nullable=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "request_id": self.request_id,
            "customer_id": self.customer_id,
            "timestamp": self.timestamp,
            "model_version": self.model_version,
            "calibrated_probability": self.calibrated_probability,
            "raw_probability": self.raw_probability,
            "conformal_set": json.loads(self.conformal_set_json) if self.conformal_set_json else [1],
            "recommended_action": self.recommended_action,
            "priority_score": self.priority_score,
        }


class DriftSnapshotModel(Base):
    """Historical time-series drift snapshot with provenance and source typing."""
    __tablename__ = "drift_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String(64), nullable=False, index=True)
    period_label = Column(String(64), nullable=False)
    model_version = Column(String(64), nullable=False)
    reference_version = Column(String(64), nullable=False)
    source_type = Column(String(32), nullable=False, default="live_telemetry")  # "live_telemetry" or "benchmark_holdout"
    window_start = Column(String(64), nullable=True)
    window_end = Column(String(64), nullable=True)
    prediction_event_start_id = Column(Integer, nullable=True)
    prediction_event_end_id = Column(Integer, nullable=True)
    psi = Column(Float, nullable=False)
    psi_interpretation = Column(String(64), nullable=False)
    ks_statistic = Column(Float, nullable=False)
    ks_p_value = Column(Float, nullable=False)
    ks_drift_detected = Column(Boolean, nullable=False)
    n_samples = Column(Integer, nullable=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "period_label": self.period_label,
            "model_version": self.model_version,
            "reference_version": self.reference_version,
            "source_type": self.source_type,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "prediction_event_start_id": self.prediction_event_start_id,
            "prediction_event_end_id": self.prediction_event_end_id,
            "psi": self.psi,
            "psi_interpretation": self.psi_interpretation,
            "ks_statistic": self.ks_statistic,
            "ks_p_value": self.ks_p_value,
            "ks_drift_detected": self.ks_drift_detected,
            "n_samples": self.n_samples,
        }
