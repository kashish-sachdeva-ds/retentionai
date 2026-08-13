"""
Background counterfactual computation. Runs AFTER the /predict response has
already been sent -- the exact reason it's a background task at all: the
exact grid search (Stage 12a) is cheap per-customer but not free, and a
churn prediction should never wait on an explanation to be generated.
Results land in Redis, polled via GET /counterfactual/{request_id}.
"""

import json

import redis

from src.explain.counterfactual import find_counterfactual

COUNTERFACTUAL_TTL_SECONDS = 3600


def compute_and_store_counterfactual(
    request_id: str,
    model,
    instance_model_input,
    instance_raw: dict,
    scaler,
    scaled_columns: list,
    redis_client: redis.Redis,
) -> None:
    """scaled_columns must be the FULL encoded column list the scaler was
    fit on (artifacts["encoded_columns"]), not a continuous-only subset --
    find_counterfactual() needs to locate every actionable feature
    (including binary dummies like ContractCommitmentMonths) by name
    within this list."""
    result = find_counterfactual(model, instance_model_input, instance_raw, scaler, scaled_columns)

    payload = {
        "status": "ready",
        "raw_changes": result["raw_changes"] if result else None,
        "flippable": result is not None,
    }
    redis_client.set(
        f"counterfactual:{request_id}", json.dumps(payload, default=str), ex=COUNTERFACTUAL_TTL_SECONDS
    )
