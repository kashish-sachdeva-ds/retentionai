"""Tests for Decision Intelligence API endpoints."""

import pytest
from fastapi.testclient import TestClient
from src.api.main import app

SAMPLE_CUSTOMER = {
    "tenure": 3,
    "MonthlyCharges": 85.0,
    "TotalCharges": 255.0,
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
    with TestClient(app) as c:
        yield c


def test_queue_endpoint(client):
    response = client.get("/api/v1/queue?limit=10")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["total_customers"] > 0
    assert len(body["customers"]) <= 10
    first = body["customers"][0]
    assert "priority" in first
    assert "score" in first["priority"]
    assert "calibrated_probability" in first
    assert "uncertainty" in first
    assert "recommended_action" in first


def test_queue_summary_endpoint(client):
    response = client.get("/api/v1/queue/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "risk_bands" in body
    assert "total_customers" in body


def test_predict_returns_decision_intelligence_fields(client):
    response = client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    assert response.status_code == 200
    body = response.json()
    assert "priority_score" in body
    assert "recommended_action" in body
    assert "decision_confidence" in body
    assert "uncertainty_label" in body
    assert "trace_id" in body
    assert "decision_id" in body
    assert body["trace_id"].startswith("D-")
    assert body["decision_id"].startswith("A-")


def test_traces_endpoint(client):
    # Predict first to ensure trace exists
    client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    response = client.get("/api/v1/traces")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    first_trace = body["traces"][0]
    detail = client.get(f"/api/v1/traces/{first_trace['trace_id']}")
    assert detail.status_code == 200
    assert len(detail.json()["steps"]) > 0


def test_audit_endpoint(client):
    # Predict first to ensure audit record exists
    client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    response = client.get("/api/v1/audit")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    first_rec = body["records"][0]
    detail = client.get(f"/api/v1/audit/{first_rec['decision_id']}")
    assert detail.status_code == 200
    assert detail.json()["customer_id"]


def test_scenario_endpoint(client):
    response = client.post(
        "/api/v1/scenario",
        json={"budget": 50, "objective": "balanced"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["budget"] == 50
    assert len(body["top_selected"]) > 0


def test_scenario_compare_endpoint(client):
    response = client.post("/api/v1/scenario/compare?budget=100")
    assert response.status_code == 200
    body = response.json()
    assert "strategies" in body
    assert "risk_first" in body["strategies"]
    assert "value_aware" in body["strategies"]
    assert "balanced" in body["strategies"]


def test_experiments_and_lineage_endpoint(client):
    response = client.get("/api/v1/experiments")
    assert response.status_code == 200
    body = response.json()
    assert "experiments" in body
    assert "lineage" in body
    assert len(body["experiments"]) >= 3


def test_full_model_card_endpoint(client):
    response = client.get("/api/v1/model-card/full")
    assert response.status_code == 200
    body = response.json()
    assert "purpose" in body
    assert "intended_use" in body
    assert "known_limitations" in body


def test_system_health_endpoint(client):
    response = client.get("/api/v1/system/health")
    assert response.status_code == 200
    body = response.json()
    assert body["model"]["status"] == "healthy"
    assert body["queue"]["status"] == "ready"
