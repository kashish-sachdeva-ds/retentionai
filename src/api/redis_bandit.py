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

import numpy as np
import redis


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
