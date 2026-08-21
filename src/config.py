"""Project-wide paths and environment configuration.

The project root is derived from this module's location, never from the
process working directory. That distinction matters in a service: Uvicorn,
pytest, a notebook kernel, and scripts can all start from different
directories while needing the same data and model locations.
"""

import os
from pathlib import Path


def _find_project_root() -> Path:
    """Return the repository root from ``src/config.py``'s location."""
    return Path(__file__).resolve().parent.parent


PROJECT_ROOT = _find_project_root()

RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DATA_DIR = PROJECT_ROOT / "data" / "processed"

RAW_CSV_PATH = RAW_DATA_DIR / "telco_churn.csv"
PROCESSED_CSV_PATH = PROCESSED_DATA_DIR / "telco_churn_cleaned.csv"

# Service & Infrastructure configuration
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_URL = os.environ.get("REDIS_URL") or f"redis://{REDIS_HOST}:{REDIS_PORT}/0"

# CORS configuration
DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

# Rate limiting (generous default for test suites, customizable in production via env)
RATE_LIMIT_PREDICT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PREDICT_PER_MINUTE", "120"))

# Administrative authorization key (if set, required for operational endpoints like drift reset / feedback mutations)
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")

# Model training/data flags
ALLOW_SYNTHETIC_DATA = os.environ.get("ALLOW_SYNTHETIC_DATA", "0") == "1"
FORCE_RETRAIN = os.environ.get("FORCE_RETRAIN", "0") == "1"