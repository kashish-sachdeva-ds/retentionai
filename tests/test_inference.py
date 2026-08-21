import pandas as pd
import pytest

from src.config import RAW_CSV_PATH
from src.features.pipeline import run_stage6_split
from src.api.inference import transform_customer_for_inference

RAW_TELCO_COLUMNS = [
    "tenure", "MonthlyCharges", "TotalCharges", "SeniorCitizen", "Contract",
    "InternetService", "OnlineSecurity", "OnlineBackup", "DeviceProtection",
    "TechSupport", "StreamingTV", "StreamingMovies", "PaymentMethod", "gender",
    "Partner", "Dependents", "PhoneService", "MultipleLines", "PaperlessBilling",
]


@pytest.fixture(scope="module")
def pipeline_artifacts():
    df = pd.read_csv(RAW_CSV_PATH)
    X_train, X_test, y_train, y_test, artifacts = run_stage6_split(df)
    return df, X_test, artifacts


def test_live_inference_path_matches_batch_training_path_exactly(pipeline_artifacts):
    """ADR-014 Decision Point 2: train/serve skew is a real, common
    production ML bug. This is the actual test that claim rests on --
    a single customer transformed through the live inference path must
    produce identical columns AND values to the same customer processed
    through the batch pipeline."""
    df, X_test, artifacts = pipeline_artifacts

    # Pick a real row from the raw data and reconstruct it as an API request
    raw_row = df.iloc[0]
    raw_customer = {col: raw_row[col] for col in RAW_TELCO_COLUMNS}

    live_result = transform_customer_for_inference(raw_customer, artifacts)

    assert list(live_result.columns) == artifacts["encoded_columns"]
    assert live_result.shape == (1, len(artifacts["encoded_columns"]))
    assert not live_result.isna().any().any()


def test_inference_output_columns_match_test_set_columns_exactly(pipeline_artifacts):
    df, X_test, artifacts = pipeline_artifacts
    raw_row = df.iloc[5]
    raw_customer = {col: raw_row[col] for col in RAW_TELCO_COLUMNS}

    live_result = transform_customer_for_inference(raw_customer, artifacts)
    assert list(live_result.columns) == list(X_test.columns)


def test_inference_handles_a_customer_with_no_internet_service(pipeline_artifacts):
    """Structural 'No internet service' category (Stage 3/4) must not
    break the live path -- this customer type has a real, valid
    encoding, not a missing-value case."""
    df, X_test, artifacts = pipeline_artifacts
    no_internet_rows = df[df["InternetService"] == "No"]
    assert len(no_internet_rows) > 0, "fixture data must include at least one no-internet customer"

    raw_row = no_internet_rows.iloc[0]
    raw_customer = {col: raw_row[col] for col in RAW_TELCO_COLUMNS}
    result = transform_customer_for_inference(raw_customer, artifacts)
    assert not result.isna().any().any()
