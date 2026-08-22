"""End-to-end smoke test suite for the public RetentionAI FastAPI service.

Can run against either an in-process TestClient or a live deployment target
specified via the SMOKE_TEST_URL environment variable.
"""

import os
import time
import pytest
from fastapi.testclient import TestClient

from src.api.main import app

SMOKE_TEST_URL = os.environ.get("SMOKE_TEST_URL")

SAMPLE_CUSTOMER = {
    "tenure": 2,
    "MonthlyCharges": 89.5,
    "TotalCharges": 179.0,
    "SeniorCitizen": 0,
    "Contract": "Month-to-month",
    "InternetService": "Fiber optic",
    "OnlineSecurity": "No",
    "OnlineBackup": "No",
    "DeviceProtection": "No",
    "TechSupport": "No",
    "StreamingTV": "Yes",
    "StreamingMovies": "Yes",
    "PaymentMethod": "Electronic check",
    "gender": "Female",
    "Partner": "No",
    "Dependents": "No",
    "PhoneService": "Yes",
    "MultipleLines": "No",
    "PaperlessBilling": "Yes",
}


@pytest.fixture(scope="module")
def client():
    """Return an HTTP client for smoke testing."""
    if SMOKE_TEST_URL:
        import httpx
        with httpx.Client(base_url=SMOKE_TEST_URL.rstrip("/"), timeout=15.0) as http_client:
            yield http_client
    else:
        with TestClient(app) as test_client:
            yield test_client


def test_smoke_health(client):
    """Verify /health returns 200 with status ok."""
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "model_loaded" in data


def test_smoke_model_card(client):
    """Verify /model-card returns 200 with evaluation metrics."""
    resp = client.get("/api/v1/model-card")
    assert resp.status_code == 200
    data = resp.json()
    assert "model_version" in data
    assert "evaluation" in data
    assert "ranking" in data["evaluation"]


def test_smoke_predict_flow(client):
    """Verify /predict returns calibrated score, conformal set, and assigned arm."""
    resp = client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    assert resp.status_code == 200
    data = resp.json()
    assert "request_id" in data
    assert "calibrated_churn_probability" in data
    assert 0.0 <= data["calibrated_churn_probability"] <= 1.0
    assert "conformal_prediction_set" in data
    assert isinstance(data["conformal_prediction_set"], list)
    assert data["recommended_arm"] in ["discount", "technician", "control"]


def test_smoke_bandit_posteriors(client):
    """Verify /bandit/posteriors returns arm Beta distributions."""
    resp = client.get("/api/v1/bandit/posteriors")
    assert resp.status_code == 200
    data = resp.json()
    assert "arms" in data
    assert len(data["arms"]) >= 3


def test_smoke_counterfactual_poll(client):
    """Verify /counterfactual/{id} responds with status."""
    pred_resp = client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    assert pred_resp.status_code == 200
    req_id = pred_resp.json()["request_id"]

    cf_resp = client.get(f"/api/v1/counterfactual/{req_id}")
    assert cf_resp.status_code == 200
    data = cf_resp.json()
    assert "status" in data
