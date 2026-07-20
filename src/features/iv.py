"""
Information Value (IV) and Weight of Evidence (WoE).

Used as a univariate filter BEFORE modeling: bin a feature (quantiles for
continuous columns, raw categories for categorical columns), then measure
how differently "good" (non-churn) and "bad" (churn) customers are
distributed across those bins.

    WoE_bin  = ln( %good_in_bin / %bad_in_bin )
    IV_bin   = (%good_in_bin - %bad_in_bin) * WoE_bin
    IV_total = sum(IV_bin) over all bins of that feature

Interpretation (standard credit-scoring convention, carries over cleanly
to churn):
    IV < 0.02           -> not predictive, drop
    0.02 <= IV < 0.10    -> weak
    0.10 <= IV < 0.30    -> medium
    0.30 <= IV < 0.50    -> strong
    IV >= 0.50           -> suspiciously strong -> check for leakage first

Convention used throughout this module: target == 0 is "good" (retained),
target == 1 is "bad" (churned) — matches Churn_numeric from the EDA stage.
"""

import numpy as np
import pandas as pd


def _woe_iv_from_bins(work: pd.DataFrame, bin_col: str, target_col: str) -> tuple[pd.DataFrame, float]:
    """Given rows with a bin assignment column and a 0/1 target, return a
    per-bin WoE/IV table plus the total IV summed across bins."""
    counts = work.groupby(bin_col, observed=True)[target_col].agg(
        good=lambda s: (s == 0).sum(),
        bad=lambda s: (s == 1).sum(),
    )

    total_good = counts["good"].sum()
    total_bad = counts["bad"].sum()

    # Small epsilon so a bin with zero goods or zero bads doesn't produce
    # ln(0) or a divide-by-zero. Standard practice — a 100%-one-class bin
    # is still informative, we just can't take an exact log of zero.
    eps = 0.5
    dist_good = (counts["good"] + eps) / (total_good + eps * len(counts))
    dist_bad = (counts["bad"] + eps) / (total_bad + eps * len(counts))

    counts["woe"] = np.log(dist_good / dist_bad)
    counts["iv"] = (dist_good - dist_bad) * counts["woe"]

    return counts, float(counts["iv"].sum())


def compute_iv(df: pd.DataFrame, feature_col: str, target_col: str, n_bins: int = 5) -> tuple[float, pd.DataFrame]:
    """Compute IV for one feature against a binary target.

    Numeric features with more unique values than n_bins are quantile-binned
    (pd.qcut). Everything else (categoricals, low-cardinality numerics like
    flags or small ordinal codes) is treated as categorical and uses its
    raw categories as bins directly.

    Returns (total_iv, per_bin_table).
    """
    work = df[[feature_col, target_col]].dropna().copy()

    is_numeric = pd.api.types.is_numeric_dtype(work[feature_col])
    is_continuous = is_numeric and work[feature_col].nunique() > n_bins

    if is_continuous:
        work["_bin"] = pd.qcut(work[feature_col], q=n_bins, duplicates="drop")
    else:
        work["_bin"] = work[feature_col].astype(str)

    bin_table, total_iv = _woe_iv_from_bins(work, "_bin", target_col)
    return total_iv, bin_table


def interpret_iv(iv: float) -> str:
    if iv < 0.02:
        return "not predictive"
    if iv < 0.10:
        return "weak"
    if iv < 0.30:
        return "medium"
    if iv < 0.50:
        return "strong"
    return "suspiciously strong -- check leakage"


def iv_summary(df: pd.DataFrame, feature_cols: list[str], target_col: str, n_bins: int = 5) -> pd.DataFrame:
    """Compute IV for a list of features, return one sorted comparison table."""
    rows = []
    for col in feature_cols:
        iv, _ = compute_iv(df, col, target_col, n_bins=n_bins)
        rows.append({"feature": col, "iv": round(iv, 4), "strength": interpret_iv(iv)})
    return pd.DataFrame(rows).sort_values("iv", ascending=False).reset_index(drop=True)
