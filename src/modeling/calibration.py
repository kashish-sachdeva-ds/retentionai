"""
Stage 9 — Probability calibration.

A model can rank customers correctly (Stage 8's whole job) while its
predicted probabilities are still untrustworthy as probabilities -- e.g.
predicting 0.70 for a group where only 50% actually churn. Ranking and
calibration are genuinely separate properties; XGBoost in particular is
known to often be well-ranked but poorly calibrated, pushed toward
overconfident extremes by how boosted trees are built. Precision@K and
Recall@K don't detect this at all -- ranking is invariant to any
monotonic rescaling of the scores -- which is exactly why a calibration
problem can hide successfully through stages that only look at ranking.

ADR-002's cost-sensitive threshold (P(churn) > 70/840 ~= 8.3%) is only
meaningful applied to real-world-calibrated probabilities -- an absolute
threshold compared against a raw, uncalibrated score isn't measuring
what it looks like it's measuring.

The calibration set used here (`X_calib`/`y_calib`) is carved out fresh
in this stage's notebook from Stage 8's test set (see ADR-010 Decision
Point 1) -- Stage 6's pipeline produces a train/test split only, with no
resampling of any kind (ADR-007 Decision Point 6 rejected SMOTE
outright), so there was no pre-existing calibration set reserved for
this until now.
"""

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV


def calibrate_model(base_model, X_calib: pd.DataFrame, y_calib: pd.Series, method: str = "isotonic"):
    """base_model is already fitted. This step only fits a mapping from
    raw score -> corrected probability using X_calib/y_calib -- it does
    not refit or touch the base model's own parameters at all.

    sklearn >= 1.6 removed CalibratedClassifierCV(cv="prefit") in favor of
    explicitly wrapping the fitted estimator in FrozenEstimator, which
    tells CalibratedClassifierCV "don't refit this, just calibrate on top
    of it" -- same behavior, clearer API.
    """
    from sklearn.frozen import FrozenEstimator

    calibrated = CalibratedClassifierCV(FrozenEstimator(base_model), method=method)
    calibrated.fit(X_calib, y_calib)
    return calibrated


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    """ECE: bin predictions by predicted probability, and in each bin
    compare the average predicted probability to the actual observed
    churn rate in that bin. A well-calibrated model has these close in
    every bin. Weighted by bin size so a bin with 3 points doesn't count
    as much as one with 300."""
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    bin_edges = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(y_true)

    for lo, hi in zip(bin_edges[:-1], bin_edges[1:]):
        in_bin = (y_prob > lo) & (y_prob <= hi) if lo > 0 else (y_prob >= lo) & (y_prob <= hi)
        bin_count = in_bin.sum()
        if bin_count == 0:
            continue
        avg_predicted = y_prob[in_bin].mean()
        avg_actual = y_true[in_bin].mean()
        ece += (bin_count / n) * abs(avg_predicted - avg_actual)

    return float(ece)
