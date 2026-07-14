# ADR-002: Success Metric & Prioritization Strategy

**Date:** 2026-07-11
**Status:** Accepted

## Context
The retention team has real operational capacity: roughly 500
interventions (calls + offers) per month. A model may flag substantially
more customers than that as "high risk" — assume around 2,000. This means
two separate questions have to be answered before any modeling starts:
(1) what metric should the model itself be judged on, and (2) given the
budget, how should the top 500 out of 2,000 flagged customers actually be
chosen. Both were decided from business reasoning alone, before looking at
the dataset.

## Options Considered
1. **Accuracy** — the default metric most people reach for first.
2. **F1-score** — a step up, balances precision and recall at a single
   classification threshold.
3. **PR-AUC / Precision@K / Recall@K** — ranking-based metrics that
   evaluate how well the model *orders* customers by risk, rather than how
   it classifies at one fixed threshold.
4. For the 500-selection specifically: **rank by raw churn probability**
   vs. **rank by expected value** (churn probability × customer value).

## Decision
- **Model evaluation metric:** PR-AUC as the primary metric, with
  Precision@500 / Recall@500 reported as the operational check tied
  directly to the real budget constraint.
- **Selecting which 500 to call:** rank customers by expected value,
  `score = P(churn) × CLV`, not by churn probability alone.

Accuracy was rejected outright. F1 was seriously considered and rejected
for a more specific reason — the real decision this project supports is a
ranking-under-budget problem ("pick exactly the top 500"), not a
classification-at-a-threshold problem, and F1 doesn't evaluate ranking
quality at a fixed K.

## Reasoning
**Why not accuracy:** the dataset is imbalanced, roughly 26% churn / 74%
retained. A model that predicts "no churn" for every customer scores ~74%
accuracy while being completely useless. Accuracy rewards the majority
class by construction and hides exactly the minority-class errors this
project cares about.

**Why not F1:** F1 is computed at a single classification threshold and
tells you how good that one yes/no split was — it doesn't tell you which
500 out of 2,000 flagged customers are the *best* 500 to act on. The
actual business decision is a ranking problem, not a classification
problem, so the metric needs to evaluate ranking quality specifically.
PR-AUC does this across all thresholds; Precision@500/Recall@500 does it
at the exact operational cutoff that matters. PR-AUC was chosen over the
more common ROC-AUC specifically because of the class imbalance — ROC-AUC
can look artificially strong on imbalanced data because it's partly scored
against the large majority class.

**Why expected value over raw probability for the top-500 selection:**
derived from real cost asymmetry, worked out with concrete (rough, not
precise) numbers:
- Average monthly bill: **$70**
- Estimated additional months retained if saved: **12**
- Estimated CLV of one retained customer: **$840**
- Estimated cost of one retention call + offer: **$70**
- Ratio: **840 / 70 = 12x** — missing a real churner costs roughly 12x
  more than wasting a call on someone who wouldn't have left anyway.

This ratio implies a cost-sensitive decision threshold in the
unconstrained case: `P(churn) × 840 > 70` → call whenever
`P(churn) > 70/840 ≈ 8.3%` — a threshold derived from business economics,
not the default 0.5 or wherever F1 happens to peak.

But the real situation is budget-constrained, not threshold-constrained —
exactly 500 calls, full stop. Under a hard budget, ranking purely by
`P(churn)` can waste calls on high-probability-but-low-value customers
while missing lower-probability-but-high-value ones. Ranking by
`P(churn) × CLV` instead ensures the 500 calls made are the 500 with the
highest expected business impact, not just the 500 "riskiest-looking"
customers.

## Trade-offs / What This Costs
- `P(churn) × CLV` assumes every flagged customer would respond to
  intervention if called — it doesn't yet account for whether the
  customer is actually persuadable. The theoretically correct version is
  `P(churn) × CLV × P(retained | intervention)` — the last term is
  **uplift**, and this project cannot estimate it, because that requires
  historical data where some customers received an intervention and some
  didn't (a treatment/control setup), which the static Kaggle dataset does
  not contain.
- The $70 / 12-month / $840 figures are rough estimates, not measured from
  real company data — they establish the *shape* of the reasoning (large,
  meaningfully-greater-than-1 cost ratio), not an exact number to defend
  as precise.

## What Would Change My Mind
If real historical data on past retention attempts (who was contacted,
what was offered, whether they stayed) becomes available, this should be
revisited toward true uplift modeling instead of expected-value ranking —
that would directly address the Customer-C-style case (a high-value,
high-churn-probability customer who can't actually be saved, e.g. because
they're relocating) that expected-value ranking alone still cannot filter
out.
