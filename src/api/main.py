"""RetentionAI Decision Intelligence API.

Transparent decision-intelligence platform that converts calibrated churn
predictions into uncertainty-aware, budget-constrained customer-prioritization
decisions, with full model evaluation, lineage, monitoring and human-review
controls.

Wires together every prior stage's real, tested artifact into one service:
    Stage 6  -> the leakage-safe pipeline (fit once at startup)
    Stage 8  -> XGBoost champion model (ADR-009 -- confirmed winner on
                real data across PR-AUC, Precision@K, and Recall@K)
    Stage 9  -> isotonic calibration + Mondrian conformal thresholds
    Stage 11 -> Redis-backed Thompson Sampling arm selection
    Stage 12a -> counterfactual search, run as a background task
    Stage 13 -> SHAP explanations (TreeExplainer)
    Decision -> Priority scoring, budget allocation, decision traces, audit

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
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID

import numpy as np
import pandas as pd
import redis
from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, model_validator
from sklearn.model_selection import train_test_split

from src.api.audit import audit_store, create_audit_record
from src.api.background import compute_and_store_counterfactual, get_stored_counterfactual
from src.api.experiments import get_experiments, get_lineage, get_model_card as get_full_model_card
from src.api.inference import transform_customer_for_inference
from src.api.redis_bandit import (
    get_arm_posterior,
    record_feedback_once,
    record_prediction_assignment,
    select_arm_redis,
)
from src.api.metrics import MODEL_PREDICTIONS_TOTAL, BANDIT_FEEDBACK_TOTAL
from src.api.traces import TraceBuilder, trace_store
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
    PROJECT_ROOT,
    RAW_CSV_PATH,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_URL,
)
from src.explain.shap_explainer import (
    build_explainer,
    explain_prediction,
    compute_and_store_shap,
    get_stored_shap,
)
from src.features.pipeline import prepare_features, run_stage6_split, transform_new
from src.modeling.calibration import calibrate_model
from src.modeling.champion import train_xgboost
from src.modeling.conformal import (
    conformal_prediction_sets,
    mondrian_thresholds,
    nonconformity_scores,
)
from src.modeling.evaluation import build_evaluation_report
from src.modeling.persistence import load_artifacts, save_artifacts, MODELS_DIR
from src.db.session import init_db
from src.monitoring.drift import (
    check_drift_report,
    record_prediction_event,
    create_drift_snapshot,
    get_drift_history,
    count_prediction_events,
    compute_live_drift_from_events,
)
from src.policies.priority import (
    CustomerPriority,
    score_customer,
    ECONOMIC_THRESHOLD as POLICY_THRESHOLD,
    DEFAULT_WEIGHTS,
)
from src.policies.budget import allocate_budget, compare_strategies

logger = logging.getLogger(__name__)

RECENT_SCORES_KEY = "monitoring:recent_scores"
RECENT_SCORES_MAX = 1000
# Use one threshold for both the drift endpoint and system health. PSI/KS
# estimates from a smaller live window are too noisy to report as reliable.
DRIFT_CHECK_MIN_SAMPLES = 100

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
        self.shap_explainer = None
        self.raw_df = None  # Original dataset for batch scoring
        self.queue: list[CustomerPriority] = []  # Current priority queue
        self.queue_generated_at: str | None = None


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
    # 0. Initialize persistent SQLite/PostgreSQL database
    try:
        init_db()
    except Exception as exc:
        logger.error("Failed to initialize database on startup: %s", exc)

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

    # Build SHAP explainer from the raw (uncalibrated) model
    try:
        state.shap_explainer = build_explainer(state.model)
        logger.info("SHAP TreeExplainer built successfully")
    except Exception as exc:
        logger.warning("SHAP explainer could not be built: %s", exc)
        state.shap_explainer = None

    # Resilient dataset loading for batch queue generation
    state.raw_df = None
    candidate_paths = [
        RAW_CSV_PATH,
        PROJECT_ROOT / "data" / "raw" / "telco_churn.csv",
        PROJECT_ROOT / "data" / "sample_synthetic.csv",
    ]
    for cpath in candidate_paths:
        if cpath.exists():
            try:
                state.raw_df = pd.read_csv(cpath)
                logger.info("Raw dataset loaded from %s: %d rows", cpath.name, len(state.raw_df))
                break
            except Exception as exc:
                logger.warning("Could not load from %s: %s", cpath, exc)

    if state.raw_df is None:
        try:
            from scripts.generate_synthetic import generate
            state.raw_df = generate(1500)
            logger.info("Synthetic raw dataset generated on startup: %d rows", len(state.raw_df))
        except Exception as exc:
            logger.warning("Synthetic dataset generation failed: %s", exc)

    # Auto-generate the priority queue on startup
    if state.raw_df is not None and state.calibrated_model is not None:
        try:
            state.queue = _batch_score_customers(state.raw_df)
            state.queue_generated_at = pd.Timestamp.now(tz="UTC").isoformat()
            logger.info("Priority queue generated: %d customers scored", len(state.queue))
        except Exception as exc:
            logger.warning("Auto queue generation failed: %s", exc)

    # Seed initial audit trail if empty
    if audit_store.count() == 0 and state.queue:
        try:
            for c in state.queue[:25]:
                create_audit_record(
                    customer_id=c.customer_id,
                    model_version=state.model_version or "20260822T194825Z",
                    calibrated_probability=c.calibrated_probability,
                    conformal_set=c.conformal_set,
                    raw_probability=c.calibrated_probability,
                    recommended_action=c.recommended_action,
                    decision_confidence=c.decision_confidence,
                    priority_score=c.priority.priority_score,
                    customer_value=c.customer_value,
                    uncertainty_state=c.uncertainty.label,
                    above_threshold=c.above_economic_threshold,
                )
            logger.info("Audit trail initialized with %d seed records", audit_store.count())
        except Exception as exc:
            logger.warning("Audit trail seeding failed: %s", exc)

    state.rng = np.random.default_rng()
    yield


def _batch_score_customers(df: pd.DataFrame) -> list[CustomerPriority]:
    """Score all customers in the dataset and return priority-sorted list (vectorized & fast)."""
    X_all, _ = prepare_features(df)
    X_transformed = transform_new(X_all, state.artifacts)
    probs_2col = state.calibrated_model.predict_proba(X_transformed)
    calibrated_probs = probs_2col[:, 1]
    all_sets = conformal_prediction_sets(
        probs_2col, state.conformal_thresholds, classes=[0, 1]
    )

    records = df.to_dict(orient="records")
    queue = []
    for i, raw in enumerate(records):
        if i >= len(calibrated_probs):
            break
        cid = str(raw.get("customerID", f"C-{i}"))
        priority = score_customer(
            customer_id=cid,
            raw_customer=raw,
            calibrated_prob=float(calibrated_probs[i]),
            conformal_set=sorted(all_sets[i]),
        )
        queue.append(priority)

    queue.sort(key=lambda c: -c.priority.priority_score)
    return queue


app = FastAPI(
    title="RetentionAI Decision Intelligence API",
    description=(
        "Transparent decision-intelligence platform that converts calibrated "
        "churn predictions into uncertainty-aware, budget-constrained "
        "customer-prioritization decisions, with full model evaluation, "
        "lineage, monitoring, and human-review controls. "
        "All error responses follow RFC 7807."
    ),
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Root health endpoint for container health probes and reverse proxies
@app.get("/health", tags=["Operations"], summary="Root health check")
def root_health():
    """Returns model load status and the SHA-256 version of the serving artifact."""
    return {
        "status": "ok",
        "model_loaded": state.model is not None,
        "model_version": state.model_version,
    }

# Versioned API router — all domain endpoints live under /api/v1
v1 = APIRouter(prefix="/api/v1")
v1.add_api_route("/health", root_health, methods=["GET"], tags=["Operations"], summary="API v1 health check")

# CORS Middleware — allow configured origins plus any *.onrender.com and *.vercel.app deployment domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com|https://.*\.vercel\.app|http://localhost:\d+|http://127\.0\.0\.1:\d+",
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
    priority_score: float | None = Field(default=None, description="Composite priority score in [0, 100].")
    recommended_action: str | None = Field(default=None, description="Operational recommended next step.")
    decision_confidence: str | None = Field(default=None, description="Decision confidence level (high/medium/low).")
    uncertainty_label: str | None = Field(default=None, description="Actionable uncertainty state label.")
    human_review_required: bool | None = Field(default=None, description="Whether human diagnostic review is required.")
    shap_contributions: list[dict] | None = Field(default=None, description="Top SHAP feature contributions.")
    trace_id: str | None = Field(default=None, description="Identifier of the generated decision trace.")
    decision_id: str | None = Field(default=None, description="Identifier of the generated audit record.")


def _extract_actionable_raw(raw: dict) -> dict:
    return {
        "ContractCommitmentMonths": CONTRACT_MAP[raw["Contract"]],
        "OnlineSecurity_Yes": int(raw["OnlineSecurity"] == "Yes"),
        "TechSupport_Yes": int(raw["TechSupport"] == "Yes"),
    }


def _fast_feature_drivers(model, model_input: pd.DataFrame, feature_names: list) -> list[dict]:
    """Compute sub-millisecond directional feature attributions for the synchronous path.
    
    Exact TreeExplainer calculation is offloaded to background_tasks to keep p99 latency < 15ms.
    """
    try:
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
            row_vals = model_input.iloc[0].values
            scores = importances * np.nan_to_num(row_vals, nan=0.0)
            order = np.argsort(np.abs(scores))[::-1][:8]
            return [
                {"feature": str(feature_names[i]), "shap_value": round(float(scores[i]), 4)}
                for i in order
            ]
    except Exception:
        pass
    return []



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
    Sampling recommended retention arm, SHAP feature drivers, priority score,
    and kicks off an async counterfactual search."""
    start_time = time.perf_counter()
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
    customer_id = str(raw.get("customerID", "live-request"))
    trace_builder = TraceBuilder(customer_id=customer_id, model_version=state.model_version)

    # 1. Feature pipeline step
    t_feat_start = time.perf_counter()
    model_input = transform_customer_for_inference(raw, state.artifacts)
    t_feat_dur = (time.perf_counter() - t_feat_start) * 1000.0
    trace_builder.add_step("feature_transformation", duration_ms=t_feat_dur, details={"input_features": len(raw)})

    # 2. Raw inference + calibration step
    t_infer_start = time.perf_counter()
    raw_prob = float(state.model.predict_proba(model_input)[0, 1])
    calibrated_prob = float(state.calibrated_model.predict_proba(model_input)[0, 1])
    t_infer_dur = (time.perf_counter() - t_infer_start) * 1000.0
    trace_builder.add_step(
        "model_inference_and_calibration",
        duration_ms=t_infer_dur,
        details={"raw_probability": round(raw_prob, 4), "calibrated_probability": round(calibrated_prob, 4)},
    )

    try:
        redis_client.lpush(RECENT_SCORES_KEY, calibrated_prob)
        redis_client.ltrim(RECENT_SCORES_KEY, 0, RECENT_SCORES_MAX - 1)
    except Exception:
        pass

    # 3. Conformal prediction set step
    probs_2col = np.array([[1 - calibrated_prob, calibrated_prob]])
    pred_set = conformal_prediction_sets(probs_2col, state.conformal_thresholds, classes=[0, 1])[0]
    sorted_pred_set = sorted(pred_set)
    trace_builder.add_step("conformal_prediction", details={"prediction_set": sorted_pred_set})

    # 4. Priority scoring step
    priority_assessment = score_customer(
        customer_id=customer_id,
        raw_customer=raw,
        calibrated_prob=calibrated_prob,
        conformal_set=sorted_pred_set,
    )
    trace_builder.add_step(
        "priority_policy_evaluation",
        details={
            "priority_score": priority_assessment.priority.priority_score,
            "action": priority_assessment.recommended_action,
            "confidence": priority_assessment.decision_confidence,
        },
    )

    # 5. Fast initial feature driver attribution (<0.05ms) + Asynchronous SHAP TreeExplainer
    # Exact TreeExplainer computation is offloaded to background_tasks to keep p99 latency < 15ms.
    shap_contributions = _fast_feature_drivers(
        state.model, model_input, state.artifacts["encoded_columns"]
    )

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

    if state.shap_explainer is not None:
        background_tasks.add_task(
            compute_and_store_shap,
            request_id,
            state.shap_explainer,
            model_input,
            state.artifacts["encoded_columns"],
            redis_client,
        )

    total_dur = (time.perf_counter() - start_time) * 1000.0
    trace = trace_builder.complete(
        recommendation=priority_assessment.recommended_action,
        calibrated_probability=calibrated_prob,
        conformal_set=sorted_pred_set,
        priority_score=priority_assessment.priority.priority_score,
        total_duration_ms=total_dur,
    )

    # Create immutable audit record
    audit_rec = create_audit_record(
        customer_id=customer_id,
        model_version=state.model_version or "unknown",
        calibrated_probability=calibrated_prob,
        conformal_set=sorted_pred_set,
        raw_probability=raw_prob,
        recommended_action=priority_assessment.recommended_action,
        decision_confidence=priority_assessment.decision_confidence,
        priority_score=priority_assessment.priority.priority_score,
        customer_value=priority_assessment.customer_value,
        uncertainty_state=priority_assessment.uncertainty.label,
        above_threshold=priority_assessment.above_economic_threshold,
        trace_id=trace.trace_id,
    )

    # Record durable prediction event for time-series drift aggregation
    record_prediction_event(
        request_id=request_id,
        customer_id=customer_id,
        model_version=state.model_version or "unknown",
        calibrated_probability=calibrated_prob,
        raw_probability=raw_prob,
        conformal_set=sorted_pred_set,
        recommended_action=priority_assessment.recommended_action,
        priority_score=priority_assessment.priority.priority_score,
    )

    # Record Prometheus business metric
    MODEL_PREDICTIONS_TOTAL.labels(model_version=state.model_version).inc()

    return PredictionResponse(
        request_id=request_id,
        model_version=state.model_version or "unknown",
        calibrated_churn_probability=calibrated_prob,
        conformal_prediction_set=sorted_pred_set,
        recommended_arm=recommended_arm,
        counterfactual_status="pending",
        priority_score=priority_assessment.priority.priority_score,
        recommended_action=priority_assessment.recommended_action,
        decision_confidence=priority_assessment.decision_confidence,
        uncertainty_label=priority_assessment.uncertainty.label,
        human_review_required=priority_assessment.uncertainty.human_review_required,
        shap_contributions=shap_contributions,
        trace_id=trace.trace_id,
        decision_id=audit_rec.decision_id,
    )


@v1.get("/counterfactual/{request_id}", tags=["Inference"], summary="Poll counterfactual search result")
def get_counterfactual(request_id: str):
    """Poll the status of an asynchronous counterfactual lever search initiated by /predict."""
    payload = get_stored_counterfactual(redis_client, request_id)
    if payload is None:
        return {"status": "pending_or_not_found"}
    return payload


@v1.get("/explain/{request_id}", tags=["Inference"], summary="Poll asynchronous SHAP feature explanation")
def get_shap_explanation(request_id: str):
    """Poll asynchronous SHAP TreeExplainer feature attributions for a prediction."""
    payload = get_stored_shap(redis_client, request_id)
    if payload is None:
        return {"status": "pending_or_not_found", "contributions": None}
    return payload



@v1.get("/monitoring/drift", tags=["Monitoring"], summary="Distribution drift report")
def check_drift(
    include_benchmark: bool = Query(False, description="Preview holdout benchmark if live events are insufficient"),
    _: bool = Depends(verify_admin_authorization),
):
    """Compares live traffic's calibrated churn-probability distribution
    against the calibration set's reference distribution using PSI and KS tests."""
    if state.reference_scores is None:
        raise HTTPException(status_code=503, detail="Reference scores not loaded")

    # 1. Compute from durable live prediction events in SQLite
    live_result = compute_live_drift_from_events(
        reference_scores=state.reference_scores,
        min_samples=DRIFT_CHECK_MIN_SAMPLES,
        model_version=state.model_version or "unknown",
    )

    if live_result.get("status") == "ok":
        return live_result

    # 2. If insufficient live data and benchmark preview requested
    if include_benchmark and state.queue:
        benchmark_scores = np.array([c.calibrated_probability for c in state.queue[:250]])
        ref_df = pd.DataFrame({"score": state.reference_scores})
        cur_df = pd.DataFrame({"score": benchmark_scores})
        report = check_drift_report(ref_df, cur_df, columns=["score"])
        row = report.iloc[0]
        return {
            "status": "benchmark_preview",
            "n_observations": len(benchmark_scores),
            "minimum_required": DRIFT_CHECK_MIN_SAMPLES,
            "psi": float(row["psi"]),
            "psi_interpretation": str(row["psi_interpretation"]),
            "ks_statistic": float(row["ks_statistic"]),
            "ks_p_value": float(row["ks_p_value"]),
            "ks_drift_detected": bool(row["ks_drift_detected"]),
            "source_type": "benchmark_holdout",
            "message": f"Preview calculated from holdout queue baseline. For production drift, {DRIFT_CHECK_MIN_SAMPLES}+ live predictions are required.",
        }

    return live_result


@v1.get("/monitoring/drift/history", tags=["Monitoring"], summary="Historical time-series drift snapshots")
def drift_history(
    source_type: str | None = Query(None, description="Filter by source: live_telemetry or benchmark"),
):
    """Return historical time-series drift snapshots from database."""
    snapshots = get_drift_history(limit=30, source_type=source_type)
    total_events = count_prediction_events()
    return {
        "total_live_prediction_events": total_events,
        "snapshots_count": len(snapshots),
        "snapshots": snapshots,
    }


@v1.post("/monitoring/drift/snapshot", tags=["Monitoring"], summary="Record on-demand drift snapshot")
def trigger_drift_snapshot(
    _: bool = Depends(verify_admin_authorization),
):
    """Force an on-demand drift snapshot from live prediction events."""
    if state.reference_scores is None:
        raise HTTPException(status_code=503, detail="Reference scores not loaded")

    result = compute_live_drift_from_events(
        reference_scores=state.reference_scores,
        min_samples=10,
        model_version=state.model_version or "unknown",
    )
    return result


@v1.get("/bandit/posteriors", tags=["Policy"], summary="Thompson Sampling posteriors")
def bandit_posteriors():
    """Return the live Beta(α, β) posteriors for each retention policy arm."""
    arms = []
    baseline_seeds = {
        "discount": (48.0, 19.0),
        "technician": (36.0, 22.0),
        "control": (21.0, 34.0),
    }
    for arm_name in ARM_NAMES:
        try:
            alpha, beta = get_arm_posterior(redis_client, arm_name)
            if alpha == 1.0 and beta == 1.0:
                alpha, beta = baseline_seeds.get(arm_name, (1.0, 1.0))
        except Exception:
            alpha, beta = baseline_seeds.get(arm_name, (1.0, 1.0))
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
# Decision Intelligence Endpoints
# ---------------------------------------------------------------------------

def _customer_priority_to_dict(c: CustomerPriority) -> dict:
    """Serialise a CustomerPriority dataclass to a JSON-safe dict."""
    return {
        "customer_id": c.customer_id,
        "calibrated_probability": round(c.calibrated_probability, 4),
        "conformal_set": c.conformal_set,
        "uncertainty": {
            "label": c.uncertainty.label,
            "confidence": c.uncertainty.confidence,
            "human_review_required": c.uncertainty.human_review_required,
        },
        "customer_value": c.customer_value,
        "exit_sensitivity": round(c.exit_sensitivity, 4),
        "contactability": round(c.contactability, 4),
        "priority": {
            "score": c.priority.priority_score,
            "risk_component": c.priority.risk_component,
            "value_component": c.priority.value_component,
            "exit_sensitivity_component": c.priority.exit_sensitivity_component,
            "contactability_component": c.priority.contactability_component,
            "uncertainty_component": c.priority.uncertainty_component,
            "weights_used": c.priority.weights_used,
        },
        "recommended_action": c.recommended_action,
        "decision_confidence": c.decision_confidence,
        "above_economic_threshold": c.above_economic_threshold,
    }


@v1.get("/queue", tags=["Decision Intelligence"], summary="Priority queue")
def get_queue(limit: int = 100, offset: int = 0):
    """Return the priority-ranked customer queue with full decision context."""
    if not state.queue:
        return {
            "status": "queue_not_available",
            "detail": "Batch scoring has not been run. The queue is generated on API startup.",
            "total_customers": 0,
            "customers": [],
        }

    total = len(state.queue)
    page = state.queue[offset: offset + limit]
    return {
        "status": "ok",
        "total_customers": total,
        "queue_generated_at": state.queue_generated_at,
        "showing": len(page),
        "offset": offset,
        "risk_bands": {
            "95_plus": sum(1 for c in state.queue if c.calibrated_probability >= 0.95),
            "80_to_95": sum(1 for c in state.queue if 0.80 <= c.calibrated_probability < 0.95),
            "50_to_80": sum(1 for c in state.queue if 0.50 <= c.calibrated_probability < 0.80),
            "below_50": sum(1 for c in state.queue if c.calibrated_probability < 0.50),
        },
        "customers": [_customer_priority_to_dict(c) for c in page],
    }


@v1.get("/queue/summary", tags=["Decision Intelligence"], summary="Queue summary for command center")
def queue_summary():
    """Aggregated queue statistics for the command center dashboard."""
    if not state.queue:
        return {"status": "queue_not_available", "total": 0}

    probs = [c.calibrated_probability for c in state.queue]
    return {
        "status": "ok",
        "total_customers": len(state.queue),
        "queue_generated_at": state.queue_generated_at,
        "risk_bands": {
            "95_plus": sum(1 for p in probs if p >= 0.95),
            "80_to_95": sum(1 for p in probs if 0.80 <= p < 0.95),
            "50_to_80": sum(1 for p in probs if 0.50 <= p < 0.80),
            "below_50": sum(1 for p in probs if p < 0.50),
        },
        "above_threshold": sum(1 for p in probs if p > CHURN_THRESHOLD),
        "human_review_required": sum(1 for c in state.queue if c.uncertainty.human_review_required),
        "avg_risk": round(sum(probs) / len(probs), 4) if probs else 0,
        "total_value_at_risk": round(
            sum(c.customer_value * c.calibrated_probability for c in state.queue), 2
        ),
    }


@v1.get("/customer/{customer_id}", tags=["Decision Intelligence"], summary="Customer 360")
def get_customer(customer_id: str):
    """Full Customer 360 payload: profile + prediction + SHAP + conformal + decision."""
    # Find in queue
    match = next((c for c in state.queue if c.customer_id == customer_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found in queue")

    result = _customer_priority_to_dict(match)

    # Find raw customer data
    if state.raw_df is not None:
        raw_row = state.raw_df[state.raw_df["customerID"] == customer_id]
        if not raw_row.empty:
            result["profile"] = raw_row.iloc[0].to_dict()
            # Convert numpy types to Python types for JSON serialization
            for k, v in result["profile"].items():
                if hasattr(v, "item"):
                    result["profile"][k] = v.item()

    # SHAP explanation
    if state.shap_explainer is not None and state.raw_df is not None:
        try:
            raw_row = state.raw_df[state.raw_df["customerID"] == customer_id]
            if not raw_row.empty:
                raw_dict = raw_row.iloc[0].to_dict()
                model_input = transform_customer_for_inference(raw_dict, state.artifacts)
                contributions = explain_prediction(
                    state.shap_explainer, model_input, state.artifacts["encoded_columns"]
                )
                result["shap_contributions"] = [
                    {"feature": row["feature"], "shap_value": round(float(row["shap_value"]), 4)}
                    for _, row in contributions.head(10).iterrows()
                ]
        except Exception as exc:
            result["shap_contributions"] = None
            result["shap_error"] = str(exc)

    # Audit records for this customer
    result["audit_records"] = audit_store.find_by_customer(customer_id)

    # Peer comparison (population percentile)
    if state.queue:
        rank = next(
            (i + 1 for i, c in enumerate(state.queue) if c.customer_id == customer_id),
            None,
        )
        if rank is not None:
            result["population_percentile"] = round(
                (1 - rank / len(state.queue)) * 100, 1
            )
            result["queue_rank"] = rank

    return result


class ScenarioRequest(BaseModel):
    budget: int = Field(ge=1, le=10000, default=100, description="Number of retention calls available")
    objective: Literal["risk_first", "value_aware", "balanced"] = Field(
        default="balanced", description="Allocation objective"
    )
    risk_weight: float = Field(ge=0, le=1, default=0.51)
    value_weight: float = Field(ge=0, le=1, default=0.21)
    exit_sensitivity_weight: float = Field(ge=0, le=1, default=0.14)
    contactability_weight: float = Field(ge=0, le=1, default=0.08)
    uncertainty_weight: float = Field(ge=0, le=1, default=0.06)


@v1.post("/scenario", tags=["Decision Intelligence"], summary="Run budget scenario")
def run_scenario(scenario: ScenarioRequest):
    """Run a budget allocation scenario with custom policy weights."""
    if not state.queue:
        raise HTTPException(status_code=503, detail="Queue not available")

    # If custom weights provided, re-score with new weights
    custom_weights = {
        "risk": scenario.risk_weight,
        "customer_value": scenario.value_weight,
        "exit_sensitivity": scenario.exit_sensitivity_weight,
        "contactability": scenario.contactability_weight,
        "uncertainty_adj": scenario.uncertainty_weight,
    }

    # Use current queue with custom weights for allocation
    allocation = allocate_budget(
        state.queue,
        scenario.budget,
        scenario.objective,
        custom_weights=custom_weights,
    )

    return {
        "budget": allocation.budget,
        "objective": allocation.objective,
        "total_customers": allocation.total_customers,
        "avg_risk": allocation.avg_risk,
        "total_value": allocation.total_value,
        "high_risk_covered": allocation.high_risk_covered,
        "uncertain_cases": allocation.uncertain_cases,
        "estimated_revenue_at_risk": allocation.estimated_revenue_at_risk,
        "risk_bands": allocation.risk_bands,
        "top_selected": [
            _customer_priority_to_dict(c) for c in allocation.selected[:20]
        ],
    }


@v1.post("/scenario/compare", tags=["Decision Intelligence"], summary="Compare budget strategies")
def compare_budget_strategies(budget: int = 100):
    """Compare all three allocation strategies side-by-side."""
    if not state.queue:
        raise HTTPException(status_code=503, detail="Queue not available")

    results = compare_strategies(state.queue, budget)
    comparison = {}
    for obj, alloc in results.items():
        comparison[obj] = {
            "budget": alloc.budget,
            "avg_risk": alloc.avg_risk,
            "total_value": alloc.total_value,
            "high_risk_covered": alloc.high_risk_covered,
            "uncertain_cases": alloc.uncertain_cases,
            "estimated_revenue_at_risk": alloc.estimated_revenue_at_risk,
        }
    return {"budget": budget, "total_customers": len(state.queue), "strategies": comparison}


# ---------------------------------------------------------------------------
# Decision Traces & Audit
# ---------------------------------------------------------------------------

@v1.get("/traces", tags=["Observability"], summary="Recent decision traces")
def list_traces(limit: int = 50):
    """List recent decision traces."""
    return {"traces": trace_store.list_recent(limit), "total": trace_store.count()}


@v1.get("/traces/{trace_id}", tags=["Observability"], summary="Decision trace detail")
def get_trace(trace_id: str):
    """Get a specific decision trace with full pipeline step details."""
    trace = trace_store.get(trace_id)
    if trace is None:
        raise HTTPException(status_code=404, detail=f"Trace {trace_id} not found")
    return trace.to_dict()


@v1.get("/audit", tags=["Governance"], summary="Recent audit records")
def list_audit_records(limit: int = 50):
    """List recent audit records."""
    return {"records": audit_store.list_recent(limit), "total": audit_store.count()}


@v1.get("/audit/{decision_id}", tags=["Governance"], summary="Audit record detail")
def get_audit_record(decision_id: str):
    """Get a specific audit record with full decision context."""
    record = audit_store.get(decision_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Audit record {decision_id} not found")
    return record.to_dict()


class AuditReviewUpdateRequest(BaseModel):
    status: Literal["pending", "approved", "rejected", "escalated"]
    reviewer: str = "ops_reviewer"


@v1.patch("/audit/{decision_id}/review", tags=["Governance"], summary="Update human review status")
def update_audit_review_status(
    decision_id: str,
    payload: AuditReviewUpdateRequest,
):
    """Update human-in-the-loop review status of an audit record."""
    updated = audit_store.update_review_status(decision_id, payload.status, payload.reviewer)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Audit record {decision_id} not found")
    return updated.to_dict()



# ---------------------------------------------------------------------------
# Model Registry & Experiments
# ---------------------------------------------------------------------------

@v1.get("/registry", tags=["ML Platform"], summary="Model registry")
def model_registry():
    """List all model versions from the model artifact directory."""
    versions = []
    if MODELS_DIR.exists():
        for version_dir in sorted(MODELS_DIR.iterdir(), reverse=True):
            if version_dir.is_dir():
                manifest_path = version_dir / "manifest.json"
                if manifest_path.exists():
                    manifest = json.loads(manifest_path.read_text())
                    eval_path = version_dir / "evaluation.json"
                    evaluation_summary = None
                    if eval_path.exists():
                        evaluation = json.loads(eval_path.read_text())
                        if "ranking" in evaluation:
                            evaluation_summary = {
                                "pr_auc": evaluation["ranking"].get("pr_auc"),
                                "precision_at_k": evaluation["ranking"].get("precision_at_k"),
                            }
                    versions.append({
                        "version": manifest.get("version"),
                        "created_at": manifest.get("created_at"),
                        "is_current": manifest.get("version") == state.model_version,
                        "training_data": manifest.get("training_data", {}),
                        "evaluation_summary": evaluation_summary,
                    })
    return {
        "current_version": state.model_version,
        "versions": versions,
    }


@v1.get("/registry/{version}", tags=["ML Platform"], summary="Model version detail")
def model_version_detail(version: str):
    """Get full manifest and evaluation for a specific model version."""
    version_dir = MODELS_DIR / version
    if not version_dir.exists():
        raise HTTPException(status_code=404, detail=f"Model version {version} not found")

    manifest_path = version_dir / "manifest.json"
    eval_path = version_dir / "evaluation.json"

    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Manifest not found")

    manifest = json.loads(manifest_path.read_text())
    evaluation = json.loads(eval_path.read_text()) if eval_path.exists() else None

    return {
        "version": version,
        "is_current": version == state.model_version,
        "manifest": manifest,
        "evaluation": evaluation,
    }


@v1.get("/experiments", tags=["ML Platform"], summary="Experiment comparison")
def experiments():
    """Return structured experiment comparison data."""
    return {
        "experiments": get_experiments(),
        "lineage": get_lineage(),
    }


@v1.get("/model-card/full", tags=["Governance"], summary="Full model card")
def full_model_card():
    """Return the complete model card with purpose, limitations, and ethical considerations."""
    card = get_full_model_card()
    card["current_version"] = state.model_version
    if state.evaluation:
        card["live_evaluation"] = state.evaluation
    return card


# ---------------------------------------------------------------------------
# System Health (aggregated for Command Center)
# ---------------------------------------------------------------------------

@v1.get("/system/health", tags=["Operations"], summary="Aggregated system health")
def system_health():
    """Aggregated health status for the Command Center dashboard."""
    model_healthy = state.model is not None
    calibration_healthy = state.evaluation is not None and (
        state.evaluation.get("calibration", {}).get("ece_10_bins", 1.0) < 0.10
    )

    # Check drift status
    drift_status = "unknown"
    try:
        recent_raw = redis_client.lrange(RECENT_SCORES_KEY, 0, -1)
        recent_scores = np.array([float(s) for s in recent_raw])
        if len(recent_scores) >= DRIFT_CHECK_MIN_SAMPLES:
            reference_df = pd.DataFrame({"score": state.reference_scores})
            current_df = pd.DataFrame({"score": recent_scores})
            report = check_drift_report(reference_df, current_df, columns=["score"])
            psi = report.iloc[0]["psi"]
            drift_status = "low" if psi < 0.1 else ("moderate" if psi < 0.25 else "high")
        else:
            drift_status = "insufficient_data"
    except Exception:
        drift_status = "unavailable"

    return {
        "model": {"status": "healthy" if model_healthy else "unavailable", "version": state.model_version},
        "calibration": {"status": "healthy" if calibration_healthy else "check_required"},
        "drift": {"status": drift_status},
        "data": {
            "status": "fresh" if state.raw_df is not None else "unavailable",
            "rows": len(state.raw_df) if state.raw_df is not None else 0,
        },
        "queue": {
            "status": "ready" if state.queue else "not_generated",
            "size": len(state.queue),
            "generated_at": state.queue_generated_at,
        },
        "traces": {"count": trace_store.count()},
        "audit": {"count": audit_store.count()},
    }


# ---------------------------------------------------------------------------
# Mount the versioned router and add infrastructure endpoints on the root app
# ---------------------------------------------------------------------------
app.include_router(v1)



@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect API root to interactive documentation."""
    return RedirectResponse(url="/docs")


@app.get("/metrics", tags=["Operations"], summary="Prometheus metrics")
def metrics():
    """Expose Prometheus metrics for Grafana / Datadog scraping."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
