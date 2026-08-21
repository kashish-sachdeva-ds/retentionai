"""
Stage 12b -- the production API. Wires together every prior stage's real,
tested artifact into one service:
    Stage 6  -> the leakage-safe pipeline (fit once at startup)
    Stage 8  -> XGBoost champion model (ADR-009 -- confirmed winner on
                real data across PR-AUC, Precision@K, and Recall@K)
    Stage 9  -> isotonic calibration + Mondrian conformal thresholds
    Stage 11 -> Redis-backed Thompson Sampling arm selection
    Stage 12a -> counterfactual search, run as a background task

Known simplification, stated plainly: models are trained fresh at startup
rather than loaded from persisted artifacts (e.g. an MLflow model
registry). Real production would persist and load, not retrain on every
restart -- acceptable here since startup cost is a few seconds on this
dataset size, but it's a real difference from a hardened deployment.

Drift monitoring is deliberately NOT included here. It's a reasonable
future addition, but hasn't earned a place in this stage yet -- no
monitoring module has been built or tested in this project, and adding
one now, alongside everything else in this stage, would repeat exactly
the mistake ADR-000 exists to prevent: reaching for a capability before
the stage that would actually justify and test it.
"""

import os
import uuid
import json
from contextlib import asynccontextmanager

import numpy as np
import pandas as pd
import redis
from fastapi import BackgroundTasks, FastAPI, HTTPException
from typing import Literal

from pydantic import BaseModel, Field
from sklearn.model_selection import train_test_split

from src.api.background import compute_and_store_counterfactual
from src.api.inference import transform_customer_for_inference
from src.api.redis_bandit import select_arm_redis, update_arm_redis
from src.config import RAW_CSV_PATH
from src.features.pipeline import run_stage6_split
from src.modeling.champion import train_xgboost
from src.modeling.calibration import calibrate_model
from src.modeling.conformal import (
    conformal_prediction_sets,
    mondrian_thresholds,
    nonconformity_scores,
)
from src.monitoring.drift import check_drift_report

RECENT_SCORES_KEY = "monitoring:recent_scores"
RECENT_SCORES_MAX = 1000
DRIFT_CHECK_MIN_SAMPLES = 30  # below this, PSI/KS are too noisy on so few points to trust

ARM_NAMES = ["discount", "technician", "control"]
ALPHA_CONFORMAL = 0.05
CONTRACT_MAP = {"Month-to-month": 0, "One year": 12, "Two year": 24}


class ModelState:
    model = None
    calibrated_model = None
    artifacts = None
    conformal_thresholds = None
    rng = None
    reference_scores = None  # calibrated P(churn) on the calibration set --
                              # the baseline distribution live traffic gets compared against


state = ModelState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import pandas as pd
    df = pd.read_csv(RAW_CSV_PATH)

    X_train, X_test, y_train, y_test, artifacts = run_stage6_split(df)

    # Stage 9's calib split: carved from the test set fresh, since Stage 6
    # never built a 3-way split (ADR-007 Decision Point 6 rejected SMOTE
    # and a 3-way split as unearned at that stage). Same random_state as
    # the real Stage 9 notebook, for the same reproducibility reason.
    X_calib, _, y_calib, _ = train_test_split(
        X_test, y_test, test_size=0.5, random_state=7, stratify=y_test
    )

    # ADR-009 (confirmed on real data): XGBoost beats Logistic Regression
    # on PR-AUC, Precision@K, and Recall@K. XGBoost is the real champion.
    model = train_xgboost(X_train, y_train)
    calibrated_model = calibrate_model(model, X_calib, y_calib, method="isotonic")

    calibrated_probs_calib = calibrated_model.predict_proba(X_calib)
    scores = nonconformity_scores(calibrated_probs_calib, y_calib.values)
    thresholds = mondrian_thresholds(scores, y_calib.values, classes=[0, 1], alpha=ALPHA_CONFORMAL)

    state.model = model
    state.calibrated_model = calibrated_model
    state.artifacts = artifacts
    state.conformal_thresholds = thresholds
    state.rng = np.random.default_rng()
    state.reference_scores = calibrated_probs_calib[:, 1]  # the baseline live scores get compared against

    yield
    # no teardown needed -- nothing external is held open besides the
    # Redis connection pool, which redis-py manages on its own


app = FastAPI(title="RetentionAI API", lifespan=lifespan)
# REDIS_HOST defaults to localhost for local dev, but must be overridden to
# the Compose service name ("redis") when running in Docker -- "localhost"
# inside a container means the container itself, not a sibling container.
redis_client = redis.Redis(
    host=os.environ.get("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True
)


NoYes = Literal["No", "Yes"]
NoYesNoInternet = Literal["No", "Yes", "No internet service"]


class CustomerRequest(BaseModel):
    # Bounds are sanity checks, not the real dataset's exact observed
    # range (0-72mo tenure) -- kept a little generous rather than
    # coupling API validation to today's data distribution.
    tenure: int = Field(ge=0, le=100)
    MonthlyCharges: float = Field(ge=0, le=1000)
    TotalCharges: float = Field(ge=0)
    SeniorCitizen: Literal[0, 1]
    Contract: Literal["Month-to-month", "One year", "Two year"]
    InternetService: Literal["DSL", "Fiber optic", "No"]
    OnlineSecurity: NoYesNoInternet
    OnlineBackup: NoYesNoInternet
    DeviceProtection: NoYesNoInternet
    TechSupport: NoYesNoInternet
    StreamingTV: NoYesNoInternet
    StreamingMovies: NoYesNoInternet
    PaymentMethod: Literal[
        "Bank transfer (automatic)",
        "Credit card (automatic)",
        "Electronic check",
        "Mailed check",
    ]
    gender: Literal["Female", "Male"]
    Partner: NoYes
    Dependents: NoYes
    PhoneService: NoYes
    MultipleLines: Literal["No", "Yes", "No phone service"]
    PaperlessBilling: NoYes


class PredictionResponse(BaseModel):
    request_id: str
    calibrated_churn_probability: float
    conformal_prediction_set: list
    recommended_arm: str
    counterfactual_status: str


def _extract_actionable_raw(raw: dict) -> dict:
    """The same three levers src/explain/counterfactual.py's
    ACTIONABLE_GRIDS defines -- kept in sync manually since the API only
    needs the current values, not the grid itself."""
    return {
        "ContractCommitmentMonths": CONTRACT_MAP[raw["Contract"]],
        "OnlineSecurity_Yes": int(raw["OnlineSecurity"] == "Yes"),
        "TechSupport_Yes": int(raw["TechSupport"] == "Yes"),
    }


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": state.model is not None}


@app.post("/predict", response_model=PredictionResponse)
def predict(customer: CustomerRequest, background_tasks: BackgroundTasks):
    if state.model is None:
        raise HTTPException(status_code=503, detail="Model not yet loaded")

    raw = customer.model_dump()
    model_input = transform_customer_for_inference(raw, state.artifacts)

    calibrated_prob = float(state.calibrated_model.predict_proba(model_input)[0, 1])
    redis_client.lpush(RECENT_SCORES_KEY, calibrated_prob)
    redis_client.ltrim(RECENT_SCORES_KEY, 0, RECENT_SCORES_MAX - 1)

    probs_2col = np.array([[1 - calibrated_prob, calibrated_prob]])
    pred_set = conformal_prediction_sets(probs_2col, state.conformal_thresholds, classes=[0, 1])[0]

    recommended_arm = select_arm_redis(redis_client, ARM_NAMES, state.rng)

    request_id = str(uuid.uuid4())
    instance_raw = _extract_actionable_raw(raw)

    background_tasks.add_task(
        compute_and_store_counterfactual,
        request_id,
        state.model,
        model_input.iloc[0],
        instance_raw,
        state.artifacts["scaler"],
        state.artifacts["encoded_columns"],
        redis_client,
    )

    return PredictionResponse(
        request_id=request_id,
        calibrated_churn_probability=calibrated_prob,
        conformal_prediction_set=sorted(pred_set),
        recommended_arm=recommended_arm,
        counterfactual_status="pending",
    )


@app.get("/counterfactual/{request_id}")
def get_counterfactual(request_id: str):
    payload = redis_client.get(f"counterfactual:{request_id}")
    if payload is None:
        return {"status": "pending_or_not_found"}
    return json.loads(payload)


@app.get("/monitoring/drift")
def check_drift():
    """Compares live traffic's calibrated churn-probability distribution
    against the calibration set's reference distribution -- monitoring
    the model's own output, not every input feature individually (see
    src/monitoring/drift.py for why). Genuinely new to this stage, not a
    gap carried over from Stage 12b -- no monitoring module existed
    before this stage built and tested one."""
    recent_raw = redis_client.lrange(RECENT_SCORES_KEY, 0, -1)
    recent_scores = np.array([float(s) for s in recent_raw])

    if len(recent_scores) < DRIFT_CHECK_MIN_SAMPLES:
        return {
            "status": "insufficient_data",
            "n_recent_predictions": len(recent_scores),
            "minimum_required": DRIFT_CHECK_MIN_SAMPLES,
        }

    reference_df = pd.DataFrame({"score": state.reference_scores})
    current_df = pd.DataFrame({"score": recent_scores})
    report = check_drift_report(reference_df, current_df, columns=["score"])
    row = report.iloc[0]

    return {
        "status": "ok",
        "n_recent_predictions": len(recent_scores),
        "psi": row["psi"],
        "psi_interpretation": row["psi_interpretation"],
        "ks_p_value": row["ks_p_value"],
        "ks_drift_detected": bool(row["ks_drift_detected"]),
    }


@app.post("/feedback/{arm_name}")
def submit_feedback(arm_name: str, retained: bool):
    """Real outcome feedback (e.g. from a downstream billing system 30-90
    days later) updates the SAME Redis-backed posterior /predict reads
    from -- this is the live-system half of Thompson Sampling; Stage 11's
    offline replay evaluates a policy's quality before it goes live at
    all."""
    if arm_name not in ARM_NAMES:
        raise HTTPException(status_code=404, detail=f"Unknown arm: {arm_name}")
    update_arm_redis(redis_client, arm_name, reward=int(retained))
    return {"status": "recorded", "arm": arm_name, "retained": retained}
