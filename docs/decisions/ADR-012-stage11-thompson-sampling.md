# ADR-012: Stage 11 Thompson Sampling — Offline Replay, Not Live Routing

**Date:** 2026-07-16
**Status:** Accepted

## Context
Once Stages 7-10 answer "who to call" and "how urgently," a separate
question remains: which specific offer (discount, technician visit, no
offer) to give. Thompson Sampling is the right tool for learning this
over time — but real churn outcomes take 30-90+ days to observe, ruling
out live A/B routing on any timescale this project could run.

## Decision Point 1 — Offline replay evaluation, never live traffic
**Options considered:** (a) simulate live routing directly (assign arms to
customers in real time, wait for outcomes); (b) evaluate entirely via
offline replay (Li et al. 2011) against a logged history.
**Decision:** (b).
**Reasoning:** With 30-90+ day outcome latency, "live" routing in this
project would mean waiting months to see a single round of feedback —
infeasible for a project on this timeline, and not how this technique
would actually be validated before a real deployment anyway. Offline
replay is the standard, legitimate way to evaluate a bandit policy
against historical data before ever running it live. (This specific
tradeoff — live routing vs. offline replay — is reasoned through fresh
here; it's consistent with `ADR-000`'s broader caution against reaching
for advanced techniques before they're justified, but `ADR-000` itself
doesn't address live routing directly.)

## Decision Point 2 — Use a synthetic historical log, stated plainly as synthetic
**Options considered:** (a) skip a concrete demonstration entirely, since
no real logged intervention/outcome data exists for this dataset; (b)
build a clearly-labeled synthetic log to demonstrate the mechanism
correctly.
**Decision:** (b).
**Reasoning:** Same honest gap `ADR-002` already flagged for uplift
modeling — this project has no real record of past interventions or
their outcomes. A synthetic log lets the actual mechanism (Beta-Bernoulli
updates, replay matching) be built, tested, and demonstrated correctly,
which has real value; claiming any output tells you something true about
real offers would not.

## Decision Point 3 — Uniform random arm assignment in the synthetic log
**Options considered:** (a) assign arms using some non-random historical
policy; (b) uniform random.
**Decision:** (b).
**Reasoning:** The replay method's unbiasedness specifically requires that
the historical logging policy assigned arms with known, fixed
probability — uniform random is the simplest case satisfying that
requirement. A non-random historical policy would need explicit
propensity weighting to remain unbiased, a real extension but out of
scope here.

## Decision Point 4 — A real, discovered limitation: replay starves weaker arms of usable data
**What happened:** on a 30,000-event synthetic log with true success rates
`discount=0.65, technician=0.45, control=0.30`, only 33.5% of events were
ever "matched" (usable) at all — of those 10,036 matched events, 9,997
went to `discount` alone, while `technician` and `control` received only
31 and 8 matched observations respectively, despite the raw log having
roughly 10,000 logged events per arm.
**Decision:** Report this as an expected, documented property of the
replay method, not a bug — and scope any claims accordingly (tight
convergence for the best arm only; ranking-order confidence, not
point-estimate confidence, for the others).
**Reasoning:** Once the bandit's posterior confidently favors `discount`,
it selects `discount` on nearly every subsequent call — meaning it only
"matches" the log on the rare occasions the log's random assignment also
happened to be `discount`. This is the real cost of replay evaluation: it
is unbiased, but it can be extremely sample-inefficient for identifying
precise success rates of arms other than the one the bandit converges to.
Asserting tight convergence for every arm would have been claiming
something the method itself doesn't actually deliver.

## Trade-offs / What This Costs
- Replay evaluation, as implemented, answers "is the best arm well-
  identified" reliably, but gives comparatively weak evidence about
  exactly how much worse the losing arms are — good enough to justify
  routing more budget toward `discount`, not precise enough to quantify
  `technician`'s exact deficit with confidence.
- The synthetic log's true success rates are invented, not measured —
  any specific number in this stage (0.65, 0.45, 0.30) is illustrative,
  not a business fact.

## What Would Change My Mind
- If real logged intervention/outcome data becomes available (e.g., a
  pilot with logged random assignment), this exact code runs unchanged —
  the moment that data exists, Decision Point 2's limitation disappears
  and the results become real findings, not a demonstration.
- If a future need arises for precise comparison of weaker arms (not just
  identifying the best one), this method should be supplemented with a
  non-replay technique — e.g., importance-weighted estimators — that use
  logged data more efficiently than plain matching.
