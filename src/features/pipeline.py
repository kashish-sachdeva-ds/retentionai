"""
Stage 6 pipeline: cleaning, encoding, redundancy removal, IV/VIF filtering,
scaling.

Split first, fit second. Every STATEFUL transformation -- which category
levels were seen, which mean/std to scale by, which columns IV/VIF decided
to drop -- is fit on the training data ONLY, then applied unchanged to
whatever other data needs the same treatment (the test set now, or brand
new customers at prediction time later). Fitting any of this on the full
dataset before splitting would let information from the test set leak into
decisions the model isn't supposed to have access to yet.

This module is deliberately split into two kinds of function:
  - prepare_features(): pure, row-by-row, no dataset-wide statistics.
    Safe to run on the full dataset before any split exists.
  - fit_transform_train() / transform_new(): everything that involves
    fitting. fit_* only ever sees training data.
"""

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from src.features.iv import iv_summary
from src.features.vif import drop_highest_vif_iteratively

# Dropped by construction, not by empirical VIF discovery: ContractCommitmentMonths
# is an exact 1-to-1 relabeling of Contract (Stage 5 / ADR-006). Keeping both
# would hand VIF a perfectly singular pair -- that's true by definition, not
# something worth waiting for an iterative algorithm to stumble onto.
STRUCTURALLY_REDUNDANT = ["Contract"]

ID_COLS = ["customerID"]

# SeniorCitizen is already 0/1 (Stage 3 flagged this as inconsistent with
# every other Yes/No column). Resolution: extend SeniorCitizen's convention
# to the other true binary columns, rather than introduce a third pattern.
BINARY_YES_NO_COLS = ["Partner", "Dependents", "PhoneService", "PaperlessBilling"]

# Genuinely 3+ level categoricals (including the "No internet/phone service"
# structural category from Stage 3/4) -- one-hot encoded, not binary-mapped.
MULTI_CATEGORY_COLS = [
    "gender", "MultipleLines", "InternetService", "OnlineSecurity",
    "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV",
    "StreamingMovies", "PaymentMethod",
]

IV_THRESHOLD = 0.02
VIF_THRESHOLD = 10.0


def carry_forward_cleaning(df: pd.DataFrame) -> pd.DataFrame:
    """Stage 3/4 decisions, applied once here instead of re-decided in
    every notebook that touches this data."""
    df = df.copy()
    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce").fillna(0)
    df["Churn_numeric"] = (df["Churn"] == "Yes").astype(int)
    return df


def engineer_surviving_features(df: pd.DataFrame) -> pd.DataFrame:
    """Only ContractCommitmentMonths survived Stage 5 (ADR-006).
    TotalAddOnServices, IsNewCustomer, and AvgMonthlySpend were all
    rejected there and are deliberately NOT rebuilt here."""
    df = df.copy()
    contract_map = {"Month-to-month": 0, "One year": 12, "Two year": 24}
    df["ContractCommitmentMonths"] = df["Contract"].map(contract_map)
    return df


def encode_binary_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for col in BINARY_YES_NO_COLS:
        df[col] = (df[col] == "Yes").astype(int)
    return df


def prepare_features(df: pd.DataFrame):
    """Everything safe to do BEFORE any train/test split exists -- no
    fitting, no dataset-wide statistics. This is what PROCESSED_CSV_PATH
    stores: cleaned + engineered + binary-encoded, but NOT yet IV/VIF
    filtered or scaled -- those steps depend on a specific train split
    and must be re-fit at model-training time, not baked into a static
    file that could quietly encode one particular split's decisions as
    if they were universal.
    """
    df = carry_forward_cleaning(df)
    df = engineer_surviving_features(df)
    df = encode_binary_columns(df)
    y = df["Churn_numeric"]
    drop_cols = ID_COLS + STRUCTURALLY_REDUNDANT + ["Churn", "Churn_numeric"]
    X = df.drop(columns=drop_cols)
    return X, y


def fit_transform_train(X_train: pd.DataFrame, y_train: pd.Series):
    """Fit every stateful step on training data only. Returns the
    transformed train matrix plus every fitted artifact needed to
    transform new data identically later."""

    # --- IV filter, on whole semantic columns, BEFORE encoding ---
    work = X_train.copy()
    work["Churn_numeric"] = y_train.values
    iv_table = iv_summary(work, list(X_train.columns), "Churn_numeric")
    iv_keep = iv_table[iv_table["iv"] >= IV_THRESHOLD]["feature"].tolist()

    X_filtered = X_train[iv_keep].copy()

    # --- one-hot encode surviving multi-category columns ---
    cat_cols = [c for c in MULTI_CATEGORY_COLS if c in X_filtered.columns]
    cat_categories = {c: sorted(X_filtered[c].dropna().unique().tolist()) for c in cat_cols}
    for c in cat_cols:
        X_filtered[c] = pd.Categorical(X_filtered[c], categories=cat_categories[c])
    X_encoded = pd.get_dummies(X_filtered, columns=cat_cols, drop_first=True).astype(float)

    # --- VIF filter on the encoded numeric matrix ---
    X_vif, vif_dropped, final_vif_table = drop_highest_vif_iteratively(
        X_encoded, threshold=VIF_THRESHOLD
    )

    # --- scale ---
    scaler = StandardScaler()
    X_scaled = pd.DataFrame(
        scaler.fit_transform(X_vif), columns=X_vif.columns, index=X_vif.index
    )

    artifacts = {
        "iv_table": iv_table,
        "iv_keep": iv_keep,
        "cat_cols": cat_cols,
        "cat_categories": cat_categories,
        "vif_dropped": vif_dropped,
        "final_vif_table": final_vif_table,
        "encoded_columns": X_vif.columns.tolist(),
        "scaler": scaler,
    }
    return X_scaled, artifacts


def transform_new(X_new: pd.DataFrame, artifacts: dict) -> pd.DataFrame:
    """Apply an already-fitted pipeline to new data (test set now, or
    production data later). No fitting happens here -- only application
    of decisions already made on training data."""
    X_filtered = X_new[artifacts["iv_keep"]].copy()
    for c in artifacts["cat_cols"]:
        if "cat_categories" in artifacts and c in artifacts["cat_categories"]:
            X_filtered[c] = pd.Categorical(X_filtered[c], categories=artifacts["cat_categories"][c])
    X_encoded = pd.get_dummies(X_filtered, columns=artifacts["cat_cols"], drop_first=True).astype(float)
    # Align exactly to what training produced: a category unseen in this
    # slice gets a 0 column instead of silently shifting every column
    # after it.
    X_encoded = X_encoded.reindex(columns=artifacts["encoded_columns"], fill_value=0)
    X_scaled = pd.DataFrame(
        artifacts["scaler"].transform(X_encoded),
        columns=X_encoded.columns, index=X_encoded.index,
    )
    return X_scaled


def run_stage6_split(df: pd.DataFrame, test_size: float = 0.2, random_state: int = 42):
    """Convenience wrapper: prepare -> split -> fit on train -> transform
    both. This is what the notebook calls."""
    X, y = prepare_features(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )
    X_train_final, artifacts = fit_transform_train(X_train, y_train)
    X_test_final = transform_new(X_test, artifacts)
    return X_train_final, X_test_final, y_train, y_test, artifacts
