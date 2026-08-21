# ADR-011: Stage 10 Survival Analysis — Cox Proportional Hazards

**Date:** 2026-08-10
**Status:** Accepted

## Context
Stages 7-9 all answered "will this customer churn" from a static
snapshot. This stage asks "when" — using `tenure` as the outcome
explained, not a predictor, and handling right-censoring (active
customers have survived *at least* their observed tenure, not "not
churned") correctly by construction rather than throwing that
distinction away as the classification pipeline did.

## Decision Point 1 — Covariates chosen by domain reasoning, not inherited from Stage 6
**Decision:** `ContractCommitmentMonths`, `SeniorCitizen`,
`InternetService` (H5), `TechSupport` (re-tests H2). `tenure` excluded as
circular (it's the duration being modeled). `TotalAddOnServices`
deliberately excluded.
**Reasoning:** IV/VIF (Stage 5/6) answered a different question — binary
class separation — not how hazard evolves over time. `TotalAddOnServices`
was rejected in `ADR-006` for underperforming its own raw source columns;
that verdict doesn't get reversed by changing model type, so H2 is
re-tested here with the real raw `TechSupport` column instead of
resurrecting a rejected engineered feature.

## Decision Point 2 — A real convergence failure, diagnosed and fixed structurally
**What happened:** initial fit raised `ConvergenceError: singular
matrix`. Diagnosed, not guessed at: `TechSupport == "No internet
service"` is identical, row for row, to `InternetService == "No"` across
the entire dataset (confirmed: 0 disagreements) — the same "No internet
service" duplication VIF caught in Stage 6, now breaking Cox's matrix
inversion for the identical underlying reason (perfect collinearity).
**Decision:** drop the redundant `TechSupport_No internet service` dummy
after one-hot encoding, keeping `InternetService_No` as the single
indicator for "no internet at all."
**Reasoning:** `InternetService_No` already captures the baseline hazard
difference for having no internet; the redundant `TechSupport` dummy was
fighting it for the same variance rather than adding information. Fixed
structurally (dropping the known-duplicate column), not by removing
`TechSupport` from the model entirely — `TechSupport_Yes` still carries
its own distinct meaning (has tech support, among those who could).

## Decision Point 3 — Test the proportional hazards assumption, don't assume it
**Decision:** run `cph.check_assumptions()` before trusting any hazard
ratio, rather than assuming constant relative hazards holds.  
**Reasoning:** same discipline as every prior stage's "measure before
acting" — VIF (Stage 6), the calibration distortion check (Stage 9). An
assumption this central to the model's validity gets tested, not
inherited from a prior model's convergence success.  
**Result (real data):** the proportional-hazards assumption did not hold
for all covariates. Four of the five tested covariates violated the
assumption; only `SeniorCitizen` passed. This is a substantive real-data
finding rather than a code failure. The stratified Cox implementation is
therefore retained for use with the specific violating covariates where
appropriate, rather than stratifying every covariate indiscriminately.

## Decision Point 4 — `conditional_churn_probability` verified by hand, not trusted on faith
**What happened:** the function computes `P(churn within window |
survived to now) = 1 - S(t+window)/S(t)`. Before using it anywhere,
manually recomputed this for a single individual directly from
`predict_survival_function()` and confirmed an exact match against the
function's output.
**Reasoning:** this is the most mathematically involved function in the
module and the one the stage's actual business payoff depends on —
worth confirming its indexing and arithmetic are correct directly,
rather than trusting a plausible-looking implementation.

## Trade-offs / What This Costs
- Stratification (if the real-data assumption check requires it) means
  losing that covariate's own interpretable hazard ratio — a real cost,
  not a free fix, and worth invoking only where the assumption check
  actually fails, not by default.
- Median survival time may come back `inf` for some or all groups if
  observed churn is low enough that no group's KM curve crosses 50%
  within the observed tenure range — expected behavior, not a bug, and
  survival-probability-at-a-fixed-horizon is the correct fallback
  comparison when this happens.

## What Would Change My Mind
- If the real-data proportional hazards check fails for a covariate this
  synthetic run passed cleanly on, that's expected — synthetic runs
  throughout this project exist to prove code correctness, never to
  preview the real result.
- If near-term conditional risk doesn't meaningfully vary among
  similar-tenure active customers on real data, that would weaken the
  case for this stage adding real decision value beyond Stage 8's static
  ranking, and would be worth stating plainly rather than treating the
  stage as automatically justified by its own sophistication.
