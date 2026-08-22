# RetentionAI Senior-Review Showcase Guide

## One-Sentence Positioning

RetentionAI is a decision-support system that prioritizes telecom churn risk with calibrated uncertainty, routes simulated retention offers through a Thompson Sampling bandit policy, and exposes immutable release evidence from a disjoint holdout protocol.

It is deliberately **not** presented as causal uplift modeling: the public Kaggle Telco dataset does not contain randomized intervention and outcome history.

---

## 5-Minute Senior Reviewer Walkthrough

### 1. Home Page (`/`) — Business Problem & Decision Boundary (1 min)
- **Positioning:** State the core business problem: *Which customers should a retention team review when operating with a finite call budget?*
- **Decision Economics:** Highlight the **8.33%** economic triage threshold ($70 outreach / $840 annual revenue) as an illustrative ROI boundary.
- **Pipeline Architecture:** Walk through the 4-step leakage-safe pipeline diagram.

### 2. Risk Assessment Page (`/assess`) — Real Calibrated Scoring (2 min)
- **Archetype Selection:** Select the *At-Risk New Customer* preset and click **Assess Churn Risk**.
- **Live Output Inspection:**
  - **Calibrated Score:** Explain why isotonic calibration is essential (raw tree scores distort probabilities near the tails).
  - **Conformal Uncertainty:** Highlight the 95% Mondrian conformal prediction set `{1}` (confident churn) vs. `{0, 1}` (ambiguous case needing human reviewer discretion).
  - **Intervention Arm:** Explain that the assigned offer (`discount`, `technician`, `control`) was chosen via dynamic Thompson Sampling exploration.
  - **Feasible Scenario Levers:** Show the asynchronous counterfactual recommendation (e.g. 1-year contract commitment).
- **Session History:** Scroll down to the live audit trail and record an outcome to update the live Beta posteriors.

### 3. Model Evidence Page (`/evidence`) — Verification & Holdout Integrity (1 min)
- **Immutable Release Card:** Point out that all metrics are loaded live from the currently serving container artifact via `GET /api/model-card`.
- **Primary Metrics:** Review holdout **PR-AUC (0.6466)** with bootstrap confidence intervals, Precision@100 (81.0%), and Brier score.
- **Disjoint Split Protocol:** Explain the 4-way split (Train / Calibration / Conformal / Holdout) that guarantees conformal exchangeability.
- **Live Bandit Posteriors & Output Drift:** Show the Beta distribution parameters and PSI / KS distribution check.

### 4. About Page (`/about`) & Architecture Records (1 min)
- **Provenance & Integrity:** Highlight the SHA-256 data verification and the fact that raw data is never hardcoded or committed.
- **18 Architecture Decision Records:** Point to `docs/decisions/` as the audit record of engineering trade-offs and decisions.

---

## Questions Senior Reviewers May Ask

| Question | Concise Answer |
|---|---|
| **Why PR-AUC rather than accuracy or ROC-AUC?** | Churn is naturally imbalanced (~26.5%). Accuracy rewards a trivial majority-class predictor; ROC-AUC is overly optimistic on imbalanced data. PR-AUC evaluates true positive identification under a capacity-constrained outreach queue. |
| **Why calibrate the model?** | Downstream intervention economics require probabilities, not arbitrary ranking scores. Isotonic regression aligns model scores directly with the $70 / $840 triage threshold. |
| **What does conformal prediction add over raw probabilities?** | Mondrian conformal prediction yields finite-sample, class-conditional prediction sets with guaranteed 95% coverage, explicitly signaling when predictions carry high uncertainty. |
| **Does the recommended offer cause retention?** | No. The public dataset lacks randomized treatment assignments. The bandit demonstrates an adaptive closed-loop exploration mechanism, not causal uplift. |
| **How is the system deployed in production?** | Azure Container Apps for serverless container execution with auto-TLS, Azure Cache for Redis for persistent policy state, and an Nginx reverse-proxy gateway with client rate limiting and security headers. |
