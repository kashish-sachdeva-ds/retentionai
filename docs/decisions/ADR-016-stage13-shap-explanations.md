# ADR-016: Stage 13 SHAP Explanations

**Date:** 2026-08-16
**Status:** Accepted

## Context
`ADR-015`'s trade-offs section named SHAP as a real, un-implemented gap —
LR coefficients and XGBoost's `feature_importances_` cover global
interpretability, but neither answers "why did the model score *this
specific* customer the way it did." Built here with its own reasoning,
not bolted on without process, per `ADR-015`'s own closing note.

## Decision Point 1 — TreeExplainer, not LinearExplainer
**Decision:** `shap.TreeExplainer(model)`.
**Reasoning:** the champion model is XGBoost (`ADR-009`, confirmed on
real data), a tree ensemble, not a linear model. `LinearExplainer`
requires linear structure (a coefficient vector) that doesn't apply here
at all — using it would have been a category error, not a style choice.
`TreeExplainer` computes exact Shapley values for tree ensembles via a
polynomial-time algorithm walking the actual tree structure; no
background dataset is required, unlike `LinearExplainer` or
`KernelExplainer`.

## Decision Point 2 — Verify additivity directly, not trust the library
**Decision:** for every explanation generated, confirm `base_value +
sum(shap_values)` equals the model's actual raw margin output.
**Reasoning:** same discipline as every other verified claim in this
project (Stage 10's hand-checked `conditional_churn_probability`, Stage
9's manually confirmed calibration numbers). SHAP's additivity guarantee
is its core mathematical promise; checking it costs a few lines and
turns "SHAP does this" into "verified SHAP does this, here, on this
project's actual model."
**A real API mismatch caught while verifying this:** the natural-looking
check would use `model.decision_function()` for the raw margin — but
that method doesn't exist on XGBoost's sklearn wrapper (`XGBClassifier`)
at all; it's specific to linear/SVM-style models. The correct call is
`model.predict(X, output_margin=True)`. Confirmed: additivity holds
exactly (within floating-point tolerance) across 10 sampled real test
instances.

## Decision Point 3 — Report SHAP vs. native feature importance discrepancies honestly
**What happened:** mean `|SHAP|` and XGBoost's native
`feature_importances_` disagreed on the top-two ranking. Native
importance ranked `ContractCommitmentMonths` first and `tenure` second;
mean `|SHAP|` reversed that order.
**Decision:** report the discrepancy directly, with the mechanical
explanation, rather than picking whichever ranking matches Stage 8's
already-published result.
**Reasoning:** the two measures answer genuinely different questions.
Native (gain-based) importance reflects how much a feature improved the
model's loss when used for splits, which can be dominated by a few
high-value early splits. Mean `|SHAP|` reflects the actual average
magnitude of a feature's contribution to real individual predictions.
Disagreement between them isn't a bug in either — it's informative about
*how* a feature matters, not just *how much*. Smoothing this over to
match Stage 8 would have been the same failure mode as reporting PR-AUC
without checking it against a baseline.

## Trade-offs / What This Costs
- SHAP values are computed on the raw XGBoost margin, the same
  uncalibrated decision boundary Stage 12a's counterfactual search uses
  — not the Stage 9 calibrated probability. Both would need reconciling
  onto one consistent basis before combining into a single explanation
  layer in the production API.
- Not yet integrated into the API or dashboard — a genuine, separate
  decision, not an assumed automatic next step just because the module
  exists.

## What Would Change My Mind
- If real-data SHAP rankings match native importance exactly (no
  discrepancy), that's a legitimate, different real finding — worth
  recording as-is, not as a failure to reproduce this run.
- If SHAP-based per-customer explanations become a real product need
  (e.g. surfaced in the dashboard for the retention team), the raw/
  calibrated basis mismatch above should get resolved before that
  integration, not carried forward as an accepted quirk indefinitely.
