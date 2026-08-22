import shutil
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from src.config import RAW_CSV_PATH, PROJECT_ROOT
from src.features.pipeline import run_stage6_split
from src.modeling.champion import train_xgboost
from src.modeling.calibration import calibrate_model
from src.modeling.conformal import nonconformity_scores, mondrian_thresholds
from src.modeling.persistence import save_artifacts, load_artifacts, MODELS_DIR


@pytest.fixture(scope="module")
def sample_trained_bundle():
    df = pd.read_csv(RAW_CSV_PATH)
    X_train, X_test, y_train, y_test, artifacts = run_stage6_split(df)
    model = train_xgboost(X_train, y_train)
    calibrated_model = calibrate_model(model, X_test, y_test, method="isotonic")
    calibrated_probs = calibrated_model.predict_proba(X_test)
    scores = nonconformity_scores(calibrated_probs, y_test.values)
    thresholds = mondrian_thresholds(scores, y_test.values, classes=[0, 1], alpha=0.05)
    reference_scores = calibrated_probs[:, 1]
    return model, calibrated_model, artifacts, thresholds, reference_scores


def test_save_and_load_artifacts(sample_trained_bundle, tmp_path, monkeypatch):
    test_models_dir = tmp_path / "test_models"
    monkeypatch.setattr("src.modeling.persistence.MODELS_DIR", test_models_dir)

    model, calibrated_model, artifacts, thresholds, ref_scores = sample_trained_bundle
    provenance = {"dataset_kind": "telco_kaggle_snapshot", "row_count": 7043}
    version = save_artifacts(
        model, calibrated_model, artifacts, thresholds, ref_scores,
        training_data=provenance, version="test_v1",
    )

    assert version == "test_v1"
    assert (test_models_dir / "test_v1" / "manifest.json").exists()
    assert (test_models_dir / "latest_version.txt").read_text().strip() == "test_v1"

    loaded = load_artifacts()
    assert loaded is not None
    assert "model" in loaded
    assert "calibrated_model" in loaded
    assert "artifacts" in loaded
    assert "thresholds" in loaded
    assert "reference_scores" in loaded
    assert loaded["evaluation"]["status"] == "not_available"
    assert loaded["training_data"] == provenance
    np.testing.assert_allclose(loaded["reference_scores"], ref_scores)


def test_load_artifacts_returns_none_when_empty(tmp_path, monkeypatch):
    test_models_dir = tmp_path / "empty_models"
    monkeypatch.setattr("src.modeling.persistence.MODELS_DIR", test_models_dir)
    assert load_artifacts() is None


def test_load_artifacts_detects_tampering(sample_trained_bundle, tmp_path, monkeypatch):
    test_models_dir = tmp_path / "tampered_models"
    monkeypatch.setattr("src.modeling.persistence.MODELS_DIR", test_models_dir)
    save_artifacts(*sample_trained_bundle, version="test_v1")
    (test_models_dir / "test_v1" / "model.joblib").write_bytes(b"tampered")

    with pytest.raises(RuntimeError, match="integrity check failed"):
        load_artifacts()
