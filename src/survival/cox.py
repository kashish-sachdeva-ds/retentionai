"""
Stage 10 -- Survival analysis (Cox Proportional Hazards).

Moves from "will this customer churn" (Stages 7-9, a static snapshot
question) to "when" -- using tenure itself as the outcome to explain, not
a predictor. tenure is excluded as a covariate for exactly that reason:
it's the duration being modeled, not something that explains the
duration. (IsNewCustomer isn't in this discussion at all -- it was
rejected outright in Stage 5 / ADR-006 and was never a live feature to
begin with.)

Covariates here are chosen by their own domain reasoning (H1, H2, H5 from
Stage 4), not mechanically inherited from Stage 6's IV/VIF-filtered
classification feature set -- IV/VIF were about explaining binary class
separation, a genuinely different question from explaining how hazard
evolves over time. TotalAddOnServices is deliberately NOT included here --
it was rejected in Stage 5 (ADR-006) for underperforming the raw columns
it was built from, and that verdict doesn't get quietly reversed by
moving to a different kind of model. H2 is re-tested here using the real
raw add-on columns instead.

Also new at this stage: right-censoring. A customer still active as of
data collection hasn't "not churned" -- they've survived AT LEAST this
long, with an unknown future. Treating them as a clean negative class (as
the whole classification pipeline did) throws that distinction away. Cox
PH handles it correctly by construction.
"""

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter


SURVIVAL_COVARIATES = [
    "ContractCommitmentMonths",  # H1: switching cost / commitment
    "SeniorCitizen",             # basic demographic control
]
# Genuinely 3+ level categoricals needing one-hot encoding -- InternetService
# (H5) and TechSupport (re-tests H2 in a time-aware setting, using the real
# raw column rather than the rejected TotalAddOnServices aggregate).
CATEGORICAL_COVARIATES = ["InternetService", "TechSupport"]


def prepare_survival_data(df: pd.DataFrame) -> pd.DataFrame:
    """Build the (duration, event, covariates) frame Cox PH needs.
    duration = tenure (months observed so far)
    event    = Churn (1 = event observed / churned, 0 = right-censored /
               still active as of data collection -- we know they
               survived AT LEAST this long, not their eventual outcome)

    Structural fix, not a workaround: TechSupport's "No internet service"
    category is identical, row for row, to InternetService == "No" --
    the exact same duplication VIF caught in Stage 6, now breaking Cox's
    matrix inversion for the same underlying reason (perfect
    collinearity). InternetService_No already captures "has no internet
    at all"; dropping the redundant TechSupport dummy lets TechSupport_Yes
    represent its actual, distinct effect (having tech support, among
    those who could) without a duplicate column fighting it for the same
    variance.
    """
    cols = ["tenure", "Churn"] + SURVIVAL_COVARIATES + CATEGORICAL_COVARIATES
    work = df[cols].copy()
    work["Churn"] = (work["Churn"] == "Yes").astype(int)
    work = pd.get_dummies(work, columns=CATEGORICAL_COVARIATES, drop_first=True)
    work = work.drop(columns=["TechSupport_No internet service"], errors="ignore")
    # lifelines needs numeric dtypes throughout, including the dummy columns
    bool_cols = work.select_dtypes(include="bool").columns
    work[bool_cols] = work[bool_cols].astype(int)
    return work


def fit_cox_model(survival_df: pd.DataFrame) -> CoxPHFitter:
    cph = CoxPHFitter()
    cph.fit(survival_df, duration_col="tenure", event_col="Churn")
    return cph


def fit_cox_model_stratified(survival_df: pd.DataFrame, strata: list) -> CoxPHFitter:
    """Stratifying by a proportional-hazards-violating covariate gives it
    its own baseline hazard shape per level, instead of forcing it into
    the model's single shared assumption that every covariate's effect is
    a constant multiplier over time.

    Real trade-off, not a free fix: a stratified variable no longer gets
    its own hazard ratio at all -- you can no longer ask "how much does
    going from month-to-month to a 2-year contract change the hazard,"
    only "the baseline hazard shape differs by contract type, and here
    are the remaining covariates' effects within that." Worth the trade
    only when a real assumption check (not an assumption) shows the
    variable actually violates proportional hazards.
    """
    cph = CoxPHFitter()
    cph.fit(survival_df, duration_col="tenure", event_col="Churn", strata=strata)
    return cph


def conditional_churn_probability(
    cph: CoxPHFitter, survival_df: pd.DataFrame, window_months: int = 3
) -> np.ndarray:
    """For each customer: P(churns within the next `window_months` | has
    already survived to their current tenure) = 1 - S(t + window) / S(t).

    This is the time-aware refinement of a static P(churn) -- two
    customers can share the same eventual churn probability while one is
    at risk this month and the other isn't at risk for another year.
    Dividing by S(t) is what makes this a *conditional* probability
    (given survival so far), not just reading the unconditional curve at
    a later time.
    """
    tenure = survival_df["tenure"].values
    max_time = int(tenure.max()) + window_months + 1
    times = np.arange(0, max_time + 1)

    covariate_cols = [c for c in survival_df.columns if c not in ("tenure", "Churn")]
    surv_funcs = cph.predict_survival_function(survival_df[covariate_cols], times=times)

    probs = np.zeros(len(survival_df))
    for i, t in enumerate(tenure):
        t0 = int(t)
        t1 = min(int(t) + window_months, max_time)
        s0 = surv_funcs.iloc[t0, i]
        s1 = surv_funcs.iloc[t1, i]
        probs[i] = 0.0 if s0 <= 0 else max(0.0, 1.0 - (s1 / s0))
    return probs


def kaplan_meier_by_group(df: pd.DataFrame, group_col: str, duration_col: str = "tenure",
                           event_col: str = "Churn") -> dict:
    """Fit a separate (unconditional) KM curve per group -- for plotting,
    and as a model-free sanity check against what the Cox model implies."""
    work = df.copy()
    if work[event_col].dtype == object:
        work[event_col] = (work[event_col] == "Yes").astype(int)
    fitters = {}
    for group_value, group_df in work.groupby(group_col):
        kmf = KaplanMeierFitter()
        kmf.fit(group_df[duration_col], event_observed=group_df[event_col], label=str(group_value))
        fitters[group_value] = kmf
    return fitters
