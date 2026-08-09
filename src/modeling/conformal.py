"""
Stage 9 — Mondrian (class-conditional) conformal prediction, built from
scratch rather than a library (MAPIE, etc.).

Reasoning for building it directly: the goal throughout this project has
been understanding a technique well enough to defend it under questioning,
not just calling a library function. A hand-built version, once tested,
demonstrates the actual mechanism -- a library call alone doesn't. MAPIE
remains a reasonable choice for hardening this into production later,
once the underlying idea is solid here.

Mechanism: for each calibration example, the nonconformity score is
1 - predicted_probability_of_its_TRUE_class -- low score means the model
was confidently right, high score means it was surprised by the true
answer. Computing the (1-alpha) quantile of these scores SEPARATELY per
class (Mondrian / class-conditional, rather than one pooled threshold)
gives each class its own guarantee, which matters here because the two
classes have very different calibration-set sizes (imbalanced churn
rate) and pooling would let the majority class's easier scores dominate
the threshold used for the minority class too.
"""

"""
Stage 9 — Mondrian (class-conditional) conformal prediction, built from
scratch rather than a library (MAPIE, etc.).

Reasoning for building it directly: the goal throughout this project has
been understanding a technique well enough to defend it under
questioning, not just calling a library function. A hand-built version,
once tested, demonstrates the actual mechanism -- a library call alone
doesn't. MAPIE remains a reasonable choice for hardening this into
production later, once the underlying idea is solid here.

Why Mondrian specifically, not standard/global conformal prediction:
standard split-conformal guarantees MARGINAL coverage -- "95% of the
time, the true label is in the predicted set," averaged over the whole
population. On an imbalanced problem, a model could satisfy 95% marginal
coverage by nailing the majority (no-churn) class at 99%+ while the
minority (churn) class -- the one this entire project exists to predict
-- sits at 70% or worse, and the average would still look fine. Mondrian
conformal prediction computes a separate threshold per class, so the
guarantee holds for churners specifically, not just on average.
"""

import numpy as np
import pandas as pd


def nonconformity_scores(probs: np.ndarray, y_true: np.ndarray) -> np.ndarray:
    """probs: (n, n_classes), each row a probability distribution.
    y_true: (n,) integer class labels. Returns 1 - prob assigned to the
    true class for each row -- low score means the model was confidently
    right, high score means it was surprised by the true answer."""
    probs = np.asarray(probs)
    y_true = np.asarray(y_true)
    return 1.0 - probs[np.arange(len(y_true)), y_true]


def mondrian_thresholds(scores: np.ndarray, y_true: np.ndarray, classes, alpha: float = 0.05) -> dict:
    """Per-class conformal quantile, finite-sample corrected: the
    ceil((n+1)(1-alpha))/n quantile of that class's calibration scores,
    not a naive (1-alpha) quantile -- the correction is what makes the
    coverage guarantee exact rather than approximate at finite sample
    sizes. Raises loudly if a class has zero calibration examples, rather
    than silently producing a meaningless threshold."""
    y_true = np.asarray(y_true)
    thresholds = {}
    for c in classes:
        class_scores = scores[y_true == c]
        n = len(class_scores)
        if n == 0:
            raise ValueError(f"No calibration examples for class {c} -- cannot compute a threshold.")
        q_level = min(np.ceil((n + 1) * (1 - alpha)) / n, 1.0)
        thresholds[c] = float(np.quantile(class_scores, q_level, method="higher"))
    return thresholds


def conformal_prediction_sets(probs: np.ndarray, thresholds: dict, classes) -> list:
    """For each row, include class c in the prediction set if the row's
    nonconformity score for c is within that class's own threshold.
    Returns a list of sets, e.g. [{0}, {1}, {0, 1}, ...] -- a two-element
    set means the model isn't confident enough to commit under this
    class's own coverage guarantee."""
    probs = np.asarray(probs)
    pred_sets = []
    for row in probs:
        pred_set = set()
        for c in classes:
            nonconformity = 1.0 - row[c]
            if nonconformity <= thresholds[c]:
                pred_set.add(c)
        pred_sets.append(pred_set)
    return pred_sets


def evaluate_class_conditional_coverage(pred_sets: list, y_true: np.ndarray, classes) -> pd.DataFrame:
    """The actual validation of the whole exercise: does the promised
    coverage empirically hold, per class, on held-out data the thresholds
    were never fit on. Returns sample size alongside coverage -- a 94.5%
    reading means something different backed by 300 points than by 12."""
    y_true = np.asarray(y_true)
    rows = []
    for c in classes:
        mask = y_true == c
        n = mask.sum()
        covered = sum(1 for i in np.where(mask)[0] if c in pred_sets[i])
        rows.append({
            "class": c,
            "n_examples": int(n),
            "empirical_coverage": covered / n if n > 0 else float("nan"),
        })
    return pd.DataFrame(rows)


def average_set_size(pred_sets: list) -> float:
    """1.0 = every prediction was a single confident class. 2.0 (the max,
    for binary classification) = every prediction was the ambiguous
    {0, 1} set -- the model refusing to commit, not an error. Efficiency
    companion to coverage: a predictor that always outputs {0, 1} has
    perfect coverage and zero decision value."""
    return float(np.mean([len(s) for s in pred_sets]))
