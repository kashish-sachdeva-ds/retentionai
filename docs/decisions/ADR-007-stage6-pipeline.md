# ADR-007: Stage 6 Pipeline — Encoding, VIF Resolution, Leakage-Safe Split

**Date:** 2026-07-20
**Status:** Accepted

## Context
Three things were deliberately deferred until this stage: the
`SeniorCitizen` 0/1 vs. `Yes`/`No` inconsistency (flagged Stage 3), the
`tenure`/`TotalCharges`/`MonthlyCharges` multicollinearity flag (flagged
Stage 4, explicitly not acted on there), and an encoding scheme for every
remaining categorical column. `src/features/pipeline.py` and
`src/features/vif.py` were built to resolve all three inside a leakage-safe
split.

## Decision Point 1 — Drop `Contract` by construction, not by VIF discovery
**Options considered:** (a) keep both `Contract` and
`ContractCommitmentMonths`, let VIF find and remove the redundancy; (b)
drop `Contract` explicitly before VIF ever runs.
**Decision:** (b).
**Reasoning:** `ContractCommitmentMonths` is an exact 1-to-1 relabeling of
`Contract` (ADR-006) — keeping both hands VIF a perfectly singular pair,
undefined/infinite VIF for that column against the rest. That's true by
definition, not an empirical finding worth waiting for an iterative
algorithm to stumble onto.

## Decision Point 2 — Resolve `SeniorCitizen` by extending its own convention
**Options considered:** (a) convert `SeniorCitizen` to `"Yes"`/`"No"` to
match the other binary columns, then one-hot everything uniformly; (b)
convert the other true-binary columns (`Partner`, `Dependents`,
`PhoneService`, `PaperlessBilling`) to 0/1 to match `SeniorCitizen`.
**Decision:** (b).
**Reasoning:** One-hot encoding a genuinely binary column produces one
redundant column (2 dummies for 2 states, when 1 suffices) — there's no
information gap a second dummy adds. Since `SeniorCitizen` was already in
the more efficient form, extending that form to the others avoids
introducing unnecessary columns into the matrix VIF has to evaluate.

## Decision Point 3 — IV before encoding, on whole semantic columns
**Decision:** run the IV filter on raw categorical columns, before
one-hot encoding, and only encode the survivors.
**Reasoning:** Keeping or dropping a feature like `PaymentMethod` is a
decision about the whole concept ("does payment method matter at all"),
not about individual category levels. Filtering after encoding would risk
a model using `PaymentMethod_MailedCheck` but not
`PaymentMethod_ElectronicCheck` — a partial-category result with no clean
interpretation.

## Decision Point 4 — A real, discovered finding: the "No internet service" duplication
**What happened:** running VIF on the encoded matrix surfaced infinite
VIF (a `RuntimeWarning: divide by zero`) before any columns were dropped.
Cause: `"No internet service"` appears as an identical value across six
different columns (`OnlineSecurity`, `OnlineBackup`, `DeviceProtection`,
`TechSupport`, `StreamingTV`, `StreamingMovies`) simultaneously for any
customer without internet — their one-hot dummies for that category are
close to perfectly collinear with each other and with `InternetService_No`.
**Decision:** Let the iterative VIF drop (`drop_highest_vif_iteratively`)
resolve this automatically, one column at a time, rather than hand-fixing
it before running VIF.
**Reasoning:** Unlike Decision Point 1 (`Contract`/`ContractCommitmentMonths`,
an exact relabeling known in advance), this duplication is a genuine
empirical fact about how the raw dataset represents "no internet" across
six columns — worth letting VIF discover and resolve, since it's precisely
the kind of multivariate redundancy (not visible in any single pairwise
correlation) that VIF exists to catch.

## Decision Point 5 — Resolving the deferred tenure/MonthlyCharges/TotalCharges flag
**Decision:** Accept whichever of the three survives the iterative VIF
drop on the real dataset, cross-checked against Stage 5's IV ranking.
**Reasoning:** If VIF's survivor also has the highest standalone IV among
the three, that's corroborating evidence, not coincidence — the column
carrying the most real predictive signal is the one worth keeping when a
redundant group must be trimmed down.
[Fill in once run on real data: which column survived, its final VIF, and
whether it matches the highest-IV column of the three from Stage 5.]

## Decision Point 6 — No resampling, no calibration split, yet
**Decision:** This pipeline produces a plain train/test split with no
SMOTE, no `class_weight` adjustment, and no separate calibration holdout.
**Reasoning:** None of these have an earned reason yet in this project's
ADR history. Adding them now — because they're standard technique for
imbalanced classification — would repeat exactly the failure `ADR-000`
describes: reaching for advanced-sounding tools before the stage that
would actually justify them. Whether class imbalance needs addressing,
and how, is a Stage 7/8 decision made once an actual baseline result
exists to show whether it's a real problem for this specific dataset and
model.

## What PROCESSED_CSV_PATH Actually Stores
Deliberately **not** the final IV/VIF-filtered, scaled matrix. Only
`prepare_features()`'s output — cleaned and engineered, not yet fitted
against any particular split. The fitted steps (IV filter, one-hot
category levels, VIF drops, scaler) are re-run at model-training time via
`fit_transform_train()`/`transform_new()`, so they can be refit correctly
against whatever train split a given experiment actually uses, rather
than one split's decisions being silently frozen into a "generic"
processed file.

## Trade-offs / What This Costs
- Every notebook downstream that wants the fully encoded/scaled matrix
  has to call `run_stage6_split()` itself rather than reading one static
  file — slightly more setup per notebook, in exchange for never risking
  a stale or leaked processed file.

## What Would Change My Mind
- If Stage 7's baseline model shows real, meaningful class-imbalance
  degradation, that's the trigger to revisit Decision Point 6 with its
  own dedicated reasoning — not evidence that skipping it here was wrong,
  evidence that the next stage's job is starting.
