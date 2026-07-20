# ADR-006: Stage 5 Feature Engineering — Decisions and Findings

**Date:** 2026-07-14
**Status:** Accepted

## Context
Four candidate features were engineered, each required to trace back to a
specific Stage 3 or Stage 4 finding rather than intuition, and each checked
with Information Value (IV) — using `src/features/iv.py`, built before this
project restarted at Stage 0 (ADR-000) and unused until now.

## Decision Point 1 — Require a named source finding for every engineered feature
**Options considered:** (a) engineer whatever seems intuitively useful;
(b) require each feature to cite the specific ADR/finding that motivated it.
**Decision:** (b).
**Reasoning:** Same discipline as every prior stage — "this seems useful"
is exactly how ungrounded features accumulate. Tying each feature to a
named finding (ADR-004's collinearity flag, Stage 4's H1/H2/H4 results)
means every feature in this notebook can be defended with a specific reason
under questioning, not a shrug.

## Decision Point 2 — Reject AvgMonthlySpend despite a reasonable-sounding rationale
**Options considered:** (a) keep it since the derivation (TotalCharges /
tenure) is conceptually sound; (b) reject it because its measured IV (0.085,
weak) is lower than both raw inputs it was derived from (TotalCharges 0.283,
MonthlyCharges 0.132).
**Decision:** (b).
**Reasoning:** A plausible-sounding derivation is not evidence on its own —
that's the entire point of checking every feature instead of trusting
intuition. This is the clearest test of whether that stated rule was
actually followed: a feature failed a test it could have failed, and it was
dropped instead of kept anyway because it seemed clever.

## Decision Point 3 — Keep ContractCommitmentMonths despite identical IV to raw Contract
**Options considered:** (a) reject it since IV showed no improvement over
the raw column (0.527 vs 0.527, exactly equal); (b) keep it anyway, because
IV cannot measure the specific benefit it was built for.
**Decision:** (b).
**Reasoning:** IV measures how well a feature's *bins* separate churners
from non-churners. Relabeling three unordered categories as 1/12/24 doesn't
change the bin structure, so identical IV is mathematically expected, not a
failed test. The actual reason for this feature — giving a linear model a
single ordinal number instead of unordered one-hot columns — is a property
IV was never designed to detect. Rejecting it on IV grounds would be
applying the wrong tool to the question.

## Decision Point 4 — Defer keep/drop decisions on the original raw columns to Stage 6
**Options considered:** (a) drop raw columns now that engineered versions
exist (e.g., drop the six add-on columns now that TotalAddOnServices
exists); (b) leave that decision entirely to Stage 6's VIF check.
**Decision:** (b).
**Reasoning:** IV measures whether a feature carries signal in isolation;
it says nothing about whether two features are redundant with each other.
A feature can have strong IV and still be redundant with another
high-IV feature — that's what VIF checks, not IV. Deciding what to drop
here, using the wrong tool, would repeat the exact mistake IV vs. VIF is
supposed to prevent.

## Trade-offs / What This Costs
- TotalAddOnServices's IV (0.070) sits close to the "weak" boundary, and its
  churn-by-count relationship isn't monotonic in this run, partly reflecting
  a very small sample at the high end (8 customers with all 6 add-ons).
  Real data may behave differently, better or worse.
- ContractCommitmentMonths' actual value can't be confirmed by IV alone —
  it needs to be validated later by comparing actual model performance
  between one-hot Contract and the ordinal version, not by any metric
  available at this stage.

## What Would Change My Mind
If the real dataset's TotalAddOnServices IV drops below 0.02, drop it —
the weak-but-real signal here may not survive contact with real data,
especially given the non-monotonic pattern already visible in this run.
If a later model comparison shows one-hot Contract outperforms the ordinal
version, that would directly contradict the reasoning behind Decision Point
3 and should override it.
