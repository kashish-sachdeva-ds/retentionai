# ADR-013: Stage 12a Counterfactual Explanations — Decisions and Findings

**Date:** 2026-08-12
**Status:** Accepted

## Context
Stage 8's feature importance explains the model on average, across every
customer. This stage answers a different, per-customer question: what
minimal, real-world-actionable change would flip *this specific*
prediction from churn to retained.

## Decision Point 1 — Exact grid search over actionable features, not dice-ml
**Options considered:** (a) use the `dice-ml` library's gradient/genetic
counterfactual search; (b) hand-build an exhaustive search restricted to
the small, enumerable actionable feature space.
**Decision:** (b), same reasoning as `vif.py`/`iv.py`/`conformal.py`.
**Reasoning:** The genuinely actionable levers here — contract tier (3
values) and two individual add-ons (2 values each) — form a space of at
most 12 combinations per customer. A generic optimizer built for large
continuous spaces is solving a harder problem than this one actually is;
exhaustive search finds the true minimal-cost flip, not an approximation.

## Decision Point 2 — Restrict search to genuinely actionable features only
**Decision:** Only `ContractCommitmentMonths`, `OnlineSecurity_Yes`, and
`TechSupport_Yes` are allowed to vary; every other feature (tenure,
`InternetService`, `PaymentMethod`, `SeniorCitizen`) stays fixed at the
customer's real value.
**Reasoning:** Same discipline as `ADR-001` — a counterfactual
recommending "if this customer weren't a senior citizen" isn't an offer
anyone can make. `TotalAddOnServices` is deliberately excluded: rejected
in `ADR-006` for underperforming its own raw source columns, and that
verdict doesn't get reversed by moving to a different kind of analysis.
`OnlineSecurity_Yes` and `TechSupport_Yes` are used instead — the two
individual add-on columns with the strongest standalone IV in Stage 5's
real check (0.72 and 0.70 respectively), and `TechSupport` already
appeared as a real covariate in Stage 10's survival analysis.

## Decision Point 3 — Upgrade-only direction constraint
**Decision:** `UPGRADE_ONLY_FEATURES` filters out any candidate that
decreases an actionable feature below the customer's current value.
**Reasoning:** Without this, the search can propose removing a
customer's tech support as a "flip" — mathematically valid (it does
change the prediction) but not a real offer a retention team would ever
make. A search that occasionally proposes an unmakeable offer isn't a
smaller version of the right tool, it's producing wrong answers some
fraction of the time.

## Decision Point 4 — Report the flip rate with scrutiny, not as success
**Result (synthetic run):** 18 of 19 predicted churners flippable
(94.7%) — not the suspicious 100% a naive read might expect, and
genuinely informative either way. Every sampled flip changed
`ContractCommitmentMonths` alone; a direct count across all flippable
customers confirms it dominates.
**Decision:** Report both the rate and the dominant-feature count
together, and treat near-universal flippability as worth explaining, not
celebrating.
**Reasoning:** `ADR-001` already established that some churn (e.g.
relocation) cannot be stopped by any offer. A model whose decision
boundary can almost always be overridden by one feature
(`ContractCommitmentMonths`) is a narrower finding than "the model gives
genuinely diverse, customer-specific recommendations" — worth naming
plainly. Part of this is expected and not a bug: `ContractCommitmentMonths`
has the widest grid and was Stage 8's strongest feature by a wide margin,
so a cost-normalized search naturally gravitates toward it.

## Decision Point 5 — The one non-flippable customer is the more interesting result
**Result (synthetic run):** the single non-flippable customer already
sat at the maximum of every actionable lever (24-month contract,
`TechSupport` already active) and was still predicted to churn — driven
by low tenure (5 months) and fiber optic service, both outside the
actionable search space.
**Decision:** Treat this case as a concrete, real instance of `ADR-001`'s
original point (some churn isn't addressable by any offer), not as a
search failure or an edge case to smooth over.

## Trade-offs / What This Costs
- The search uses the freshly-trained XGBoost's raw 0.5 decision boundary
  (`model.predict()`), not the Stage 9 calibrated model or `ADR-002`'s
  cost-sensitive threshold. These need reconciling into one consistent
  decision rule before Stage 12b — using two different thresholds for
  "is this customer at risk" across the same service would be confusing
  and potentially contradictory. Flagged here, not fixed yet.
- The upgrade-only constraint assumes commitment/add-on increases are
  always executable offers. If a real retention team can't jump a
  customer straight from month-to-month to a 2-year contract in one
  step, the grid may need intermediate options or a maximum-jump
  constraint.

## What Would Change My Mind
- If the real-data flip rate is meaningfully lower than 94.7%, that
  would suggest the model's decision boundary is less dominated by these
  three levers than the synthetic run suggests — a genuinely different
  and equally valid finding, not a failure to match this run.
- If `ContractCommitmentMonths` doesn't dominate flips on real data the
  way it did here, that would weaken (not strengthen) the over-reliance
  concern — worth checking directly rather than assuming the synthetic
  pattern carries over.
