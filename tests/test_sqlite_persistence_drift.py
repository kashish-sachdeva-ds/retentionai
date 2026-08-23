import uuid
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.api.main import app, state
from src.db.session import get_db_session, DEFAULT_SQLITE_PATH
from src.db.models import AuditRecordModel, DecisionTraceModel, PredictionEventModel, DriftSnapshotModel
from src.monitoring.drift import record_prediction_event


def test_sqlite_persistence_and_event_driven_drift():
    """Verify that predictions, decision traces, and drift snapshots persist to SQLite."""
    with TestClient(app) as client:
        assert DEFAULT_SQLITE_PATH.exists()

        # 1. Run a live prediction
        payload = {
            "tenure": 12,
            "MonthlyCharges": 75.0,
            "TotalCharges": 900.0,
            "SeniorCitizen": 0,
            "Contract": "Month-to-month",
            "InternetService": "Fiber optic",
            "OnlineSecurity": "No",
            "OnlineBackup": "Yes",
            "DeviceProtection": "No",
            "TechSupport": "No",
            "StreamingTV": "Yes",
            "StreamingMovies": "No",
            "PaymentMethod": "Electronic check",
            "gender": "Male",
            "Partner": "No",
            "Dependents": "No",
            "PhoneService": "Yes",
            "MultipleLines": "No",
            "PaperlessBilling": "Yes"
        }

        res = client.post("/api/v1/predict", json=payload)
        assert res.status_code == 200
        pred = res.json()
        decision_id = pred.get("decision_id")
        trace_id = pred.get("trace_id")
        req_id = pred.get("request_id")

        # 2. Verify rows in SQLite
        with get_db_session() as session:
            audit_row = session.query(AuditRecordModel).filter_by(decision_id=decision_id).first()
            assert audit_row is not None
            assert audit_row.decision_id == decision_id

            trace_row = session.query(DecisionTraceModel).filter_by(trace_id=trace_id).first()
            assert trace_row is not None
            assert trace_row.trace_id == trace_id

            event_row = session.query(PredictionEventModel).filter_by(request_id=req_id).first()
            assert event_row is not None
            assert event_row.request_id == req_id

        # 2b. Test updating human review status via PATCH endpoint
        patch_res = client.patch(f"/api/v1/audit/{decision_id}/review", json={"status": "approved", "reviewer": "pytest_lead"})
        assert patch_res.status_code == 200
        patch_data = patch_res.json()
        assert patch_data["decision_id"] == decision_id
        assert patch_data["human_review_status"] == "approved"
        assert patch_data["reviewer"] == "pytest_lead"

        # 3. Log 100 events and check live drift
        rng = np.random.default_rng(42)
        simulated_scores = rng.beta(2.5, 4.0, size=100)
        for i, score in enumerate(simulated_scores):
            record_prediction_event(
                request_id=f"pytest-req-{uuid.uuid4().hex[:8]}",
                customer_id=f"CUST-PYTEST-{i}",
                model_version=state.model_version or "unknown",
                calibrated_probability=float(score),
                recommended_action="Prioritize for Review" if score > 0.5 else "Standard Control",
                priority_score=float(score * 100),
            )

        drift_res = client.get("/api/v1/monitoring/drift")
        assert drift_res.status_code == 200
        drift_data = drift_res.json()
        assert drift_data.get("status") == "ok"
        assert drift_data.get("n_observations") >= 100

        # 4. Check snapshot & history
        snap_res = client.post("/api/v1/monitoring/drift/snapshot")
        assert snap_res.status_code == 200

        hist_res = client.get("/api/v1/monitoring/drift/history")
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert hist_data.get("snapshots_count") >= 1

        # 5. Check dynamic splits
        card_res = client.get("/api/v1/model-card/full")
        assert card_res.status_code == 200
        splits = card_res.json().get("validation", {}).get("splits", {})
        assert splits.get("train", {}).get("rows") == 5634
        assert splits.get("calibration", {}).get("rows") == 470
        assert splits.get("conformal", {}).get("rows") == 470
        assert splits.get("holdout", {}).get("rows") == 469
