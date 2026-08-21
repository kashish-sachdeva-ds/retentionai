"""Release-evaluation utilities for the model artifact bundle.

The serving API should never rely on a notebook or README for its quality
claims.  This module computes a compact, JSON-serialisable report on an
untouched holdout set and saves it with the exact model version being served.
It intentionally reports uncertainty and slice sizes alongside point metrics:
small holdout slices are useful diagnostics, not a fairness certification.
"""

from __future__ import annotations

from typing import Mapping

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss

from src.modeling.baseline import precision_at_k, recall_at_k
from src.modeling.calibration import expected_calibration_error
from src.modeling.conformal import average_set_size, evaluate_class_conditional_coverage


def _bootstrap_interval(
    y_true: np.ndarray,
    y_score: np.ndarray,
    metric,
    *,
    draws: int = 300,
    random_state: int = 42,
) -> list[float]:
    """Deterministic stratified bootstrap 95% interval for a binary metric."""
    y_true = np.asarray(y_true)
    y_score = np.asarray(y_score)
    rng = np.random.default_rng(random_state)
    class_indices = [np.flatnonzero(y_true == label) for label in (0, 1)]
    if any(len(indices) == 0 for indices in class_indices):
        return [float("nan"), float("nan")]

    values = []
    for _ in range(draws):
        sampled = np.concatenate([
            rng.choice(indices, size=len(indices), replace=True)
            for indices in class_indices
        ])
        values.append(metric(y_true[sampled], y_score[sampled]))
    return [float(value) for value in np.quantile(values, [0.025, 0.975])]


def _ranking_metrics(y_true: np.ndarray, y_score: np.ndarray, decision_k: int) -> dict:
    k = min(decision_k, len(y_true))
    return {
        "pr_auc": float(average_precision_score(y_true, y_score)),
        "pr_auc_95pct_bootstrap_ci": _bootstrap_interval(
            y_true, y_score, average_precision_score
        ),
        "precision_at_k": float(precision_at_k(y_true, y_score, k)),
        "recall_at_k": float(recall_at_k(y_true, y_score, k)),
        "decision_k": int(k),
    }


def build_evaluation_report(
    y_true: np.ndarray,
    calibrated_probabilities: np.ndarray,
    prediction_sets: list[set],
    *,
    alpha: float,
    decision_k: int,
    decision_threshold: float,
    split_counts: Mapping[str, int],
    slice_features: pd.DataFrame | None = None,
) -> dict:
    """Build an immutable evaluation payload for one trained model version.

    ``y_true`` must be from a holdout set untouched by model fitting,
    calibration, and conformal-threshold fitting.  ``slice_features`` may
    contain non-model columns (for example gender) aligned to this holdout.
    """
    y_true = np.asarray(y_true, dtype=int)
    probabilities = np.asarray(calibrated_probabilities, dtype=float)
    if len(y_true) == 0 or len(y_true) != len(probabilities):
        raise ValueError("y_true and calibrated_probabilities must be non-empty and aligned")
    if len(prediction_sets) != len(y_true):
        raise ValueError("prediction_sets must align with y_true")

    coverage = evaluate_class_conditional_coverage(prediction_sets, y_true, classes=[0, 1])
    coverage_by_class = {
        str(int(row["class"])): {
            "n_examples": int(row["n_examples"]),
            "empirical_coverage": float(row["empirical_coverage"]),
        }
        for _, row in coverage.iterrows()
    }
    report = {
        "evaluation_schema_version": 1,
        "holdout_protocol": (
            "Model fit on train; isotonic calibration fit on calibration; "
            "Mondrian thresholds fit on a disjoint conformal split; metrics "
            "below are computed only on the remaining holdout split."
        ),
        "split_counts": {name: int(count) for name, count in split_counts.items()},
        "ranking": _ranking_metrics(y_true, probabilities, decision_k),
        "calibration": {
            "brier_score": float(brier_score_loss(y_true, probabilities)),
            "ece_10_bins": float(expected_calibration_error(y_true, probabilities)),
        },
        "decision_policy": {
            "churn_probability_threshold": float(decision_threshold),
            "note": "Operational prioritization remains capacity-constrained ranking, not this threshold alone.",
        },
        "conformal": {
            "target_coverage": float(1 - alpha),
            "class_conditional_coverage": coverage_by_class,
            "average_prediction_set_size": float(average_set_size(prediction_sets)),
        },
        "slices": {},
        "limitations": [
            "Intervals reflect sampling uncertainty in one static holdout, not future-population performance.",
            "Slice results are diagnostic only; they do not establish fairness or causal validity.",
            "Churn propensity is not treatment uplift or offer effectiveness.",
        ],
    }

    if slice_features is not None:
        if len(slice_features) != len(y_true):
            raise ValueError("slice_features must align with y_true")
        for column in slice_features.columns:
            rows = []
            for value in sorted(slice_features[column].dropna().unique(), key=str):
                mask = (slice_features[column] == value).to_numpy()
                if not mask.any() or len(np.unique(y_true[mask])) < 2:
                    continue
                rows.append({
                    "value": str(value),
                    "n_examples": int(mask.sum()),
                    "churn_rate": float(y_true[mask].mean()),
                    "pr_auc": float(average_precision_score(y_true[mask], probabilities[mask])),
                    "brier_score": float(brier_score_loss(y_true[mask], probabilities[mask])),
                })
            report["slices"][column] = rows
    return report
