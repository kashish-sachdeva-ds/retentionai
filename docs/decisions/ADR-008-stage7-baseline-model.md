# ADR-008: Stage 7 Baseline Model — Logistic Regression

**Date:** 2026-07-29
**Status:** Accepted

## Context
First model in the project. Purpose is to establish a floor, not to ship
anything — Stage 8's champion model only earns its added complexity if it
clears whatever this stage produces. Also the point where `ADR-007`'s
deferred class-imbalance question finally gets resolved with a real
comparison instead of an assumption.

## Decision Point 1 — Logistic regression as the baseline model
**Decision:** logistic regression, not a tree-based model, for this stage
specifically.
**Reasoning:** two things a first model needs to give that a
tree-based model doesn't as directly: coefficients that sanity-check
against Stages 4/5's hypotheses (sign and rough magnitude, not just
predictive accuracy), and a cheap, direct way to test `class_weight`
before committing to a modeling approach for Stage 8.

## Decision Point 2 — class_weight: compared, not assumed
**Options considered:** `class_weight=None` vs. `class_weight="balanced"`,
same features, same split, judged on PR-AUC (per `ADR-002` — not ROC-AUC,
which stays optimistic under class imbalance regardless of which setting
wins).
**Result (real data):**
| class_weight | PR-AUC | ROC-AUC |
|---|---|---|
| none | 0.6331 | 0.8380 |
| balanced | 0.6299 | 0.8371 |

**Decision:** `class_weight = none`
**Reasoning:** margin is narrow (0.003 PR-AUC) but consistent in
direction with the earlier synthetic-data test — not a coincidence of one
split. Imbalance handling turning out to barely matter here, on a dataset
with a real 26.5% churn rate, is itself a finding worth keeping: it means
logistic regression's default behavior isn't being meaningfully distorted
by class imbalance on this feature set, so there's no established need to
carry `class_weight`/resampling forward as a default assumption into
Stage 8 — that stays an open question to test again there, not a settled
one.

## Decision Point 3 — Metric hierarchy: PR-AUC first, Precision/Recall@20% second
**Decision:** PR-AUC as the primary model-comparison metric (carried
directly from `ADR-002`); Precision@20% / Recall@20% reported alongside
as the number that maps to the real ~500-call capacity constraint from
Stage 1. ROC-AUC reported but not trusted on its own — it disagreed with
PR-AUC in exactly the direction `ADR-002` predicted before any model
existed.
**Result (real data):** Precision@20% = 0.642, Recall@20% = 0.484 — of
the top 282 customers (20% of the 1,409-row test set) ranked by predicted
probability, 64% genuinely churn, capturing 48% of all churners in the
set.
**Note:** ranking by raw probability rather than probability × CLV per
customer — `ADR-002`'s own math treats CLV as roughly constant, so the
two rankings coincide for this stage. Per-customer CLV weighting is a
real refinement, deliberately not built here.

## Decision Point 4 — 0.5 threshold used for the classification report only
**Decision:** not treated as the operating threshold. Reported for
completeness; the real cutoff gets chosen in Stage 8/9 against actual
call capacity and expected value, not a round default.

## Decision Point 5 — Coefficient sanity check
**Result (synthetic run):** `tenure` and `ContractCommitmentMonths` both
negative, `InternetService_Fiber optic` positive — consistent with
H1/H3/H5 from Stage 4.
**Real-data result:** confirmed — `tenure` (-0.736) and
`ContractCommitmentMonths` (-0.589) both negative, `InternetService_Fiber
optic` (+0.421) positive. Additional finding not predicted in advance:
`StreamingMovies_No internet service` came back strongly negative
(-0.397) — customers with no internet at all churn meaningfully less,
consistent with them being a lower-price, lower-friction segment less
exposed to the price/reliability complaints driving churn elsewhere.

## Trade-offs / What This Costs
- Logistic regression assumes roughly linear, additive effects in the
  standardized feature space — real relationships (e.g. tenure's
  non-linear risk curve, seen back in Stage 4) get flattened into a
  single coefficient here. Expected and acceptable for a floor, not
  acceptable for the model this project ships.

## What Would Change My Mind
- If Stage 8's champion model fails to beat this baseline's PR-AUC, that's
  not evidence to lower the bar — it's a signal something upstream
  (features, data, target definition) needs revisiting before reaching
  for a more complex model.
