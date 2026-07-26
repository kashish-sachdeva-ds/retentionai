"""
Variance Inflation Factor (VIF).

Used AFTER encoding, on a numeric feature matrix, to catch a kind of
redundancy pairwise correlation can miss entirely: a feature can have low
correlation with any single other feature while still being almost
perfectly predictable from several of them *combined*.

    VIF_i = 1 / (1 - R_i^2)

where R_i^2 comes from regressing feature i against every OTHER feature in
the matrix. VIF -> 1 means the feature shares essentially no linear
information with the rest of the matrix (independent). VIF -> infinity
means it's fully redundant -- an exact linear function of other columns.

Convention:
    VIF < 5       -> fine
    5 <= VIF < 10  -> borderline, worth a look
    VIF >= 10      -> problematic, drop or resolve
"""

import numpy as np
import pandas as pd
from statsmodels.stats.outliers_influence import variance_inflation_factor


def compute_vif(X: pd.DataFrame) -> pd.DataFrame:
    """Compute VIF for every column in X. X must be numeric, no NaNs.

    A perfectly duplicated column (R^2 = 1.0 against the rest) produces an
    infinite VIF -- expected and meaningful here, not a bug. The resulting
    divide-by-zero RuntimeWarning is deliberately suppressed, since np.inf
    is exactly the right value to see for a truly redundant column, not
    something to silently work around.
    """
    vif_data = pd.DataFrame()
    vif_data["feature"] = X.columns
    with np.errstate(divide="ignore"):
        vif_data["VIF"] = [
            variance_inflation_factor(X.values, i) for i in range(X.shape[1])
        ]
    return vif_data.sort_values("VIF", ascending=False).reset_index(drop=True)


def drop_highest_vif_iteratively(X: pd.DataFrame, threshold: float = 10.0):
    """Drop the single worst-VIF column, recompute everyone else's VIF,
    repeat -- until every remaining column is under `threshold`.

    One at a time, not all-at-once: dropping the worst offender changes
    every other column's VIF too (they were partly redundant with it),
    so the ranking has to be recalculated after each individual drop,
    not decided from a single upfront pass.

    Returns (X_reduced, dropped_columns_in_order, final_vif_table).
    """
    X = X.copy()
    dropped = []
    while X.shape[1] > 1:
        vif_table = compute_vif(X)
        worst = vif_table.iloc[0]
        if worst["VIF"] < threshold:
            break
        X = X.drop(columns=[worst["feature"]])
        dropped.append(worst["feature"])
    final_vif_table = compute_vif(X) if X.shape[1] > 0 else pd.DataFrame(columns=["feature", "VIF"])
    return X, dropped, final_vif_table
