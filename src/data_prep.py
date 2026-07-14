"""Shared data loading and cleaning logic.

Investigation and rationale behind clean_totalcharges() live in
notebooks/02_data_understanding.ipynb. This module is the one place the
fix is actually implemented, so 02 and 03 can't drift apart.
"""

import pandas as pd

from src.config import RAW_CSV_PATH


def load_raw_data(path=RAW_CSV_PATH) -> pd.DataFrame:
    """Load the raw Telco churn CSV as extracted by 01_data_extraction.ipynb."""
    return pd.read_csv(path)


def clean_totalcharges(df: pd.DataFrame) -> pd.DataFrame:
    """Convert TotalCharges to numeric and impute the 0-tenure blanks with 0.

    11 rows have TotalCharges stored as a blank string (' '). All 11 have
    tenure == 0 — new customers who haven't reached a first billing cycle
    yet — so 0 is the correct fill value, not a dropped row or a guessed
    average. See 02_data_understanding.ipynb for the verification.
    """
    df = df.copy()
    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df["TotalCharges"] = df["TotalCharges"].fillna(0)
    return df