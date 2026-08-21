"""
Redis-backed Thompson Sampling state for the live API.

Deliberately separate from src/bandit/thompson.py's ThompsonSamplingBandit
class, which holds alpha/beta as in-process Python attributes -- correct
for Stage 11's offline replay evaluation (single-process, batch analysis),
wrong for a live API that may run multiple worker processes. Multiple
workers need to share and atomically update the SAME arm statistics, which
in-process attributes cannot do across processes. Redis's HSETNX and
HINCRBYFLOAT are atomic, so concurrent requests across workers can't race
each other into an inconsistent state.
"""

import json

import numpy as np
import redis


PREDICTION_RECORD_TTL_SECONDS = 86400 * 120
FEEDBACK_AUDIT_TTL_SECONDS = 86400 * 120


_RECORD_FEEDBACK_SCRIPT = """
-- KEYS[1] = prediction assignment, KEYS[2] = feedback audit, KEYS[3] = arm posterior
-- ARGV[1] = submitted arm, ARGV[2] = alpha/beta field, ARGV[3] = audit JSON,
-- ARGV[4] = feedback TTL
local assignment_raw = redis.call('GET', KEYS[1])
if not assignment_raw then
    return 0
end

local assignment = cjson.decode(assignment_raw)
if assignment['recommended_arm'] ~= ARGV[1] then
    return -1
end

if redis.call('EXISTS', KEYS[2]) == 1 then
    return 1
end

redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4], 'NX')
redis.call('HSETNX', KEYS[3], 'alpha', 1.0)
redis.call('HSETNX', KEYS[3], 'beta', 1.0)
redis.call('HINCRBYFLOAT', KEYS[3], ARGV[2], 1.0)
return 2
"""


def _ensure_arm_initialized(client: redis.Redis, arm_name: str) -> None:
    key = f"bandit:{arm_name}"
    client.hsetnx(key, "alpha", 1.0)  # Beta(1,1) prior -- only takes effect once, atomically
    client.hsetnx(key, "beta", 1.0)


def get_arm_posterior(client: redis.Redis, arm_name: str) -> tuple:
    _ensure_arm_initialized(client, arm_name)
    key = f"bandit:{arm_name}"
    alpha = float(client.hget(key, "alpha"))
    beta = float(client.hget(key, "beta"))
    return alpha, beta


def select_arm_redis(client: redis.Redis, arm_names: list, rng: np.random.Generator) -> str:
    samples = {arm: rng.beta(*get_arm_posterior(client, arm)) for arm in arm_names}
    return max(samples, key=samples.get)


def update_arm_redis(client: redis.Redis, arm_name: str, reward: int) -> None:
    _ensure_arm_initialized(client, arm_name)
    field = "alpha" if reward == 1 else "beta"
    client.hincrbyfloat(f"bandit:{arm_name}", field, 1.0)


def record_prediction_assignment(client: redis.Redis, request_id: str, arm_name: str, model_version: str) -> None:
    """Persist the arm actually assigned to a scored request.

    A future outcome can only update the posterior for this recorded arm.
    The record deliberately contains no raw customer attributes, avoiding an
    unnecessary second store of the request payload.
    """
    client.set(
        f"prediction:{request_id}",
        json.dumps({
            "request_id": request_id,
            "recommended_arm": arm_name,
            "model_version": model_version,
        }),
        ex=PREDICTION_RECORD_TTL_SECONDS,
    )


def record_feedback_once(
    client: redis.Redis,
    request_id: str,
    arm_name: str,
    retained: bool,
) -> str:
    """Atomically attribute an outcome and update the correct posterior.

    Returns one of ``recorded``, ``duplicate``, ``unknown_prediction``, or
    ``arm_mismatch``. The caller maps those explicit outcomes to API status
    codes; no caller can update a posterior using an invented request ID or
    an arm different from the one that was assigned.
    """
    audit_payload = json.dumps({
        "request_id": request_id,
        "arm": arm_name,
        "retained": retained,
    })
    result = client.eval(
        _RECORD_FEEDBACK_SCRIPT,
        3,
        f"prediction:{request_id}",
        f"feedback:{request_id}",
        f"bandit:{arm_name}",
        arm_name,
        "alpha" if retained else "beta",
        audit_payload,
        FEEDBACK_AUDIT_TTL_SECONDS,
    )
    outcomes = {
        2: "recorded",
        1: "duplicate",
        0: "unknown_prediction",
        -1: "arm_mismatch",
    }
    try:
        return outcomes[int(result)]
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(f"Unexpected Redis feedback transaction result: {result!r}") from exc
