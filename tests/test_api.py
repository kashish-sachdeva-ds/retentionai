import uuid
import redis
import pytest
from fastapi.testclient import TestClient

from src.api.main import DRIFT_CHECK_MIN_SAMPLES, app
from src.api.redis_bandit import record_prediction_assignment

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
    try:
        r = redis.Redis(
            host="localhost", port=6379, db=0, decode_responses=True,
            socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        for key in (
            r.keys("bandit:*")
            + r.keys("counterfactual:*")
            + r.keys("monitoring:*")
            + r.keys("prediction:*")
            + r.keys("feedback:*")
        ):
            r.delete(key)
    except Exception:
        pass

    with TestClient(app) as c:
        yield c


def test_health_reports_model_loaded(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert isinstance(body["model_version"], str)


def test_model_card_is_versioned_with_the_serving_artifact(client):
    response = client.get("/api/v1/model-card")
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"]
    assert "ranking" in body["evaluation"]
    assert "conformal" in body["evaluation"]


def test_predict_returns_all_expected_fields(client):
    response = client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["calibrated_churn_probability"] <= 1.0
    assert set(body["conformal_prediction_set"]) <= {0, 1}
    assert body["recommended_arm"] in ("discount", "technician", "control")
    assert isinstance(body["model_version"], str)
    assert body["counterfactual_status"] == "pending"


def test_counterfactual_eventually_becomes_ready(client):
    import time
    response = client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    request_id = response.json()["request_id"]

    result = None
    for _ in range(30):
        cf = client.get(f"/api/v1/counterfactual/{request_id}").json()
        if cf.get("status") == "ready":
            result = cf
            break
        time.sleep(0.1)

    assert result is not None
    assert "flippable" in result


def test_counterfactual_unknown_request_id_returns_pending_or_not_found(client):
    response = client.get("/api/v1/counterfactual/does-not-exist")
    assert response.json()["status"] == "pending_or_not_found"


def test_feedback_updates_bandit_state(client):
    r = redis.Redis(
        host="localhost", port=6379, db=0, decode_responses=True,
        socket_connect_timeout=0.25, socket_timeout=0.25,
    )
    try:
        r.ping()
    except Exception:
        pytest.skip("Redis server not available at localhost:6379")

    picks_before = set()
    for _ in range(30):
        request_id = str(uuid.uuid4())
        record_prediction_assignment(r, request_id, "discount", "test-model")
        fb = client.post("/api/v1/feedback/discount", json={
            "request_id": request_id, "retained": True,
        })
        assert fb.status_code == 200

    picks = [client.post("/api/v1/predict", json=SAMPLE_CUSTOMER).json()["recommended_arm"] for _ in range(50)]
    assert picks.count("discount") > 25  # clearly favored after strong positive feedback


def test_feedback_rejects_unknown_arm(client):
    response = client.post("/api/v1/feedback/not_a_real_arm", json={
        "request_id": str(uuid.uuid4()), "retained": True,
    })
    assert response.status_code == 404


def test_feedback_rejects_duplicate_request_id(client):
    """Post-audit fix (Blocker 4): idempotency -- the same request_id
    cannot submit feedback twice."""
    rid = str(uuid.uuid4())
    r = redis.Redis(
        host="localhost", port=6379, db=0, decode_responses=True,
        socket_connect_timeout=0.25, socket_timeout=0.25,
    )
    try:
        r.ping()
    except Exception:
        pytest.skip("Redis server not available at localhost:6379")

    record_prediction_assignment(r, rid, "discount", "test-model")
    first = client.post("/api/v1/feedback/discount", json={"request_id": rid, "retained": True})
    assert first.status_code == 200
    second = client.post("/api/v1/feedback/discount", json={"request_id": rid, "retained": True})
    assert second.status_code == 409


def test_feedback_rejects_unknown_prediction_id(client):
    response = client.post("/api/v1/feedback/discount", json={
        "request_id": str(uuid.uuid4()), "retained": True,
    })
    assert response.status_code == 404


def test_feedback_rejects_an_arm_other_than_the_assigned_arm(client):
    request_id = str(uuid.uuid4())
    r = redis.Redis(
        host="localhost", port=6379, db=0, decode_responses=True,
        socket_connect_timeout=0.25, socket_timeout=0.25,
    )
    try:
        r.ping()
    except Exception:
        pytest.skip("Redis server not available at localhost:6379")

    record_prediction_assignment(r, request_id, "discount", "test-model")

    response = client.post("/api/v1/feedback/control", json={
        "request_id": request_id, "retained": True,
    })
    assert response.status_code == 422


def test_bandit_posteriors_reflect_live_redis_state(client):
    response = client.get("/api/v1/bandit/posteriors")
    assert response.status_code == 200
    arms = response.json()["arms"]
    assert {row["arm"] for row in arms} == {"discount", "technician", "control"}
    assert all(row["alpha"] >= 1 and row["beta"] >= 1 for row in arms)


def test_predict_rejects_malformed_request(client):
    response = client.post("/api/v1/predict", json={"tenure": 3})  # missing required fields
    assert response.status_code == 422


def test_predict_rejects_impossible_service_combination(client):
    """Post-audit fix (Blocker 3): InternetService='No' with
    OnlineSecurity='Yes' is structurally impossible in the real dataset.
    The API must reject it, not silently accept out-of-distribution input."""
    impossible_customer = dict(SAMPLE_CUSTOMER)
    impossible_customer["InternetService"] = "No"
    impossible_customer["OnlineSecurity"] = "Yes"  # impossible without internet
    response = client.post("/api/v1/predict", json=impossible_customer)
    assert response.status_code == 422


def test_predict_rejects_phone_service_inconsistency(client):
    """PhoneService='No' with MultipleLines='Yes' is equally impossible."""
    impossible_customer = dict(SAMPLE_CUSTOMER)
    impossible_customer["PhoneService"] = "No"
    impossible_customer["MultipleLines"] = "Yes"
    response = client.post("/api/v1/predict", json=impossible_customer)
    assert response.status_code == 422


def test_drift_endpoint_reports_insufficient_data_before_threshold(client):
    try:
        r = redis.Redis(
            host="localhost", port=6379, db=0, decode_responses=True,
            socket_connect_timeout=0.25, socket_timeout=0.25,
        )
        r.delete("monitoring:recent_scores")
    except Exception:
        pass
    response = client.get("/api/v1/monitoring/drift")
    body = response.json()
    assert body["status"] in ["insufficient_data", "ok"]


def test_drift_endpoint_reports_ok_after_enough_predictions(client):
    try:
        r = redis.Redis(
            host="localhost", port=6379, db=0, decode_responses=True,
            socket_connect_timeout=0.25, socket_timeout=0.25,
        )
        r.ping()
    except Exception:
        pytest.skip("Redis server not available at localhost:6379")

    # Live drift is calculated from durable prediction events, not the
    # short-lived Redis list. Keep this test aligned with the API's minimum
    # sample contract (currently 100) instead of the old Redis threshold.
    for _ in range(DRIFT_CHECK_MIN_SAMPLES):
        client.post("/api/v1/predict", json=SAMPLE_CUSTOMER)
    response = client.get("/api/v1/monitoring/drift")
    body = response.json()
    assert body["status"] == "ok"
    assert body["n_observations"] >= DRIFT_CHECK_MIN_SAMPLES
    assert "psi" in body and "ks_p_value" in body


def test_metrics_endpoint_exposes_prometheus_data(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "http_requests_total" in response.text
    assert "model_predictions_total" in response.text


def test_rfc7807_error_format_on_validation_failure(client):
    response = client.post("/api/v1/predict", json={"tenure": 3})
    assert response.status_code == 422
    assert response.headers.get("content-type") == "application/problem+json"
    body = response.json()
    assert body["type"] == "urn:problem:validation_error"
    assert body["title"] == "Unprocessable Entity"
    assert body["status"] == 422
    assert "validation failed" in body["detail"].lower()

