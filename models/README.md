# Models

This directory stores trained model artifacts as versioned bundles.

Each version is a subdirectory (e.g. `20260821T120000Z/`) containing:
- `model.joblib` -- the raw XGBoost champion model
- `calibrated_model.joblib` -- the isotonic-calibrated wrapper
- `pipeline_artifacts.joblib` -- fitted scaler, IV/VIF column lists, encoded column order
- `conformal_thresholds.joblib` -- Mondrian class-conditional conformal thresholds
- `reference_scores.joblib` -- calibrated score distribution for drift monitoring
- `evaluation.json` -- immutable holdout evaluation and diagnostic slice report
- `manifest.json` -- artifact schema version, feature-schema hash, and
  SHA-256 / byte-size integrity metadata for every persisted file

The `latest_version.txt` file points to the currently active version.
The API verifies the manifest before loading this version on startup; an
incomplete or altered bundle fails loudly instead of silently retraining or
serving an unknown artifact. Set `FORCE_RETRAIN=1` to retrain from CSV and
create a new version.

Bundles written before manifest schema v3 do not contain the complete
evaluation-and-provenance contract
and are intentionally rejected. Regenerate them with `FORCE_RETRAIN=1` using
the real Kaggle snapshot.

Manifest schema v3 also records a non-PII dataset provenance fingerprint.
The API refuses a synthetic or unknown persisted bundle unless
`ALLOW_SYNTHETIC_DATA=1` is explicitly set for a labelled smoke-test demo.

Generated model files are intentionally excluded from version control
(`.gitignore`).
