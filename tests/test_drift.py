import numpy as np
import pandas as pd

from src.monitoring.drift import check_drift_report, _psi_for_column, _interpret_psi


def test_psi_near_zero_for_identical_distributions():
    rng = np.random.default_rng(0)
    ref = rng.beta(2, 5, 2000)
    cur = rng.beta(2, 5, 2000)
    psi = _psi_for_column(ref, cur)
    assert psi < 0.1


def test_psi_high_for_clearly_shifted_distributions():
    rng = np.random.default_rng(0)
    ref = rng.beta(2, 5, 1000)   # low values
    cur = rng.beta(5, 2, 1000)   # high values -- genuinely different population
    psi = _psi_for_column(ref, cur)
    assert psi > 0.25


def test_interpret_psi_thresholds():
    assert _interpret_psi(0.05) == "no significant shift"
    assert _interpret_psi(0.15) == "moderate shift -- worth watching"
    assert _interpret_psi(0.5) == "significant shift -- investigate"


def test_ks_false_positive_rate_matches_theoretical_expectation():
    """At p<0.05, ~5% of checks should flag 'drift' even with zero real
    difference -- verified directly rather than assumed, so an isolated
    flag doesn't get over-interpreted later."""
    flagged = 0
    n_trials = 100
    for seed in range(n_trials):
        rng = np.random.default_rng(seed)
        reference = pd.DataFrame({"score": rng.beta(2, 5, 1000)})
        current = pd.DataFrame({"score": rng.beta(2, 5, 300)})
        report = check_drift_report(reference, current, columns=["score"])
        if report["ks_drift_detected"].iloc[0]:
            flagged += 1
    assert 0 <= flagged <= 15  # generous band around the theoretical ~5


def test_check_drift_report_returns_one_row_per_column():
    rng = np.random.default_rng(0)
    reference = pd.DataFrame({"a": rng.normal(size=500), "b": rng.normal(size=500)})
    current = pd.DataFrame({"a": rng.normal(size=200), "b": rng.normal(size=200)})
    report = check_drift_report(reference, current, columns=["a", "b"])
    assert list(report["column"]) == ["a", "b"]
    assert {"psi", "psi_interpretation", "ks_statistic", "ks_p_value", "ks_drift_detected"} <= set(report.columns)
