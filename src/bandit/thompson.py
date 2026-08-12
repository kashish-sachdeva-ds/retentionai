"""
Stage 11 -- Thompson Sampling for offer selection.

Deliberately NOT live A/B routing: real churn outcomes take 30-90+ days
to observe, so a live bandit would have no reward signal to learn from on
any reasonable timescale (consistent with ADR-000's broader caution
against reaching for advanced techniques before they're justified, though
this specific tradeoff -- live routing vs. offline replay -- is reasoned
through fresh here, not something ADR-000 addressed directly). This is
evaluated entirely via OFFLINE REPLAY (Li et al. 2011) against a logged
history, never live traffic.

The historical log this stage runs against is SYNTHETIC -- this dataset
has no real logged intervention/outcome data at all (same honest
limitation ADR-002 already flagged for uplift modeling). This
demonstrates the mechanism correctly; it is not a claim about which real
offer works best.
"""

import numpy as np
import pandas as pd


class ThompsonSamplingBandit:
    """Beta-Bernoulli Thompson Sampling. One Beta(alpha, beta) posterior
    per arm, starting at Beta(1, 1) -- a uniform prior, i.e. "no opinion
    yet."""

    def __init__(self, arm_names: list):
        self.arm_names = list(arm_names)
        self.alpha = {a: 1.0 for a in self.arm_names}
        self.beta = {a: 1.0 for a in self.arm_names}

    def select_arm(self, rng: np.random.Generator) -> str:
        """Sample once from each arm's current posterior; pick the highest
        draw. Arms with wide/uncertain posteriors occasionally sample high
        even with a modest mean -- that's what drives exploration, with no
        separate exploration parameter to tune."""
        samples = {a: rng.beta(self.alpha[a], self.beta[a]) for a in self.arm_names}
        return max(samples, key=samples.get)

    def update(self, arm: str, reward: int) -> None:
        """reward = 1 (customer retained) or 0 (churned anyway)."""
        if reward == 1:
            self.alpha[arm] += 1
        else:
            self.beta[arm] += 1

    def posterior_means(self) -> dict:
        return {a: self.alpha[a] / (self.alpha[a] + self.beta[a]) for a in self.arm_names}


def simulate_historical_log(
    n_events: int, arm_names: list, true_success_rates: dict, rng: np.random.Generator
) -> pd.DataFrame:
    """SYNTHETIC historical log -- this project has no real
    intervention/outcome data to replay against. Arms are assigned
    UNIFORM RANDOM on purpose: the offline replay method (below) is only
    unbiased when the logging policy that generated the historical data
    assigned arms with known, fixed probability -- uniform random is the
    simplest version of that requirement."""
    assigned_arms = rng.choice(arm_names, size=n_events)
    outcomes = np.array([
        rng.binomial(1, true_success_rates[arm]) for arm in assigned_arms
    ])
    return pd.DataFrame({"arm": assigned_arms, "reward": outcomes})


def offline_replay_evaluation(bandit: ThompsonSamplingBandit, log_df: pd.DataFrame, rng: np.random.Generator):
    """Li et al. (2011) unbiased offline evaluation: for each logged
    event, ask the CURRENT bandit which arm it would pick. If that
    matches the arm the historical (uniform-random) policy actually used,
    count it -- update the bandit with the logged reward and record it.
    If it doesn't match, skip the event entirely: we don't know what
    would have happened had a different arm been used for that customer,
    so we can't use it.

    Returns (match_rate, history) where history tracks the bandit's
    posterior mean for each arm over the course of matched events, so
    convergence can be inspected, not just asserted.
    """
    n_matches = 0
    history = []

    for _, row in log_df.iterrows():
        chosen_arm = bandit.select_arm(rng)
        if chosen_arm == row["arm"]:
            bandit.update(chosen_arm, int(row["reward"]))
            n_matches += 1
            history.append({"event": n_matches, **bandit.posterior_means()})

    match_rate = n_matches / len(log_df) if len(log_df) > 0 else 0.0
    return match_rate, pd.DataFrame(history)
