"""
Stage 7 — Baseline model utilities.

precision_at_k / recall_at_k exist for one reason: Stage 8 needs to compare
a champion model against this baseline using the *exact same* scoring
function on the *exact same* K. A different scoring function in each
notebook would make "the champion won" or "the champion lost" an artifact
of measurement, not a real result -- so this lives in src/, not duplicated
inline in two notebooks.

Deliberately NOT included here: expected-value (P(churn) x CLV) ranking.
ADR-002's own cost math treats CLV as roughly constant, so it coincides
with plain probability ranking for now -- customer-specific CLV weighting
is a real future refinement, not something this stage has earned a reason
to build yet.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression


def train_logistic_regression(X_train: pd.DataFrame, y_train: pd.Series, **kwargs) -> LogisticRegression:
    """class_weight=None by default -- Stage 7 (ADR-008) compared None vs.
    "balanced" directly on real data and None won on PR-AUC (0.6331 vs
    0.6299). No resampling happens upstream in this pipeline (ADR-007
    Decision Point 6 deliberately rejected SMOTE for lack of an earned
    reason), so there is no already-balanced training set to avoid
    double-correcting for."""
    defaults = dict(max_iter=1000, class_weight=None, random_state=42)
    defaults.update(kwargs)
    model = LogisticRegression(**defaults)
    model.fit(X_train, y_train)
    return model


def precision_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int) -> float:
    """Of the top-k customers ranked by y_score, what fraction actually churned."""
    order = np.argsort(-np.asarray(y_score))
    top_k_true = np.asarray(y_true)[order][:k]
    return float(top_k_true.mean()) if k > 0 else float("nan")


def recall_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int) -> float:
    """Of all real churners, what fraction were caught in the top-k."""
    y_true = np.asarray(y_true)
    total_positives = y_true.sum()
    if total_positives == 0:
        return float("nan")
    order = np.argsort(-np.asarray(y_score))
    top_k_true = y_true[order][:k]
    return float(top_k_true.sum() / total_positives)
