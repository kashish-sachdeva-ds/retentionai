# ADR-014: Stage 12b Production API — Decisions and Findings

**Date:** 2026-08-13
**Status:** Accepted

## Context
FastAPI service wiring together the champion model (Stage 8), calibration
and conformal prediction (Stage 9), Redis-backed Thompson Sampling
(extending Stage 11), and background counterfactual generation (Stage
12a) into one deployable service.

## Decision Point 0 — Correcting a serious error caught before this ADR was finalized
**What happened:** an earlier draft of this stage trained Logistic
Regression at startup, citing a fictional `ADR-016` that supposedly
reverted the Stage 8 champion decision because "LR wins PR-AUC,
Precision@K, and Recall@K on real data." This directly contradicts this
project's actual, verified `ADR-009`: XGBoost won all three metrics on
real data (PR-AUC 0.6466 vs. 0.6331, Precision@100 0.810 vs. 0.780,
Recall@100 0.217 vs. 0.209). No `ADR-016` exists — this project is only
at `ADR-014`.
**Decision:** the API trains XGBoost at startup, matching `ADR-009`
exactly.
**Reasoning:** shipping the wrong model because of a fabricated citation
would have been a severe, foundational error — the kind that undermines
every downstream endpoint regardless of how correctly they're built.
Caught by cross-checking against this project's own real, committed
results before accepting the claim, not after.

## Decision Point 1 — A separate Redis-backed bandit, not Stage 11's in-process class
**Decision:** `src/api/redis_bandit.py`, distinct from
`ThompsonSamplingBandit` in `src/bandit/thompson.py`.
**Reasoning:** Stage 11's class holds alpha/beta as Python instance
attributes — correct for single-process offline replay evaluation, wrong
for a live API that may run multiple worker processes. Redis's `HSETNX`
and `HINCRBYFLOAT` are atomic, so concurrent requests across workers
can't race each other into an inconsistent state.
**Verified directly, real Redis, not mocked:** confirmed state written by
one Redis client instance is immediately visible to a second, independent
client instance, and confirmed 30 "discount retained" feedback events
shift arm selection from a roughly even 37/37/26 split to 97/2/1 favoring
`discount` — the live-system behavior actually changes, not just the
stored numbers.

## Decision Point 2 — Reuse Stage 6's own transform functions for single-customer inference
**Decision:** `transform_customer_for_inference()` calls
`prepare_features()` and `transform_new()` directly from
`src/features/pipeline.py`, with placeholder `Churn`/`customerID` values
supplied and then discarded (neither is meaningful for a live prediction
request, but `prepare_features()` requires both to run unmodified).
**Reasoning:** Train/serve skew — subtly different logic at inference
silently producing wrong predictions — is a real, common production ML
failure mode. `transform_new()` was already built in Stage 6 for exactly
this job ("apply an already-fitted pipeline to new data... or production
data later"); no new transform logic was needed here, only a thin
adapter for the API's request shape.
**Verified directly:** a live customer's transformed columns confirmed
identical, in name and order, to `X_test`'s columns from the batch
training pipeline.

## Decision Point 3 — Counterfactual generation as a genuine background task
**Decision:** `/predict` returns immediately with a `request_id`;
`compute_and_store_counterfactual` runs after the response is sent,
result polled via `GET /counterfactual/{request_id}`.
**Reasoning:** The exact grid search (Stage 12a, at most 12 combinations)
is cheap but not free, and a churn prediction should never wait on an
explanation to be generated.
**A real bug found and fixed while wiring this up:** the background task
needs the *full* scaled-column list (`artifacts["encoded_columns"]`) to
locate actionable features like `ContractCommitmentMonths` within the
model's input — passing a continuous-only column subset (as an earlier
draft did) would cause `find_counterfactual()` to fail locating binary
dummy columns by name. Fixed by renaming the parameter to
`scaled_columns` and wiring the full list through explicitly, closing
off the ambiguity that caused the original mistake.

## Decision Point 4 — A real ambiguity found in the counterfactual response, documented not silently accepted
**What happened:** for a customer already predicted "retained" by the raw
model, the counterfactual search correctly returns `raw_changes: {}` with
`flippable: true` — indistinguishable from "needed zero changes to flip."
Reproduced live in this project's own test run, not just described
hypothetically.
**Decision:** Document this as a known gap rather than silently shipping
it — a real fix would have `/predict` check the model's original
prediction first and skip the counterfactual search entirely when already
predicted "retained," returning a distinct status instead of overloading
`raw_changes: {}` with two different meanings.
**Reasoning:** Same discipline as every prior stage's honest-limitation
reporting — noticing an ambiguity in a response the moment it's tested is
worth more than a clean-looking demo that hides it.

## Decision Point 5 — Drift monitoring deliberately excluded from this stage
**Decision:** no `/monitoring/drift` endpoint here.
**Reasoning:** a reasonable future capability, but no monitoring module
has been built or tested anywhere in this project yet. Adding one now,
bundled into an already-large stage, would repeat the exact mistake
`ADR-000` exists to prevent — reaching for a capability before the stage
that would actually justify and test it on its own.

## Trade-offs / What This Costs
- **Models train fresh at API startup**, not loaded from a persisted
  registry (e.g. MLflow). Acceptable given startup cost is a few seconds
  at this dataset size — a real difference from a hardened deployment,
  stated plainly rather than implied away.
- **The counterfactual search uses the raw XGBoost's 0.5 decision
  boundary**, not the calibrated probability `/predict` itself reports.
  These need reconciling onto one consistent threshold — using two
  different definitions of "at risk" in the same service is a real
  inconsistency, not just an inelegance.
- **Test suite and the live API would share the same Redis DB (db=0)** in
  a real dev environment — acceptable for a demo, a genuine bug risk in
  production (tests should never be able to reset live state).
- **Background processes (Redis) do not persist between separate tool
  invocations** in this sandboxed development environment — discovered
  directly when a live Redis instance died silently between two command
  executions during this stage's own development. Real production
  infrastructure doesn't have this property; noted here because it
  shaped how testing had to be sequenced, not because it reflects on the
  code's correctness.

## What Would Change My Mind
- Decision Point 4's ambiguity should be fixed before real deployment,
  not carried forward indefinitely — it's cheap to fix and confusing to
  leave.
- If multi-worker load testing ever shows Redis contention under this
  design, the atomic operations in Decision Point 1 would need
  revisiting for batching, though they should hold up fine at any load
  this project's scope implies.
