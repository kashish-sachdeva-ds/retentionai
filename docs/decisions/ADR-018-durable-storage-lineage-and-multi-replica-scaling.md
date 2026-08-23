# ADR-018: Durable Database Persistence, Explicit Data Lineage & Multi-Replica Scaling

- **Status:** Accepted
- **Date:** 2026-08-23
- **Deciders:** RetentionAI Architecture & MLOps Team
- **Context:** Transition from ephemeral in-memory stores to durable relational persistence with event-driven drift monitoring and clear single-node vs multi-replica scaling strategy.

---

## 1. Context and Problem Statement

Initially, decision audit records and traces were stored in in-memory Python structures. While sufficient for local prototyping, this introduced three critical limitations:
1. **Ephemeral State:** All audit history, decision traces, and evaluation telemetry disappeared across backend or container restarts.
2. **Missing Drift Lineage:** Drift monitoring lacked an auditable link between output drift snapshots and the specific live prediction events that generated them.
3. **Multi-Replica Split-Brain Risk:** In horizontal auto-scaling scenarios with multiple backend replicas, an embedded file-based store without a centralized database causes fragmented, inconsistent telemetry across nodes.

---

## 2. Decision & Architecture

### A. Dual Database Strategy via SQLAlchemy
We established a clean, unified SQLAlchemy ORM persistence layer (`src/db/models.py`, `src/db/session.py`):

1. **Portfolio / Single-Instance Deployment (Default):**
   - **Engine:** SQLite at `data/retentionai.db`.
   - **Characteristics:** Zero external dependencies, self-contained, instant startup, ideal for portfolio demonstrations and single-container deployments.
   - **Thread Safety:** Configured with thread-local sessions and connection pooling (`StaticPool` in testing / thread-safe scoped sessions in production).

2. **Multi-Replica Production Deployment:**
   - **Engine:** PostgreSQL via `DATABASE_URL` environment variable (e.g., `postgresql+psycopg2://app:secret@postgres:5432/retentionai`).
   - **Characteristics:** Centralized transactional history across $N$ auto-scaled FastAPI instances. Eliminates split-brain telemetry where Replica A and Replica B maintain isolated local states.

### B. Durable Event Telemetry & Explicit Data Lineage
We separate raw prediction logs from temporal monitoring snapshots:
- **`PredictionEventModel`**: An append-only event stream logging every `/predict` decision with `request_id`, `customer_id`, `calibrated_probability`, `conformal_set`, `recommended_action`, and `priority_score`.
- **`DriftSnapshotModel`**: Captures point-in-time output drift evaluations with explicit foreign provenance:
  - `window_start` / `window_end`: Exact UTC timestamps bounding the observation window.
  - `prediction_event_start_id` / `prediction_event_end_id`: Exact integer event IDs bounding the dataset evaluated.
  - `model_version`: Serving model artifact version (e.g., `xgb-v12b`).
  - `reference_version`: Baseline reference split (e.g., `calibration-v1`, 470 rows).
  - `source_type`: `live_telemetry` vs `benchmark_holdout`.
  - `psi`, `ks_statistic`, `ks_p_value`, `ks_drift_detected`.

This allows immediate, bidirectional lineage queries:
$$\text{Drift Snapshot } S_k \iff \text{Events } [E_{\text{start}}, \dots, E_{\text{end}}] \iff \text{Audit Records } [A_{\text{start}}, \dots, A_{\text{end}}]$$

### C. Scientific Integrity & Cold-Start Policy
- **No Fabricated Production Telemetry:** If fewer than 100 live prediction events exist, the system explicitly reports `status: "insufficient_data"` with observation counts and the minimum required threshold.
- **Benchmark Preview Mode:** For portfolio evaluation, reviewers can preview calculations on holdout data via `include_benchmark=true`, clearly badged as `BENCHMARK / HOLDOUT PREVIEW`.

---

## 3. Consequences

### Positive
- **Auditable Durability:** Audit records ($A\text{-001} \dots A\text{-10291}$) survive restarts, deployments, and browser refreshes.
- **Reproducible Drift:** Any past drift alert can be independently re-verified by querying the exact subset of `PredictionEventModel` records delimited by `[prediction_event_start_id, prediction_event_end_id]`.
- **Zero-Friction Migration:** Switching from SQLite to PostgreSQL requires only setting `DATABASE_URL` with zero application code changes.

### Neutral / Trade-Offs
- Requires database migration management (handled cleanly through SQLAlchemy model metadata and auto-table initialization).
