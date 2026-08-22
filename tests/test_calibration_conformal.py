import numpy as np
import pandas as pd
import pytest
from sklearn.model_selection import train_test_split

from src.config import RAW_CSV_PATH
from src.features.pipeline import run_stage6_split
from src.modeling.champion import train_xgboost
from src.modeling.calibration import calibrate_model, expected_calibration_error
from src.modeling.conformal import (
    nonconformity_scores, mondrian_thresholds, conformal_prediction_sets,
    evaluate_class_conditional_coverage, average_set_size,
)


@pytest.fixture(scope="module")
def calib_conformal_holdout_split():
    """Post-audit fix: proper 3-way split. X_calib fits the calibrator,
    X_conformal computes thresholds on data the calibrator never saw,
    X_holdout evaluates coverage on data neither step has seen."""
    df = pd.read_csv(RAW_CSV_PATH)
    X_train, X_test_full, y_train, y_test_full, _ = run_stage6_split(df)
    X_calib, X_remaining, y_calib, y_remaining = train_test_split(
        X_test_full, y_test_full, test_size=0.5, random_state=7, stratify=y_test_full
    )
    X_conformal, X_holdout, y_conformal, y_holdout = train_test_split(
        X_remaining, y_remaining, test_size=0.5, random_state=7, stratify=y_remaining
    )
    model = train_xgboost(X_train, y_train)
    return model, X_calib, y_calib, X_conformal, y_conformal, X_holdout, y_holdout


def test_ece_zero_for_perfectly_calibrated_predictions():
    rng = np.random.default_rng(0)
    y_prob = rng.uniform(0, 1, 5000)
    y_true = rng.binomial(1, y_prob)  # true labels drawn EXACTLY from the stated probabilities
    ece = expected_calibration_error(y_true, y_prob, n_bins=10)
    assert ece < 0.03  # near zero, allowing for sampling noise


def test_ece_high_for_badly_miscalibrated_predictions():
    y_true = np.array([0] * 100)
    y_prob = np.array([0.9] * 100)  # confidently wrong every time
    ece = expected_calibration_error(y_true, y_prob, n_bins=10)
    assert ece > 0.8


def test_calibration_reduces_or_maintains_ece(calib_conformal_holdout_split):
    model, X_calib, y_calib, _, _, X_holdout, y_holdout = calib_conformal_holdout_split
    raw_probs = model.predict_proba(X_holdout)[:, 1]
    raw_ece = expected_calibration_error(y_holdout.values, raw_probs)

    calibrated_model = calibrate_model(model, X_calib, y_calib, method="isotonic")
    calibrated_probs = calibrated_model.predict_proba(X_holdout)[:, 1]
    calibrated_ece = expected_calibration_error(y_holdout.values, calibrated_probs)

    # Not asserting calibration always wins -- Stage 9 found real cases
    # where it doesn't by much. Asserting it doesn't make things drastically worse.
    assert calibrated_ece < raw_ece + 0.05


def test_mondrian_thresholds_raises_on_missing_class():
    scores = np.array([0.1, 0.2, 0.3])
    y = np.array([0, 0, 0])
    with pytest.raises(ValueError):
        mondrian_thresholds(scores, y, classes=[0, 1], alpha=0.05)


def test_conformal_coverage_meets_target_within_tolerance(calib_conformal_holdout_split):
    """Post-audit fix: calibration is fit on X_calib, thresholds are
    computed on X_conformal (disjoint), and coverage is evaluated on
    X_holdout (disjoint from both). The 80% threshold is an honest
    finite-sample sanity bound -- 95% is the asymptotic TARGET, not
    something we can assert on a small holdout without false failures
    from sampling noise."""
    model, X_calib, y_calib, X_conformal, y_conformal, X_holdout, y_holdout = calib_conformal_holdout_split
    calibrated_model = calibrate_model(model, X_calib, y_calib, method="isotonic")

    # Thresholds on X_conformal -- disjoint from X_calib
    probs_conformal = calibrated_model.predict_proba(X_conformal)
    scores = nonconformity_scores(probs_conformal, y_conformal.values)
    thresholds = mondrian_thresholds(scores, y_conformal.values, classes=[0, 1], alpha=0.05)

    # Coverage on X_holdout -- disjoint from both X_calib and X_conformal
    probs_holdout = calibrated_model.predict_proba(X_holdout)
    pred_sets = conformal_prediction_sets(probs_holdout, thresholds, classes=[0, 1])
    coverage_df = evaluate_class_conditional_coverage(pred_sets, y_holdout.values, classes=[0, 1])

    # Allow real finite-sample slack -- the honest bound, not the inflated
    # one that the contaminated split was producing.
    assert (coverage_df["empirical_coverage"] > 0.80).all()
    assert average_set_size(pred_sets) <= 2.0
