"""Stage 12c -- Drift monitoring & temporal snapshot tracking.

Monitors the model's OWN output distribution (calibrated churn probability)
over time, combining:
    1. PSI (Population Stability Index) -- magnitude of distributional divergence.
    2. KS (Kolmogorov-Smirnov) two-sample test -- statistical significance of divergence.

Supports persistent event-based tracking via PredictionEventModel and
reproducible drift snapshots via DriftSnapshotModel.
"""

from __future__ import annotations

import datetime
import json
import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from src.db.models import DriftSnapshotModel, PredictionEventModel
from src.db.session import get_db_session

logger = logging.getLogger(__name__)


def _psi_for_column(reference: np.ndarray, current: np.ndarray, n_bins: int = 10) -> float:
    """PSI = sum over bins of (current% - reference%) * ln(current% / reference%).
    Bin edges come from the REFERENCE distribution's quantiles, not the
    current data's -- using reference's own bins for both is what makes
    this a comparison against a fixed baseline.
    """
    quantiles = np.linspace(0, 1, n_bins + 1)
    bin_edges = np.unique(np.quantile(reference, quantiles))
    if len(bin_edges) < 3:
        return 0.0

    ref_counts, _ = np.histogram(reference, bins=bin_edges)
    cur_counts, _ = np.histogram(current, bins=bin_edges)

    eps = 1e-4  # avoids ln(0) / divide-by-zero for an empty bin
    ref_pct = ref_counts / max(len(reference), 1) + eps
    cur_pct = cur_counts / max(len(current), 1) + eps

    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def _interpret_psi(psi: float) -> str:
    if psi < 0.1:
        return "no significant shift"
    if psi < 0.25:
        return "moderate shift -- worth watching"
    return "significant shift -- investigate"


def check_drift_report(reference_df: pd.DataFrame, current_df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """One row per column: PSI + interpretation, plus a KS statistic,
    p-value, and a boolean drift flag at the conventional p<0.05 threshold.
    """
    rows = []
    for col in columns:
        ref = reference_df[col].dropna().values
        cur = current_df[col].dropna().values

        psi = _psi_for_column(ref, cur)
        ks_stat, ks_p = stats.ks_2samp(ref, cur)

        rows.append({
            "column": col,
            "psi": psi,
            "psi_interpretation": _interpret_psi(psi),
            "ks_statistic": float(ks_stat),
            "ks_p_value": float(ks_p),
            "ks_drift_detected": bool(ks_p < 0.05),
        })
    return pd.DataFrame(rows)


def record_prediction_event(
    request_id: str,
    customer_id: str,
    model_version: str,
    calibrated_probability: float,
    recommended_action: str,
    priority_score: float,
    raw_probability: float | None = None,
    conformal_set: list[int] | None = None,
) -> None:
    """Durably log every live scoring event to the database for stream aggregation."""
    try:
        with get_db_session() as session:
            event = PredictionEventModel(
                request_id=request_id,
                customer_id=customer_id,
                timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                model_version=model_version,
                calibrated_probability=calibrated_probability,
                raw_probability=raw_probability,
                conformal_set_json=json.dumps(conformal_set or [1]),
                recommended_action=recommended_action,
                priority_score=priority_score,
            )
            session.add(event)
    except Exception as exc:
        logger.error("Failed to record prediction event: %s", exc)


def create_drift_snapshot(
    period_label: str,
    model_version: str,
    reference_version: str,
    psi: float,
    psi_interpretation: str,
    ks_statistic: float,
    ks_p_value: float,
    ks_drift_detected: bool,
    n_samples: int,
    source_type: str = "live_telemetry",
    window_start: str | None = None,
    window_end: str | None = None,
    prediction_event_start_id: int | None = None,
    prediction_event_end_id: int | None = None,
) -> dict[str, Any]:
    """Persist a point-in-time drift calculation to the database."""
    try:
        with get_db_session() as session:
            snapshot = DriftSnapshotModel(
                timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                period_label=period_label,
                model_version=model_version,
                reference_version=reference_version,
                source_type=source_type,
                window_start=window_start,
                window_end=window_end,
                prediction_event_start_id=prediction_event_start_id,
                prediction_event_end_id=prediction_event_end_id,
                psi=psi,
                psi_interpretation=psi_interpretation,
                ks_statistic=ks_statistic,
                ks_p_value=ks_p_value,
                ks_drift_detected=ks_drift_detected,
                n_samples=n_samples,
            )
            session.add(snapshot)
            session.flush()
            return snapshot.to_dict()
    except Exception as exc:
        logger.error("Failed to persist drift snapshot: %s", exc)
        return {
            "period_label": period_label,
            "model_version": model_version,
            "reference_version": reference_version,
            "psi": psi,
            "psi_interpretation": psi_interpretation,
            "ks_statistic": ks_statistic,
            "ks_p_value": ks_p_value,
            "ks_drift_detected": ks_drift_detected,
            "n_samples": n_samples,
            "source_type": source_type,
            "window_start": window_start,
            "window_end": window_end,
            "prediction_event_start_id": prediction_event_start_id,
            "prediction_event_end_id": prediction_event_end_id,
        }


def get_drift_history(limit: int = 30, source_type: str | None = None) -> list[dict[str, Any]]:
    """Retrieve historical drift snapshots from database."""
    try:
        with get_db_session() as session:
            query = session.query(DriftSnapshotModel)
            if source_type:
                query = query.filter_by(source_type=source_type)
            rows = query.order_by(DriftSnapshotModel.timestamp.desc()).limit(limit).all()
            return [r.to_dict() for r in reversed(rows)]
    except Exception as exc:
        logger.error("Failed to query drift history: %s", exc)
        return []


def count_prediction_events() -> int:
    """Return total number of durable prediction events logged."""
    try:
        with get_db_session() as session:
            return session.query(PredictionEventModel).count()
    except Exception as exc:
        logger.error("Failed to count prediction events: %s", exc)
        return 0


def compute_live_drift_from_events(
    reference_scores: np.ndarray,
    min_samples: int = 100,
    model_version: str = "unknown",
    reference_version: str = "calibration-v1",
) -> dict[str, Any]:
    """Compute drift directly from real, persisted live prediction events in SQLite."""
    try:
        with get_db_session() as session:
            events = (
                session.query(PredictionEventModel)
                .order_by(PredictionEventModel.timestamp.desc())
                .limit(1000)
                .all()
            )
            n_events = len(events)
            if n_events < min_samples:
                return {
                    "status": "insufficient_data",
                    "n_observations": n_events,
                    "minimum_required": min_samples,
                    "message": f"Insufficient live history — {n_events} observations available; {min_samples} required for historical drift analysis.",
                    "source_type": "live_telemetry",
                }

            current_scores = np.array([e.calibrated_probability for e in events])
            ref_df = pd.DataFrame({"score": reference_scores})
            cur_df = pd.DataFrame({"score": current_scores})
            report = check_drift_report(ref_df, cur_df, columns=["score"])
            row = report.iloc[0]

            window_end = events[0].timestamp if events else None
            window_start = events[-1].timestamp if events else None
            event_end_id = events[0].id if events else None
            event_start_id = events[-1].id if events else None

            snapshot = create_drift_snapshot(
                period_label=f"Live Window (N={n_events})",
                model_version=model_version,
                reference_version=reference_version,
                psi=float(row["psi"]),
                psi_interpretation=str(row["psi_interpretation"]),
                ks_statistic=float(row["ks_statistic"]),
                ks_p_value=float(row["ks_p_value"]),
                ks_drift_detected=bool(row["ks_drift_detected"]),
                n_samples=n_events,
                source_type="live_telemetry",
                window_start=window_start,
                window_end=window_end,
                prediction_event_start_id=event_start_id,
                prediction_event_end_id=event_end_id,
            )

            return {
                "status": "ok",
                "n_observations": n_events,
                "model_version": model_version,
                "reference_version": reference_version,
                "window_start": window_start,
                "window_end": window_end,
                "prediction_event_start_id": event_start_id,
                "prediction_event_end_id": event_end_id,
                "psi": float(row["psi"]),
                "psi_interpretation": str(row["psi_interpretation"]),
                "ks_statistic": float(row["ks_statistic"]),
                "ks_p_value": float(row["ks_p_value"]),
                "ks_drift_detected": bool(row["ks_drift_detected"]),
                "source_type": "live_telemetry",
                "snapshot": snapshot,
            }

    except Exception as exc:
        logger.error("Failed to compute drift from events: %s", exc)
        return {
            "status": "error",
            "message": str(exc),
            "n_observations": 0,
            "minimum_required": min_samples,
            "source_type": "live_telemetry",
        }
