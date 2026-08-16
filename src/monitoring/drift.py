"""
Stage 12c -- Drift monitoring.

Monitors the model's OWN output distribution (calibrated churn
probability), not every input feature separately -- a real, common first
drift signal in production systems: simpler to alert on, and it
implicitly captures the combined effect of any input drift without
needing to track each feature individually.

Two complementary measures, deliberately paired rather than relying on
either alone:
    PSI (Population Stability Index) -- a magnitude measure, bucketed,
        with conventional industry-standard thresholds.
    KS (Kolmogorov-Smirnov) two-sample test -- a significance measure:
        how confident are we these two samples come from different
        distributions, independent of PSI's bucketing choice.
PSI can flag a shift too small to be statistically meaningful on a small
sample; KS can flag statistical significance on a shift too small to
matter practically. Reporting both avoids over-trusting either alone.
"""

import numpy as np
import pandas as pd
from scipy import stats


def _psi_for_column(reference: np.ndarray, current: np.ndarray, n_bins: int = 10) -> float:
    """PSI = sum over bins of (current% - reference%) * ln(current% / reference%).
    Bin edges come from the REFERENCE distribution's quantiles, not the
    current data's -- using reference's own bins for both is what makes
    this a comparison against a fixed baseline, not a self-referential
    statistic that redraws its own ruler every time.
    """
    quantiles = np.linspace(0, 1, n_bins + 1)
    bin_edges = np.unique(np.quantile(reference, quantiles))
    if len(bin_edges) < 3:
        return 0.0  # reference has too little spread to bin meaningfully

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


def check_drift_report(reference_df: pd.DataFrame, current_df: pd.DataFrame, columns: list) -> pd.DataFrame:
    """One row per column: PSI + interpretation, plus a KS statistic,
    p-value, and a boolean drift flag at the conventional p<0.05
    threshold.

    Worth knowing before alerting on a single flagged check: at p<0.05,
    the KS test flags "drift" on ~5% of checks even when nothing has
    actually changed -- verified directly (7/100 trials on genuinely
    identical distributions). A single flag is expected noise; persistent
    flags across repeated checks are the actual signal worth acting on.
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
