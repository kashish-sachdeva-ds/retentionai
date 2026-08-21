"""
Model artifact persistence -- save/load trained models, calibrators,
conformal thresholds, and pipeline artifacts as a versioned bundle.

Post-audit addition (Blocker 5): the original API retrained from CSV on
every startup, which meant availability depended on raw data access and
training cost, with no versioning, rollback, or audit trail for what was
actually served. This module adds joblib-based persistence with version
directories and a "latest" pointer.

Not MLflow: MLflow is a reasonable next step for a real deployment with
a model registry, experiment tracking, and team collaboration. For a
portfolio project, joblib + JSON manifest demonstrates the persistence
concept without adding an infrastructure dependency that would need its
own deployment story.
"""

import datetime
import hashlib
import json

import joblib

from pathlib import Path

from src.config import PROJECT_ROOT

MODELS_DIR = PROJECT_ROOT / "models"
MANIFEST_SCHEMA_VERSION = 3


def _file_metadata(path: Path) -> dict:
    """Return integrity metadata for one persisted artifact file."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"name": path.name, "bytes": path.stat().st_size, "sha256": digest}


def _feature_schema_hash(artifacts: dict) -> str:
    columns = "\n".join(artifacts["encoded_columns"])
    return hashlib.sha256(columns.encode("utf-8")).hexdigest()


def save_artifacts(
    model,
    calibrated_model,
    artifacts,
    thresholds,
    reference_scores,
    evaluation=None,
    training_data=None,
    version=None,
):
    """Save all artifacts needed to serve predictions without retraining.
    Returns the version string used."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    version = version or datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    bundle_dir = MODELS_DIR / version
    bundle_dir.mkdir(exist_ok=False)

    joblib.dump(model, bundle_dir / "model.joblib")
    joblib.dump(calibrated_model, bundle_dir / "calibrated_model.joblib")
    joblib.dump(artifacts, bundle_dir / "pipeline_artifacts.joblib")
    joblib.dump(thresholds, bundle_dir / "conformal_thresholds.joblib")
    joblib.dump(reference_scores, bundle_dir / "reference_scores.joblib")
    # Keep the evaluation immutable and co-versioned with the estimator. A
    # release without one is labelled explicitly rather than borrowing a
    # metric from some other notebook run.
    evaluation = evaluation or {"status": "not_available"}
    (bundle_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2, sort_keys=True))

    manifest = {
        "manifest_schema_version": MANIFEST_SCHEMA_VERSION,
        "version": version,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "feature_schema_sha256": _feature_schema_hash(artifacts),
        # Provenance is part of the release contract: a schema-compatible
        # smoke-test fixture must never be indistinguishable from a real-data
        # model after it has been persisted and restarted.
        "training_data": training_data or {"dataset_kind": "unknown"},
        "files": sorted(
            (_file_metadata(f) for f in bundle_dir.iterdir()),
            key=lambda metadata: metadata["name"],
        ),
    }
    (bundle_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # Write a "latest" pointer so load_artifacts() knows which version to use
    pointer = MODELS_DIR / "latest_version.txt"
    temporary_pointer = MODELS_DIR / "latest_version.tmp"
    temporary_pointer.write_text(version)
    temporary_pointer.replace(pointer)
    return version


def load_artifacts(version=None):
    """Load the latest (or specified) model bundle.
    Returns None if no persisted artifacts exist."""
    if version is None:
        pointer = MODELS_DIR / "latest_version.txt"
        if not pointer.exists():
            return None
        version = pointer.read_text().strip()

    bundle_dir = MODELS_DIR / version
    if not bundle_dir.exists():
        raise RuntimeError(f"Model pointer references missing artifact bundle: {bundle_dir}")

    required_files = [
        "model.joblib", "calibrated_model.joblib",
        "pipeline_artifacts.joblib", "conformal_thresholds.joblib",
        "reference_scores.joblib",
        "evaluation.json",
    ]
    for fname in required_files:
        if not (bundle_dir / fname).exists():
            raise RuntimeError(f"Incomplete model artifact bundle: missing {bundle_dir / fname}")

    manifest_path = bundle_dir / "manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"Incomplete model artifact bundle: missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("manifest_schema_version") != MANIFEST_SCHEMA_VERSION:
        raise RuntimeError(f"Unsupported artifact manifest version in {manifest_path}")
    if manifest.get("version") != version:
        raise RuntimeError(f"Artifact manifest version does not match pointer for {bundle_dir}")

    expected_files = {item["name"]: item for item in manifest.get("files", [])}
    for fname in required_files:
        expected = expected_files.get(fname)
        if expected is None or _file_metadata(bundle_dir / fname) != expected:
            raise RuntimeError(f"Artifact integrity check failed for {bundle_dir / fname}")

    artifacts = joblib.load(bundle_dir / "pipeline_artifacts.joblib")
    if manifest.get("feature_schema_sha256") != _feature_schema_hash(artifacts):
        raise RuntimeError(f"Feature schema integrity check failed for {bundle_dir}")

    return {
        "model": joblib.load(bundle_dir / "model.joblib"),
        "calibrated_model": joblib.load(bundle_dir / "calibrated_model.joblib"),
        "artifacts": artifacts,
        "thresholds": joblib.load(bundle_dir / "conformal_thresholds.joblib"),
        "reference_scores": joblib.load(bundle_dir / "reference_scores.joblib"),
        "evaluation": json.loads((bundle_dir / "evaluation.json").read_text()),
        "training_data": manifest["training_data"],
        "version": version,
        "manifest": manifest,
    }
