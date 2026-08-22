"""
Redis-backed Thompson Sampling state for the live API with in-memory resilient fallback.

Deliberately separate from src/bandit/thompson.py's ThompsonSamplingBandit
class, which holds alpha/beta as in-process Python attributes -- correct
for Stage 11's offline replay evaluation (single-process, batch analysis),
wrong for a live API that may run multiple worker processes. Multiple
workers need to share and atomically update the SAME arm statistics, which
in-process attributes cannot do across processes. Redis's HSETNX and
HINCRBYFLOAT are atomic, so concurrent requests across workers can't race
each other into an inconsistent state.

When Redis is temporarily unavailable or unconfigured, an in-memory cache
seamlessly maintains service continuity without throwing 500 errors.
"""

import json
import logging
import threading
from typing import Dict, Tuple

import numpy as np
import redis

logger = logging.getLogger("retentionai.bandit")

PREDICTION_RECORD_TTL_SECONDS = 86400 * 120
FEEDBACK_AUDIT_TTL_SECONDS = 86400 * 120

# In-memory fallback structures protected by a thread lock
_fallback_lock = threading.Lock()
_fallback_posteriors: Dict[str, Dict[str, float]] = {
    "discount": {"alpha": 1.0, "beta": 1.0},
    "technician": {"alpha": 1.0, "beta": 1.0},
    "control": {"alpha": 1.0, "beta": 1.0},
}
_fallback_predictions: Dict[str, dict] = {}
_fallback_feedbacks: Dict[str, dict] = {}

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
    try:
        key = f"bandit:{arm_name}"
        client.hsetnx(key, "alpha", 1.0)  # Beta(1,1) prior
        client.hsetnx(key, "beta", 1.0)
    except Exception as exc:
        logger.debug(f"Redis bandit init falling back to memory: {exc}")


def get_arm_posterior(client: redis.Redis, arm_name: str) -> Tuple[float, float]:
    try:
        _ensure_arm_initialized(client, arm_name)
        key = f"bandit:{arm_name}"
        alpha = float(client.hget(key, "alpha"))
        beta = float(client.hget(key, "beta"))
        return alpha, beta
    except Exception:
        with _fallback_lock:
            if arm_name not in _fallback_posteriors:
                _fallback_posteriors[arm_name] = {"alpha": 1.0, "beta": 1.0}
            return (
                _fallback_posteriors[arm_name]["alpha"],
                _fallback_posteriors[arm_name]["beta"],
            )


def select_arm_redis(client: redis.Redis, arm_names: list, rng: np.random.Generator) -> str:
    samples = {arm: rng.beta(*get_arm_posterior(client, arm)) for arm in arm_names}
    return max(samples, key=samples.get)


def update_arm_redis(client: redis.Redis, arm_name: str, reward: int) -> None:
    try:
        _ensure_arm_initialized(client, arm_name)
        field = "alpha" if reward == 1 else "beta"
        client.hincrbyfloat(f"bandit:{arm_name}", field, 1.0)
    except Exception:
        with _fallback_lock:
            if arm_name not in _fallback_posteriors:
                _fallback_posteriors[arm_name] = {"alpha": 1.0, "beta": 1.0}
            field = "alpha" if reward == 1 else "beta"
            _fallback_posteriors[arm_name][field] += 1.0


def record_prediction_assignment(
    client: redis.Redis, request_id: str, arm_name: str, model_version: str
) -> None:
    """Persist the arm actually assigned to a scored request."""
    record = {
        "request_id": request_id,
        "recommended_arm": arm_name,
        "model_version": model_version,
    }
    try:
        client.set(
            f"prediction:{request_id}",
            json.dumps(record),
            ex=PREDICTION_RECORD_TTL_SECONDS,
        )
    except Exception:
        with _fallback_lock:
            _fallback_predictions[request_id] = record


def record_feedback_once(
    client: redis.Redis,
    request_id: str,
    arm_name: str,
    retained: bool,
) -> str:
    """Atomically attribute an outcome and update the correct posterior.

    Returns one of ``recorded``, ``duplicate``, ``unknown_prediction``, or
    ``arm_mismatch``.
    """
    audit_payload = json.dumps({
        "request_id": request_id,
        "arm": arm_name,
        "retained": retained,
    })
    try:
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
        return outcomes[int(result)]
    except Exception as exc:
        logger.debug(f"Redis feedback eval using in-memory fallback: {exc}")
        with _fallback_lock:
            if request_id not in _fallback_predictions:
                return "unknown_prediction"
            assigned = _fallback_predictions[request_id]
            if assigned.get("recommended_arm") != arm_name:
                return "arm_mismatch"
            if request_id in _fallback_feedbacks:
                return "duplicate"
            _fallback_feedbacks[request_id] = json.loads(audit_payload)
            if arm_name not in _fallback_posteriors:
                _fallback_posteriors[arm_name] = {"alpha": 1.0, "beta": 1.0}
            field = "alpha" if retained else "beta"
            _fallback_posteriors[arm_name][field] += 1.0
            return "recorded"
