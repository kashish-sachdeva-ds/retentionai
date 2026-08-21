import redis
import pytest
from fastapi.testclient import TestClient

from src.api.main import app

SAMPLE_CUSTOMER = {
    "tenure": 3, "MonthlyCharges": 85.0, "TotalCharges": 255.0, "SeniorCitizen": 0,
    "Contract": "Month-to-month", "InternetService": "Fiber optic",
    "OnlineSecurity": "No", "OnlineBackup": "No", "DeviceProtection": "No",
    "TechSupport": "No", "StreamingTV": "Yes", "StreamingMovies": "Yes",
    "PaymentMethod": "Electronic check", "gender": "Female", "Partner": "No",
    "Dependents": "No", "PhoneService": "Yes", "MultipleLines": "No", "PaperlessBilling": "Yes",
}


@pytest.fixture(scope="module")
def client():
    # Shares db=0 with the live API dev instance -- a real, stated
    # limitation (ADR-014 Trade-offs): running this suite resets live
    # bandit/monitoring state as a side effect.
    r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    for key in r.keys("bandit:*") + r.keys("counterfactual:*") + r.keys("monitoring:*"):
        r.delete(key)

    with TestClient(app) as c:
        yield c


def test_health_reports_model_loaded(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_loaded": True}


def test_predict_returns_all_expected_fields(client):
    response = client.post("/predict", json=SAMPLE_CUSTOMER)
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["calibrated_churn_probability"] <= 1.0
    assert set(body["conformal_prediction_set"]) <= {0, 1}
    assert body["recommended_arm"] in ("discount", "technician", "control")
    assert body["counterfactual_status"] == "pending"


def test_counterfactual_eventually_becomes_ready(client):
    import time
    response = client.post("/predict", json=SAMPLE_CUSTOMER)
    request_id = response.json()["request_id"]

    result = None
    for _ in range(30):
        cf = client.get(f"/counterfactual/{request_id}").json()
        if cf.get("status") == "ready":
            result = cf
            break
        time.sleep(0.1)

    assert result is not None
    assert "flippable" in result


def test_counterfactual_unknown_request_id_returns_pending_or_not_found(client):
    response = client.get("/counterfactual/does-not-exist")
    assert response.json()["status"] == "pending_or_not_found"


def test_feedback_updates_bandit_state(client):
    before = client.post("/predict", json=SAMPLE_CUSTOMER).json()["recommended_arm"]
    for _ in range(30):
        fb = client.post("/feedback/discount", params={"retained": True})
        assert fb.status_code == 200

    picks = [client.post("/predict", json=SAMPLE_CUSTOMER).json()["recommended_arm"] for _ in range(50)]
    assert picks.count("discount") > 25  # clearly favored after strong positive feedback


def test_feedback_rejects_unknown_arm(client):
    response = client.post("/feedback/not_a_real_arm", params={"retained": True})
    assert response.status_code == 404


def test_predict_rejects_malformed_request(client):
    response = client.post("/predict", json={"tenure": 3})  # missing required fields
    assert response.status_code == 422


def test_drift_endpoint_reports_insufficient_data_before_threshold(client):
    r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    r.delete("monitoring:recent_scores")
    response = client.get("/monitoring/drift")
    body = response.json()
    assert body["status"] == "insufficient_data"


def test_drift_endpoint_reports_ok_after_enough_predictions(client):
    for _ in range(35):
        client.post("/predict", json=SAMPLE_CUSTOMER)
    response = client.get("/monitoring/drift")
    body = response.json()
    assert body["status"] == "ok"
    assert "psi" in body and "ks_p_value" in body
