import numpy as np
import pandas as pd

from src.modeling.evaluation import build_evaluation_report


def test_evaluation_report_includes_release_metrics_and_slices():
    y_true = np.array([0, 1, 0, 1, 0, 1, 0, 1])
    probabilities = np.array([0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6])
    prediction_sets = [{0}, {1}, {0}, {1}, {0, 1}, {1}, {0}, {1}]
    slices = pd.DataFrame({"gender": ["Female", "Female", "Male", "Male"] * 2})

    report = build_evaluation_report(
        y_true, probabilities, prediction_sets,
        alpha=0.05,
        decision_k=100,
        decision_threshold=70 / 840,
        split_counts={"train": 100, "calibration": 20, "conformal": 10, "holdout": 8},
        slice_features=slices,
    )

    assert report["ranking"]["decision_k"] == 8
    assert report["ranking"]["pr_auc"] == 1.0
    assert report["calibration"]["brier_score"] >= 0
    assert set(report["conformal"]["class_conditional_coverage"]) == {"0", "1"}
    assert len(report["slices"]["gender"]) == 2
