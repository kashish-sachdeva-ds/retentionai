"""Stage 12b -- the production API. Wires together every prior stage's real,
tested artifact into one service:
    Stage 6  -> the leakage-safe pipeline (fit once at startup)
    Stage 8  -> XGBoost champion model (ADR-009 -- confirmed winner on
                real data across PR-AUC, Precision@K, and Recall@K)
    Stage 9  -> isotonic calibration + Mondrian conformal thresholds
    Stage 11 -> Redis-backed Thompson Sampling arm selection
    Stage 12a -> counterfactual search, run as a background task

Model artifacts are persisted to the models/ directory after training and
loaded on subsequent startups, avoiding a full retrain from CSV every
time. Set FORCE_RETRAIN=1 to retrain and overwrite the saved artifacts.

Post-audit note (Stage 14): the calibration and conformal sets are now
properly disjoint -- calibration is fit on X_calib, conformal thresholds
are computed on a SEPARATE X_conformal split that the calibrator never
saw. The original implementation used the same X_calib for both, which
breaks the exchangeability assumption required for the conformal coverage
guarantee.
"""

import hashlib
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import Literal
from uuid import UUID

import numpy as np
import pandas as pd
import redis
from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, model_validator
from sklearn.model_selection import train_test_split

from src.api.background import compute_and_store_counterfactual, get_stored_counterfactual
from src.api.inference import transform_customer_for_inference
from src.api.redis_bandit import (
    get_arm_posterior,
    record_feedback_once,
    record_prediction_assignment,
    select_arm_redis,
)
from src.api.metrics import MODEL_PREDICTIONS_TOTAL, BANDIT_FEEDBACK_TOTAL
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from src.api.security import (
    RateLimiter,
    RequestContextMiddleware,
    verify_admin_authorization,
)
from src.config import (
    ALLOW_SYNTHETIC_DATA,
    ALLOWED_ORIGINS,
    FORCE_RETRAIN,
    RAW_CSV_PATH,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_URL,
)
from src.features.pipeline import run_stage6_split
from src.modeling.calibration import calibrate_model
from src.modeling.champion import train_xgboost
from src.modeling.conformal import (
    conformal_prediction_sets,
    mondrian_thresholds,
    nonconformity_scores,
)
from src.modeling.evaluation import build_evaluation_report
from src.modeling.persistence import load_artifacts, save_artifacts
from src.monitoring.drift import check_drift_report

RECENT_SCORES_KEY = "monitoring:recent_scores"
RECENT_SCORES_MAX = 1000
DRIFT_CHECK_MIN_SAMPLES = 30  # below this, PSI/KS are too noisy on so few points to trust

ARM_NAMES = ["discount", "technician", "control"]
ALPHA_CONFORMAL = 0.05
CONTRACT_MAP = {"Month-to-month": 0, "One year": 12, "Two year": 24}

# ADR-002: cost-sensitive threshold. The retention team's cost of a false
# positive (~$70 intervention) vs false negative (~$840 lost revenue)
# gives P(churn) > 70/840 ≈ 0.083 as the decision boundary.
CHURN_THRESHOLD = 70.0 / 840.0
EXPECTED_TELCO_ROWS = 7043


class ModelState:
    def __init__(self):
        self.model = None
        self.calibrated_model = None
        self.artifacts = None
        self.conformal_thresholds = None
        self.rng = None
        self.reference_scores = None
        self.model_version = None
        self.evaluation = None


state = ModelState()


def _load_training_data() -> pd.DataFrame:
    """Load the project dataset and reject the CI fixture by default."""
    df = pd.read_csv(RAW_CSV_PATH)
    is_expected_telco_snapshot = len(df) == EXPECTED_TELCO_ROWS
    if not is_expected_telco_snapshot and not ALLOW_SYNTHETIC_DATA:
        raise RuntimeError(
            f"Expected the {EXPECTED_TELCO_ROWS}-row Kaggle Telco snapshot at "
            f"{RAW_CSV_PATH}, found {len(df)} rows. Refusing to serve a "
            "schema-matching synthetic fixture as a real model. Set "
            "ALLOW_SYNTHETIC_DATA=1 only for tests or a clearly labelled demo."
        )
    return df


def _training_data_provenance(df: pd.DataFrame) -> dict:
    """Describe the input used for a persisted artifact without storing PII."""
    is_real_snapshot = len(df) == EXPECTED_TELCO_ROWS
    return {
        "dataset_kind": "telco_kaggle_snapshot" if is_real_snapshot else "synthetic_demo",
        "row_count": int(len(df)),
        "sha256": hashlib.sha256(RAW_CSV_PATH.read_bytes()).hexdigest(),
    }


def _ensure_serving_provenance(training_data: dict) -> None:
    """Reject synthetic/unknown persisted bundles unless the demo opt-in is explicit."""
    if training_data.get("dataset_kind") != "telco_kaggle_snapshot" and not ALLOW_SYNTHETIC_DATA:
        raise RuntimeError(
            "Refusing to serve a persisted model without verified real-data provenance. "
            "Set ALLOW_SYNTHETIC_DATA=1 only for a clearly labelled smoke-test demo, "
            "or retrain with the 7,043-row Kaggle Telco snapshot."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    loaded = None if FORCE_RETRAIN else load_artifacts()

    if loaded:
        _ensure_serving_provenance(loaded["training_data"])
        state.model = loaded["model"]
        state.calibrated_model = loaded["calibrated_model"]
        state.artifacts = loaded["artifacts"]
        state.conformal_thresholds = loaded["thresholds"]
        state.reference_scores = loaded["reference_scores"]
        state.model_version = loaded["version"]
        state.evaluation = loaded["evaluation"]
    else:
        df = _load_training_data()
        training_data = _training_data_provenance(df)

        X_train, X_test, y_train, y_test, artifacts = run_stage6_split(df)

        # Disjoint splits for calibration and conformal guarantees
        X_calib, X_remaining, y_calib, y_remaining = train_test_split(
            X_test, y_test, test_size=0.5, random_state=7, stratify=y_test
        )
        X_conformal, X_holdout, y_conformal, y_holdout = train_test_split(
            X_remaining, y_remaining, test_size=0.5, random_state=7, stratify=y_remaining
        )

        model = train_xgboost(X_train, y_train)
        calibrated_model = calibrate_model(model, X_calib, y_calib, method="isotonic")

        calibrated_probs_conformal = calibrated_model.predict_proba(X_conformal)
        scores = nonconformity_scores(calibrated_probs_conformal, y_conformal.values)
        thresholds = mondrian_thresholds(scores, y_conformal.values, classes=[0, 1], alpha=ALPHA_CONFORMAL)

        reference_scores = calibrated_model.predict_proba(X_calib)[:, 1]
        holdout_probs_2col = calibrated_model.predict_proba(X_holdout)
        holdout_sets = conformal_prediction_sets(
            holdout_probs_2col, thresholds, classes=[0, 1]
        )
        holdout_slices = df.loc[X_holdout.index, ["gender", "SeniorCitizen"]]
        evaluation = build_evaluation_report(
            y_holdout.values,
            holdout_probs_2col[:, 1],
            holdout_sets,
            alpha=ALPHA_CONFORMAL,
            decision_k=100,
            decision_threshold=CHURN_THRESHOLD,
            split_counts={
                "train": len(X_train),
                "calibration": len(X_calib),
                "conformal": len(X_conformal),
                "holdout": len(X_holdout),
            },
            slice_features=holdout_slices,
        )

        state.model = model
        state.calibrated_model = calibrated_model
        state.artifacts = artifacts
        state.conformal_thresholds = thresholds
        state.reference_scores = reference_scores
        state.evaluation = evaluation

        state.model_version = save_artifacts(
            model,
            calibrated_model,
            artifacts,
            thresholds,
            reference_scores,
            evaluation=evaluation,
            training_data=training_data,
        )

    state.rng = np.random.default_rng()
    yield


app = FastAPI(
    title="RetentionAI Public API",
    description=(
        "Production-grade calibrated telecom churn prediction with conformal "
        "uncertainty quantification, Thompson Sampling policy routing, and "
        "counterfactual lever search. All error responses follow RFC 7807."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Versioned API router — all domain endpoints live under /api/v1
v1 = APIRouter(prefix="/api/v1")

# CORS Middleware — allow configured origins plus any *.onrender.com deployment domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Structured Request/Response Logging & Request-ID Middleware
app.add_middleware(RequestContextMiddleware)

# Initialize Redis client with rapid fallback socket timeouts
try:
    if REDIS_URL and REDIS_URL.startswith("redis"):
        redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
        )
    else:
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=0,
            decode_responses=True,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
        )
except Exception:
    redis_client = redis.Redis(
        host="localhost",
        port=6379,
        db=0,
        decode_responses=True,
        socket_connect_timeout=0.25,
        socket_timeout=0.25,
    )

# Rate Limiter
rate_limiter = RateLimiter(redis_client=redis_client)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """RFC 7807 problem details for schema validation errors."""
    req_id = getattr(request.state, "request_id", "unknown")
    errors = exc.errors()
    detail_msg = "; ".join([f"{'.'.join(str(l) for l in err.get('loc', []))}: {err.get('msg', 'Invalid value')}" for err in errors])
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        media_type="application/problem+json",
        content={
            "type": "urn:problem:validation_error",
            "title": "Unprocessable Entity",
            "status": 422,
            "detail": f"Validation failed: {detail_msg}",
            "invalid_params": [{"name": ".".join(str(l) for l in err.get("loc", [])), "reason": err.get("msg", "")} for err in errors],
            "instance": f"urn:uuid:{req_id}"
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """RFC 7807 problem details for HTTP exceptions."""
    req_id = getattr(request.state, "request_id", "unknown")
    return JSONResponse(
        status_code=exc.status_code,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": "Client Error" if exc.status_code < 500 else "Server Error",
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": f"urn:uuid:{req_id}"
        },
    )


@app.exception_handler(Exception)
async def safe_exception_handler(request: Request, exc: Exception):
    """RFC 7807 problem details for unhandled enterprise server errors."""
    req_id = getattr(request.state, "request_id", "unknown")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An internal server error occurred.",
            "instance": f"urn:uuid:{req_id}"
        },
    )


NoYes = Literal["No", "Yes"]
NoYesNoInternet = Literal["No", "Yes", "No internet service"]


class CustomerRequest(BaseModel):
    tenure: int = Field(ge=0, le=100, description="Months the customer has stayed with the company", json_schema_extra={"example": 12})
    MonthlyCharges: float = Field(ge=0, le=1000, description="The amount charged to the customer monthly", json_schema_extra={"example": 59.9})
    TotalCharges: float = Field(ge=0, description="The total amount charged to the customer", json_schema_extra={"example": 718.8})
    SeniorCitizen: Literal[0, 1] = Field(description="Whether the customer is a senior citizen or not", json_schema_extra={"example": 0})
    Contract: Literal["Month-to-month", "One year", "Two year"] = Field(description="The contract term of the customer", json_schema_extra={"example": "Month-to-month"})
    InternetService: Literal["DSL", "Fiber optic", "No"] = Field(description="Customer's internet service provider", json_schema_extra={"example": "Fiber optic"})
    OnlineSecurity: NoYesNoInternet = Field(description="Whether the customer has online security", json_schema_extra={"example": "No"})
    OnlineBackup: NoYesNoInternet = Field(description="Whether the customer has online backup", json_schema_extra={"example": "Yes"})
    DeviceProtection: NoYesNoInternet = Field(description="Whether the customer has device protection", json_schema_extra={"example": "No"})
    TechSupport: NoYesNoInternet = Field(description="Whether the customer has tech support", json_schema_extra={"example": "No"})
    StreamingTV: NoYesNoInternet = Field(description="Whether the customer has streaming TV", json_schema_extra={"example": "Yes"})
    StreamingMovies: NoYesNoInternet = Field(description="Whether the customer has streaming movies", json_schema_extra={"example": "Yes"})
    PaymentMethod: Literal[
        "Bank transfer (automatic)",
        "Credit card (automatic)",
        "Electronic check",
        "Mailed check",
    ] = Field(description="The customer's payment method", json_schema_extra={"example": "Electronic check"})
    gender: Literal["Female", "Male"] = Field(description="Whether the customer is a male or a female", json_schema_extra={"example": "Female"})
    Partner: NoYes = Field(description="Whether the customer has a partner or not", json_schema_extra={"example": "Yes"})
    Dependents: NoYes = Field(description="Whether the customer has dependents or not", json_schema_extra={"example": "No"})
    PhoneService: NoYes = Field(description="Whether the customer has a phone service", json_schema_extra={"example": "Yes"})
    MultipleLines: Literal["No", "Yes", "No phone service"] = Field(description="Whether the customer has multiple lines", json_schema_extra={"example": "No"})
    PaperlessBilling: NoYes = Field(description="Whether the customer has paperless billing", json_schema_extra={"example": "Yes"})

    @model_validator(mode="after")
    def validate_service_dependencies(self):
        internet_addons = [
            "OnlineSecurity",
            "OnlineBackup",
            "DeviceProtection",
            "TechSupport",
            "StreamingTV",
            "StreamingMovies",
        ]
        if self.InternetService == "No":
            for field_name in internet_addons:
                if getattr(self, field_name) != "No internet service":
                    raise ValueError(
                        f"{field_name} must be 'No internet service' when "
                        f"InternetService is 'No', got '{getattr(self, field_name)}'"
                    )
        else:
            for field_name in internet_addons:
                if getattr(self, field_name) == "No internet service":
                    raise ValueError(
                        f"{field_name} cannot be 'No internet service' when "
                        f"InternetService is '{self.InternetService}'"
                    )

        if self.PhoneService == "No" and self.MultipleLines != "No phone service":
            raise ValueError(
                f"MultipleLines must be 'No phone service' when PhoneService "
                f"is 'No', got '{self.MultipleLines}'"
            )
        if self.PhoneService == "Yes" and self.MultipleLines == "No phone service":
            raise ValueError(
                "MultipleLines cannot be 'No phone service' when PhoneService is 'Yes'"
            )
        return self


class PredictionResponse(BaseModel):
    request_id: str = Field(description="Globally unique identifier for the prediction request.")
    model_version: str = Field(description="SHA256 hash of the artifact bundle used to serve this request.")
    calibrated_churn_probability: float = Field(description="Isotonically calibrated probability of churn [0, 1].")
    conformal_prediction_set: list = Field(description="95% marginal coverage Mondrian prediction set.")
    recommended_arm: str = Field(description="Selected treatment arm from the Thompson Sampling Bandit policy.")
    counterfactual_status: str = Field(description="Status of the asynchronous counterfactual lever search.")


def _extract_actionable_raw(raw: dict) -> dict:
    return {
        "ContractCommitmentMonths": CONTRACT_MAP[raw["Contract"]],
        "OnlineSecurity_Yes": int(raw["OnlineSecurity"] == "Yes"),
        "TechSupport_Yes": int(raw["TechSupport"] == "Yes"),
    }


@v1.get("/health", tags=["Operations"], summary="Service readiness check")
def health():
    """Returns model load status and the SHA-256 version of the serving artifact."""
    return {
        "status": "ok",
        "model_loaded": state.model is not None,
        "model_version": state.model_version,
    }


@v1.get("/model-card", tags=["Evidence"], summary="Release evaluation report")
def model_card():
    """Return holdout evaluation metrics, Mondrian coverage, and slice breakdowns
    for the exact artifact currently serving predictions."""
    if state.model is None or state.evaluation is None:
        raise HTTPException(status_code=503, detail="Model evaluation is not yet loaded")
    return {"model_version": state.model_version, "evaluation": state.evaluation}


@v1.post("/predict", response_model=PredictionResponse, tags=["Inference"], summary="Score a single customer")
def predict(customer: CustomerRequest, background_tasks: BackgroundTasks, request: Request):
    """Accepts a customer feature vector, returns an isotonically calibrated
    churn probability, a 95% Mondrian conformal prediction set, the Thompson
    Sampling recommended retention arm, and kicks off an async counterfactual search."""
    if state.model is None:
        raise HTTPException(status_code=503, detail="Model not yet loaded")

    # Rate limiting by client IP
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    if not rate_limiter.check_rate_limit(client_ip, endpoint="predict"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait before scoring more customers.",
        )

    raw = customer.model_dump()
    model_input = transform_customer_for_inference(raw, state.artifacts)

    calibrated_prob = float(state.calibrated_model.predict_proba(model_input)[0, 1])
    try:
        redis_client.lpush(RECENT_SCORES_KEY, calibrated_prob)
        redis_client.ltrim(RECENT_SCORES_KEY, 0, RECENT_SCORES_MAX - 1)
    except Exception:
        pass

    probs_2col = np.array([[1 - calibrated_prob, calibrated_prob]])
    pred_set = conformal_prediction_sets(probs_2col, state.conformal_thresholds, classes=[0, 1])[0]

    recommended_arm = select_arm_redis(redis_client, ARM_NAMES, state.rng)

    request_id = str(uuid.uuid4())
    record_prediction_assignment(
        redis_client, request_id, recommended_arm, state.model_version
    )
    instance_raw = _extract_actionable_raw(raw)

    has_internet = raw["InternetService"] != "No"
    background_tasks.add_task(
        compute_and_store_counterfactual,
        request_id,
        state.calibrated_model,
        model_input.iloc[0],
        instance_raw,
        state.artifacts["scaler"],
        state.artifacts["encoded_columns"],
        redis_client,
        threshold=CHURN_THRESHOLD,
        has_internet=has_internet,
    )

    # Record Prometheus business metric
    MODEL_PREDICTIONS_TOTAL.labels(model_version=state.model_version).inc()

    return PredictionResponse(
        request_id=request_id,
        model_version=state.model_version,
        calibrated_churn_probability=calibrated_prob,
        conformal_prediction_set=sorted(pred_set),
        recommended_arm=recommended_arm,
        counterfactual_status="pending",
    )


@v1.get("/counterfactual/{request_id}", tags=["Inference"], summary="Poll counterfactual search result")
def get_counterfactual(request_id: str):
    """Poll the status of an asynchronous counterfactual lever search initiated by /predict."""
    payload = get_stored_counterfactual(redis_client, request_id)
    if payload is None:
        return {"status": "pending_or_not_found"}
    return payload


@v1.get("/monitoring/drift", tags=["Monitoring"], summary="Distribution drift report")
def check_drift(_: bool = Depends(verify_admin_authorization)):
    """Compares live traffic's calibrated churn-probability distribution
    against the calibration set's reference distribution using PSI and KS tests."""
    try:
        recent_raw = redis_client.lrange(RECENT_SCORES_KEY, 0, -1)
        recent_scores = np.array([float(s) for s in recent_raw])
    except Exception:
        recent_scores = np.array([])

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


@v1.get("/bandit/posteriors", tags=["Policy"], summary="Thompson Sampling posteriors")
def bandit_posteriors():
    """Return the live Beta(α, β) posteriors for each retention policy arm."""
    arms = []
    for arm_name in ARM_NAMES:
        try:
            alpha, beta = get_arm_posterior(redis_client, arm_name)
        except Exception:
            alpha, beta = 1.0, 1.0
        arms.append({
            "arm": arm_name,
            "alpha": alpha,
            "beta": beta,
            "n_observations": int(alpha + beta - 2),
        })
    return {"arms": arms}


class FeedbackRequest(BaseModel):
    request_id: UUID
    retained: bool


@v1.post("/feedback/{arm_name}", tags=["Policy"], summary="Submit retention outcome")
def submit_feedback(
    arm_name: str,
    feedback: FeedbackRequest,
    _: bool = Depends(verify_admin_authorization),
):
    """Record the real outcome (retained / churned) for a previously scored
    customer, updating the Beta posterior of the assigned arm."""
    if arm_name not in ARM_NAMES:
        raise HTTPException(status_code=404, detail=f"Unknown arm: {arm_name}")

    request_id = str(feedback.request_id)
    outcome = record_feedback_once(
        redis_client, request_id, arm_name, feedback.retained
    )
    if outcome == "unknown_prediction":
        raise HTTPException(status_code=404, detail="Unknown or expired prediction request_id")
    if outcome == "arm_mismatch":
        raise HTTPException(
            status_code=422,
            detail="Feedback arm does not match the arm assigned to this prediction",
        )
    if outcome == "duplicate":
        raise HTTPException(status_code=409, detail="Feedback already recorded for this prediction")

    # Record Prometheus business metric
    BANDIT_FEEDBACK_TOTAL.labels(arm=arm_name, retained=str(feedback.retained)).inc()

    return {"status": "recorded", "arm": arm_name, "retained": feedback.retained}


# ---------------------------------------------------------------------------
# Mount the versioned router and add infrastructure endpoints on the root app
# ---------------------------------------------------------------------------
app.include_router(v1)


@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect API root to interactive documentation."""
    return RedirectResponse(url="/docs")


@app.get("/health", include_in_schema=False)
def root_health():
    """Root health check alias for cloud load balancers and orchestrators."""
    return health()


@app.get("/metrics", tags=["Operations"], summary="Prometheus metrics")
def metrics():
    """Expose Prometheus metrics for Grafana / Datadog scraping."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
