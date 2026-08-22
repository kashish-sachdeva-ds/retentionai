# ADR-017: Production Hardening, Conformal Split Disjointness, and System Integrity

**Date:** 2026-08-21  
**Status:** Accepted  

## Context
Following a rigorous architectural audit of the end-to-end system, several subtle theoretical and practical gaps were identified between the staged findings and the production serving implementation. This ADR documents the architectural decisions made to address all identified blockers and establish defensible portfolio-grade engineering rigor.

---

## Decision Point 1 — Disjoint 3-Way Split for Conformal Prediction (Resolving ADR-010 DP 2)
**What happened:** In Stage 9 / early Stage 12b, `X_calib` was used both to fit the isotonic calibration curve and to compute Mondrian conformal nonconformity quantiles. As flagged in ADR-010 DP 2, this broke the exchangeability assumption, causing the calibrator to overfit its own sample and under-cover on minority churners (88.2% vs. 95% target).  
**Decision:** Implement a clean 3-way split: `X_calib` (for isotonic calibration), `X_conformal` (for computing Mondrian quantiles on data the calibrator has never seen), and `X_holdout` (for empirical evaluation).  
**Reasoning:** Conformal prediction finite-sample coverage guarantees require scores evaluated on data exchangeable with future test points, without optimistic bias from calibration fitting.

---

## Decision Point 2 — Decision Boundary Alignment Between Scoring and Explanations
**What happened:** `/predict` returned a calibrated probability, but the counterfactual engine called `model.predict()` (using the raw tree model's uncalibrated default 0.5 threshold). A customer with a calibrated risk of 15% (high risk under ADR-002's cost-sensitive 8.3% threshold) could be classified as "already retained" by the counterfactual search.  
**Decision:** Pass the `calibrated_model` and the ADR-002 cost-sensitive threshold ($P(\text{churn}) > 70/840 \approx 0.083$) directly into `find_counterfactual()`.  
**Reasoning:** A recommendation engine and a risk scoring engine must operate on the same unified decision policy.

---

## Decision Point 3 — Cross-Field Structural Validation & Feasibility Gates
**What happened:** Field-level schema validations allowed structurally impossible inputs (e.g. `InternetService="No"` with `OnlineSecurity="Yes"`), which could lead to out-of-distribution inference and absurd counterfactual recommendations (e.g., offering internet add-ons to phone-only customers).  
**Decision:**
1. Add Pydantic `model_validator` in `CustomerRequest` enforcing structural service dependencies matching the true Telco domain logic.
2. Add a `has_internet` gate in `find_counterfactual()` locking internet add-ons to 0 for customers without internet service.
3. Automatically scope dropdown selections in the Streamlit dashboard based on parent service selection.

---

## Decision Point 4 — Bandit Feedback Attribution, Idempotency & Audit Trail
**What happened:** `/feedback/{arm_name}` allowed arbitrary posterior manipulation without linking to prediction requests, without idempotency, and without audit trails.  
**Decision:**
1. Require a valid `request_id` in `FeedbackRequest`.
2. Enforce Redis-backed idempotency (HTTP 409 Conflict if feedback is submitted more than once for the same `request_id`).
3. Maintain a 30-day feedback audit record in Redis.
4. Clearly document remaining production auth boundaries in the API and dashboard.

**Implementation update:** `/predict` now persists the `request_id` →
assigned-arm mapping (without duplicating the customer payload). Feedback is
accepted only for that recorded arm. A single Redis Lua transaction checks
the assignment, rejects duplicates, writes the audit event, initializes the
posterior if necessary, and increments it. This closes the race in the old
`EXISTS` → update → `SET` sequence, where two concurrent feedback requests
could both update the posterior.

---

## Decision Point 5 — Versioned Model Artifact Persistence
**What happened:** Models and pipeline transformers were trained from raw CSV on every API startup, making service availability dependent on training compute and data storage access.  
**Decision:** Implement `src/modeling/persistence.py` with versioned artifact directories (`models/<timestamp>/`), JSON manifests, a `latest_version.txt` pointer, and load-or-train lifespan handling in FastAPI (`FORCE_RETRAIN=1` override).

**Implementation update:** manifests include an artifact-schema version,
feature-schema SHA-256 digest, and SHA-256 / byte-size metadata for each
persisted file. The API validates them before deserializing joblib files and
fails loudly if the active pointer is incomplete or altered.

---

## Decision Point 6 — Train/Serve Skew Elimination on Single-Row Dummy Encodings
**What happened:** When `pd.get_dummies(drop_first=True)` was called on a single-row inference input, missing category levels caused dummy column drops to behave differently than during batch processing.  
**Decision:** Persist `cat_categories` in pipeline artifacts and convert string columns to `pd.Categorical` with explicit global levels before dummy encoding in `fit_transform_train()` and `transform_new()`.  
**Verification:** Verified via `pd.testing.assert_frame_equal` with exact numerical parity ($10^{-10}$ tolerance) between single-customer live inference and batch pipeline evaluation.

---

## Decision Point 7 — Explicit Demarcation of Deployment Scope
**Decision:** State explicitly in `README.md`, `docker-compose.yml`, and docstrings that the Docker Compose stack is a **local demo and smoke-test environment**, not a hardened production deployment.  
**Reasoning:** Honesty regarding unbuilt infrastructure (such as TLS, mTLS, rate limiting, and Kubernetes/Cloud Run orchestration) is preferable to overclaiming deployment readiness.

---

## Decision Point 8 — Prevent Synthetic Smoke-Test Data from Being Served as Real
**What happened:** The CI fixture is intentionally schema-compatible with the
Kaggle dataset. Without a provenance gate, the API could train and serve it
while the dashboard still displayed the historical real-data metrics.
**Decision:** The API requires the known 7,043-row Kaggle snapshot by
default. `ALLOW_SYNTHETIC_DATA=1` is an explicit, visibly documented opt-in
for tests and smoke-test demos only.
**Reasoning:** A schema check alone establishes only that code can run; it
does not substantiate business or model-quality claims.

---

## Decision Point 9 — Persisted-Artifact Data Provenance
**What happened:** The initial synthetic-data gate applied only when a model
was trained. A synthetic model written during a smoke test could be loaded on
the next startup without re-reading the source CSV, bypassing that gate.
**Decision:** Manifest schema v3 records a non-PII provenance descriptor
(dataset kind, row count, and SHA-256 of the input CSV). The API rejects
synthetic or unknown persisted bundles unless `ALLOW_SYNTHETIC_DATA=1` is
explicitly set.
**Reasoning:** Model artifacts are the real unit of deployment. Provenance
must follow the artifact, not only the training process, or a valid smoke test
can later become an invalid portfolio claim.
