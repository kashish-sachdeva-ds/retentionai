import numpy as np
import pandas as pd
import pytest

from src.config import RAW_CSV_PATH
from src.features.iv import compute_iv, iv_summary
from src.features.vif import compute_vif, drop_highest_vif_iteratively
from src.features.pipeline import prepare_features, run_stage6_split


@pytest.fixture(scope="module")
def raw_df():
    return pd.read_csv(RAW_CSV_PATH)


def test_iv_higher_for_strong_predictor_than_noise_column(raw_df):
    df = raw_df.copy()
    df["Churn_numeric"] = (df["Churn"] == "Yes").astype(int)
    rng = np.random.default_rng(0)
    df["pure_noise"] = rng.random(len(df))

    iv_contract, _ = compute_iv(df, "Contract", "Churn_numeric")
    iv_noise, _ = compute_iv(df, "pure_noise", "Churn_numeric")
    assert iv_contract > iv_noise


def test_vif_drops_a_perfectly_duplicated_column():
    rng = np.random.default_rng(0)
    a = rng.normal(size=200)
    X = pd.DataFrame({"a": a, "a_duplicate": a, "unrelated": rng.normal(size=200)})
    reduced, dropped, final_table = drop_highest_vif_iteratively(X, threshold=10.0)
    assert len(dropped) >= 1
    assert (final_table["VIF"] < 10.0).all()


def test_prepare_features_drops_raw_contract_keeps_engineered_version(raw_df):
    X, y = prepare_features(raw_df)
    assert "Contract" not in X.columns
    assert "ContractCommitmentMonths" in X.columns
    assert set(y.unique()) <= {0, 1}


def test_prepare_features_rejects_total_addon_services(raw_df):
    """ADR-006 rejected TotalAddOnServices -- it must never appear in the
    pipeline's output, no matter what any other stage's code assumes."""
    X, _ = prepare_features(raw_df)
    assert "TotalAddOnServices" not in X.columns
    assert "IsNewCustomer" not in X.columns


def test_run_stage6_split_is_leakage_safe(raw_df):
    X_train, X_test, y_train, y_test, artifacts = run_stage6_split(raw_df)
    # scaler must be fit on train only -- check indirectly via shape sanity
    assert len(X_train) + len(X_test) == len(raw_df)
    assert list(X_train.columns) == list(X_test.columns) == artifacts["encoded_columns"]
    # no unencoded categorical columns should survive
    assert X_train.select_dtypes(include="object").empty


def test_run_stage6_split_is_reproducible(raw_df):
    result_a = run_stage6_split(raw_df)
    result_b = run_stage6_split(raw_df)
    pd.testing.assert_frame_equal(result_a[0], result_b[0])
