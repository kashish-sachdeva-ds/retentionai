import pandas as pd
import pytest

from src.config import RAW_CSV_PATH
from src.survival.cox import (
    prepare_survival_data, fit_cox_model, fit_cox_model_stratified,
    conditional_churn_probability, kaplan_meier_by_group,
)


@pytest.fixture(scope="module")
def survival_df():
    df = pd.read_csv(RAW_CSV_PATH)
    df["ContractCommitmentMonths"] = df["Contract"].map(
        {"Month-to-month": 0, "One year": 12, "Two year": 24}
    )
    return prepare_survival_data(df)


def test_prepare_survival_data_excludes_total_addon_services(survival_df):
    """ADR-006 rejected this feature; ADR-011 never reintroduced it."""
    assert "TotalAddOnServices" not in survival_df.columns
    assert "IsNewCustomer" not in survival_df.columns


def test_prepare_survival_data_drops_redundant_no_internet_dummy(survival_df):
    """ADR-011 Decision Point 2: TechSupport's 'No internet service'
    duplicates InternetService_No exactly -- must not both be present,
    or Cox's matrix inversion fails the same way it did before the fix."""
    assert "TechSupport_No internet service" not in survival_df.columns
    assert "InternetService_No" in survival_df.columns


def test_cox_model_fits_without_error(survival_df):
    cph = fit_cox_model(survival_df)
    assert cph.concordance_index_ > 0.5  # better than random ranking


def test_cox_model_contract_commitment_reduces_hazard(survival_df):
    """H1: longer commitment should be associated with LOWER hazard
    (hazard ratio < 1), matching the real Stage 10 finding."""
    cph = fit_cox_model(survival_df)
    assert cph.params_["ContractCommitmentMonths"] < 0


def test_stratified_model_drops_the_stratified_covariate_from_params(survival_df):
    cph_strat = fit_cox_model_stratified(survival_df, strata=["InternetService_Fiber optic"])
    assert "InternetService_Fiber optic" not in cph_strat.params_.index


def test_conditional_churn_probability_matches_manual_calculation(survival_df):
    cph = fit_cox_model(survival_df)
    probs = conditional_churn_probability(cph, survival_df, window_months=3)

    covariate_cols = [c for c in survival_df.columns if c not in ("tenure", "Churn")]
    import numpy as np
    times = np.arange(0, int(survival_df["tenure"].max()) + 5)
    surv_funcs = cph.predict_survival_function(survival_df[covariate_cols].iloc[[0]], times=times)
    t0 = int(survival_df["tenure"].iloc[0])
    s0 = surv_funcs.iloc[t0, 0]
    s1 = surv_funcs.iloc[t0 + 3, 0]
    manual = 0.0 if s0 <= 0 else max(0.0, 1 - s1 / s0)

    assert abs(probs[0] - manual) < 1e-9


def test_kaplan_meier_by_group_produces_one_fitter_per_group(survival_df):
    df = pd.read_csv(RAW_CSV_PATH)
    df["ContractCommitmentMonths"] = df["Contract"].map(
        {"Month-to-month": 0, "One year": 12, "Two year": 24}
    )
    fitters = kaplan_meier_by_group(df, group_col="ContractCommitmentMonths")
    assert set(fitters.keys()) == {0, 12, 24}
