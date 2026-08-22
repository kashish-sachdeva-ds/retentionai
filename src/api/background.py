"""
Background counterfactual computation. Runs AFTER the /predict response has
already been sent -- the exact reason it's a background task at all: the
exact grid search (Stage 12a) is cheap per-customer but not free, and a
churn prediction should never wait on an explanation to be generated.
Results land in Redis, polled via GET /counterfactual/{request_id}.
"""

import json
import logging
import threading
from typing import Dict

import redis

from src.explain.counterfactual import find_counterfactual

logger = logging.getLogger("retentionai.background")

COUNTERFACTUAL_TTL_SECONDS = 3600

# In-memory fallback cache for counterfactual results
_cf_lock = threading.Lock()
_fallback_counterfactuals: Dict[str, dict] = {}


def get_stored_counterfactual(client: redis.Redis, request_id: str):
    """Retrieve counterfactual results with fallback to in-memory store."""
    try:
        payload = client.get(f"counterfactual:{request_id}")
        if payload is not None:
            return json.loads(payload)
    except Exception:
        pass

    with _cf_lock:
        return _fallback_counterfactuals.get(request_id)


def compute_and_store_counterfactual(
    request_id: str,
    model,
    instance_model_input,
    instance_raw: dict,
    scaler,
    scaled_columns: list,
    redis_client: redis.Redis,
    threshold: float = 0.5,
    has_internet: bool = True,
) -> None:
    """scaled_columns must be the FULL encoded column list the scaler was
    fit on (artifacts["encoded_columns"]), not a continuous-only subset --
    find_counterfactual() needs to locate every actionable feature
    (including binary dummies like ContractCommitmentMonths) by name
    within this list."""
    result = find_counterfactual(
        model,
        instance_model_input,
        instance_raw,
        scaler,
        scaled_columns,
        threshold=threshold,
        has_internet=has_internet,
    )

    payload = {
        "status": "ready",
        "raw_changes": result["raw_changes"] if result else None,
        "flippable": result is not None,
    }

    try:
        redis_client.set(
            f"counterfactual:{request_id}",
            json.dumps(payload, default=str),
            ex=COUNTERFACTUAL_TTL_SECONDS,
        )
    except Exception:
        with _cf_lock:
            _fallback_counterfactuals[request_id] = payload
