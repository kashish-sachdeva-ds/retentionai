import numpy as np
import pytest
import redis

from src.api.redis_bandit import select_arm_redis, update_arm_redis, get_arm_posterior

TEST_DB = 15  # isolated from db=0, which the live API and its dev instance use


@pytest.fixture
def redis_client():
    client = redis.Redis(host="localhost", port=6379, db=TEST_DB, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


def test_arm_initializes_to_uniform_prior(redis_client):
    alpha, beta = get_arm_posterior(redis_client, "discount")
    assert (alpha, beta) == (1.0, 1.0)


def test_update_persists_and_is_visible_to_a_second_independent_client(redis_client):
    """The actual point of Redis-backed state (ADR-014 Decision Point 1):
    multiple worker processes must see the SAME arm statistics."""
    update_arm_redis(redis_client, "discount", reward=1)

    second_client = redis.Redis(host="localhost", port=6379, db=TEST_DB, decode_responses=True)
    alpha, beta = get_arm_posterior(second_client, "discount")
    assert (alpha, beta) == (2.0, 1.0)


def test_repeated_success_updates_shift_selection_toward_that_arm(redis_client):
    for _ in range(50):
        update_arm_redis(redis_client, "discount", reward=1)

    rng = np.random.default_rng(0)
    picks = [select_arm_redis(redis_client, ["discount", "control"], rng) for _ in range(200)]
    assert picks.count("discount") > picks.count("control")


def test_initialization_is_atomic_does_not_reset_on_repeated_calls(redis_client):
    """hsetnx must only take effect once -- calling get_arm_posterior
    again after an update should never silently reset the count."""
    update_arm_redis(redis_client, "discount", reward=1)
    get_arm_posterior(redis_client, "discount")  # would re-trigger init if hsetnx were broken
    alpha, beta = get_arm_posterior(redis_client, "discount")
    assert (alpha, beta) == (2.0, 1.0)
