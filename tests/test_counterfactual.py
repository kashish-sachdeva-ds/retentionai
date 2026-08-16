import numpy as np

from src.bandit.thompson import ThompsonSamplingBandit, simulate_historical_log, offline_replay_evaluation


def test_uniform_prior_gives_no_arm_a_starting_advantage():
    bandit = ThompsonSamplingBandit(["a", "b", "c"])
    assert bandit.alpha == {"a": 1.0, "b": 1.0, "c": 1.0}
    assert bandit.beta == {"a": 1.0, "b": 1.0, "c": 1.0}
    assert bandit.posterior_means() == {"a": 0.5, "b": 0.5, "c": 0.5}


def test_update_with_success_increases_posterior_mean():
    bandit = ThompsonSamplingBandit(["a"])
    before = bandit.posterior_means()["a"]
    bandit.update("a", reward=1)
    after = bandit.posterior_means()["a"]
    assert after > before


def test_update_with_failure_decreases_posterior_mean():
    bandit = ThompsonSamplingBandit(["a"])
    before = bandit.posterior_means()["a"]
    bandit.update("a", reward=0)
    after = bandit.posterior_means()["a"]
    assert after < before


def test_select_arm_favors_the_arm_with_more_successes():
    bandit = ThompsonSamplingBandit(["good", "bad"])
    for _ in range(50):
        bandit.update("good", reward=1)
        bandit.update("bad", reward=0)

    rng = np.random.default_rng(0)
    picks = [bandit.select_arm(rng) for _ in range(200)]
    assert picks.count("good") > picks.count("bad")


def test_offline_replay_only_updates_on_matched_events():
    rng = np.random.default_rng(0)
    true_rates = {"a": 0.9, "b": 0.1}
    log = simulate_historical_log(1000, list(true_rates.keys()), true_rates, rng)
    bandit = ThompsonSamplingBandit(list(true_rates.keys()))

    match_rate, history = offline_replay_evaluation(bandit, log, rng)

    total_updates = (bandit.alpha["a"] + bandit.beta["a"] - 2) + (bandit.alpha["b"] + bandit.beta["b"] - 2)
    assert total_updates == round(match_rate * len(log))
    assert len(history) == round(match_rate * len(log))


def test_offline_replay_recovers_correct_ranking():
    rng = np.random.default_rng(1)
    true_rates = {"best": 0.8, "worst": 0.2}
    log = simulate_historical_log(20000, list(true_rates.keys()), true_rates, rng)
    bandit = ThompsonSamplingBandit(list(true_rates.keys()))
    offline_replay_evaluation(bandit, log, rng)

    means = bandit.posterior_means()
    assert means["best"] > means["worst"]
