# RetentionAI — Technical Architecture & System Design

RetentionAI is a decision-documented telecom customer churn prediction and retention-offer exploration system. This document outlines the end-to-end data pipeline, serving topology, uncertainty framework, and security boundaries.

---

## 1. System Topology on Azure

```mermaid
flowchart TD
    subgraph Client ["Client Layer"]
        Browser["User Browser (Desktop / Mobile)"]
    end

    subgraph Azure_ACA ["Azure Container Apps (Managed Environment)"]
        subgraph Web_App ["retentionai-web"]
            Nginx["Nginx 1.27 Reverse Proxy & Static Host"]
            SPA["React 19 + TailwindCSS v4 SPA"]
        end

        subgraph API_App ["retentionai-api (Internal)"]
            FastAPI["FastAPI 0.141 Application"]
            Pipeline["Leakage-Safe Feature Pipeline"]
            Model["XGBoost Champion + Isotonic Calibrator"]
            Conformal["Mondrian Conformal Sets"]
            CFSearch["Background Counterfactual Search"]
        end
    end

    subgraph Azure_Data ["Azure Cache for Redis"]
        RedisState[("Redis 7.0<br/>- Bandit Beta Posteriors<br/>- Rolling Drift Scores<br/>- Async Counterfactual Results<br/>- Client Rate Limiting Keys")]
    end

    Browser -->|HTTPS :443| Nginx
    Nginx -->|Serves Static Bundle| SPA
    Nginx -->|Proxies /api/*| FastAPI
    FastAPI --> Pipeline
    Pipeline --> Model
    Model --> Conformal
    FastAPI -->|Async Task| CFSearch
    FastAPI <-->|Read / Write| RedisState
    CFSearch -->|Store Output| RedisState
```

---

## 2. ML Engineering Pipeline

```mermaid
flowchart LR
    Kaggle[("Kaggle Telco Snapshot<br/>7,043 rows")] --> Split["4-Way Disjoint Split"]
    
    Split --> Train["Train Set<br/>5,634 rows (80.0%)"]
    Split --> Calib["Calibration Set<br/>470 rows (6.7%)"]
    Split --> Conf["Conformal Set<br/>470 rows (6.7%)"]
    Split --> Holdout["Holdout Set<br/>469 rows (6.6%)"]

    Train --> FeatEng["Train-Only Encoding & IV/VIF Scaling"]
    FeatEng --> XGB["Fit XGBoost Champion"]
    
    XGB --> Calibrator["Fit Isotonic Regressor<br/>(on Calib Set)"]
    Calibrator --> Mondrian["Fit Mondrian Thresholds<br/>(on Disjoint Conformal Set)"]
    
    Mondrian --> EvalReport["Compute Verification Metrics<br/>(on Holdout Set)"]
    EvalReport --> Bundle[("Immutable Versioned Artifact Bundle<br/>models/champion_model.joblib")]
```

---

## 3. Database Persistence & Scaling Strategy

```mermaid
flowchart TD
    API["FastAPI Serving Core"]
    
    subgraph Storage ["Durable Persistence Layer (SQLAlchemy ORM)"]
        direction TB
        SQLite["Portfolio / Single-Instance:<br/>SQLite at data/retentionai.db"]
        Postgres["Multi-Replica Production:<br/>PostgreSQL via DATABASE_URL"]
    end
    
    API -->|Direct Transactions| Storage
    Storage --> Audit["AuditRecordModel (Decisions)"]
    Storage --> Traces["DecisionTraceModel (Pipeline Timings)"]
    Storage --> Events["PredictionEventModel (Live Stream)"]
    Storage --> DriftSnap["DriftSnapshotModel (Lineage & PSI/KS)"]
```

---

## 4. API Endpoints & Access Control

| Endpoint | Method | Access Level | Description |
|---|---|---|---|
| `/health` | `GET` | Public | Service readiness, model loading state, and active version tag. |
| `/model-card` | `GET` | Public | Holdout PR-AUC (with bootstrap CI), Precision@K, calibration Brier/ECE, conformal coverage, and subgroup slices. |
| `/predict` | `POST` | Public (Rate Limited) | Calibrated churn probability, 95% conformal prediction set, assigned bandit arm. |
| `/counterfactual/{request_id}` | `GET` | Public | Asynchronous counterfactual search results for minimum feasible intervention levers. |
| `/bandit/posteriors` | `GET` | Public | Read-only inspection of current Beta distributions across offer arms. |
| `/feedback/{arm_name}` | `POST` | Admin Key Protected | Idempotent retention outcome recording to update Thompson Sampling posteriors. |
| `/monitoring/drift` | `GET` | Public / Admin | PSI & Kolmogorov-Smirnov output score distribution drift checks on live telemetry. |
| `/monitoring/drift/history` | `GET` | Public | Durable historical time-series of point-in-time drift snapshots with data lineage. |
| `/audit/records` | `GET` | Public | Immutable audit log of individual customer assessments and human reviews. |

---

## 5. Key Design Decisions (ADR Reference)

- **ADR-002 (Success Metric):** Evaluated primarily on PR-AUC (not accuracy or ROC-AUC) given class imbalance (~26.5% churn). Cost-sensitive decision threshold derived as $70 / $840 &approx; 8.33%.
- **ADR-007 (Leakage Prevention):** Encoders and scalers are strictly fit on the training split only.
- **ADR-010 & ADR-017 (Disjoint Conformal Calibration):** Separate validation splits are used for isotonic regression vs. Mondrian conformal quantile threshold calculation to preserve finite-sample coverage exchangeability.
- **ADR-012 (Thompson Sampling):** Multi-armed bandit routes offers across `discount`, `technician`, and `control`. Outcomes are stored with SHA-256 idempotency in Redis.
- **ADR-014 (Production Serving):** Pre-trained model artifacts are verified at startup and served via FastAPI.
- **ADR-018 (Durable Storage & Data Lineage):** Dual database strategy (SQLite for single-instance, PostgreSQL for multi-replica) with explicit event ID and window lineage for all drift snapshots.

