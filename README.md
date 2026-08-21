# RetentionAI

[![CI](https://github.com/kashish-sachdeva-ds/retentionai/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/kashish-sachdeva-ds/retentionai/actions/workflows/ci-cd.yml)

Customer churn prediction and retention-offer system for a telecom
business — built to practice staged, decision-documented ML engineering
end to end, not just "train a model on a Kaggle CSV and report accuracy."

## Status: Complete — Stages 1–13

Every stage is backed by an Architecture Decision Record (ADR) in
`docs/decisions/`, documenting what was decided and *why*, not just what
the code does — 16 ADRs covering everything from the initial problem
framing through production deployment, plus `ADR-000`, which documents
why the project restarted at Stage 1 after an early, ungrounded false
start.

## Problem

A telecom is losing customers and wants to intervene before they leave.
Framed explicitly (`ADR-001`) as: predict who is both likely to churn
*and* plausibly retainable — not just "predict churn" — since a model
that flags customers who can't realistically be saved (e.g. relocating,
no longer needing service) isn't actionable.

Success metric is PR-AUC, not accuracy — the dataset is ~26.5% churn, and
accuracy rewards a model that just predicts "no churn" for everyone.
Precision/Recall at a fixed retention-team call budget is tracked
alongside it (`ADR-002`).

## What's done

| Stage | What | Docs |
|---|---|---|
| 1 | Business problem framing + success metric | `ADR-001`, `ADR-002` |
| 2 | Reproducible extraction | `ADR-003`, `notebooks/01_data_extraction.ipynb` |
| 3 | Data understanding | `ADR-004`, `notebooks/02_data_understanding.ipynb` |
| 4 | Hypothesis-driven EDA | `ADR-005`, `notebooks/03_eda.ipynb` |
| 5 | Feature engineering, IV-scored | `ADR-006`, `notebooks/04_feature_engineering.ipynb`, `src/features/iv.py` |
| 6 | Leakage-safe pipeline (encoding, VIF) | `ADR-007`, `notebooks/05_pipeline.ipynb`, `src/features/pipeline.py`, `src/features/vif.py` |
| 7 | Baseline model (logistic regression) | `ADR-008`, `notebooks/06_baseline_model.ipynb` |
| 8 | Champion model (XGBoost) | `ADR-009`, `notebooks/07_champion_model.ipynb` |
| 9 | Calibration + conformal prediction | `ADR-010`, `notebooks/08_calibration_conformal.ipynb` |
| 10 | Survival analysis (Cox PH) | `ADR-011`, `notebooks/09_survival_analysis.ipynb`, `src/survival/cox.py` |
| 11 | Thompson Sampling retention offers | `ADR-012`, `notebooks/10_thompson_sampling.ipynb`, `src/bandit/thompson.py` |
| 12a | Counterfactual explanations | `ADR-013`, `notebooks/11_counterfactual_explanations.ipynb`, `src/explain/counterfactual.py` |
| 12b | Production API | `ADR-014`, `notebooks/12_production_api.ipynb`, `src/api/` |
| 12c | Docker, CI, dashboard | `ADR-015`, `docker-compose.yml`, `dashboard/` |
| 13 | SHAP explanations | `ADR-016`, `notebooks/13_shap_explanations.ipynb`, `src/explain/shap_explainer.py` |

## Champion model

XGBoost, confirmed winner on real data across every metric that matters
(`ADR-009`), evaluated head-to-head against the logistic regression
baseline with identical data, identical scoring functions, and a fixed
call-budget K:

- **PR-AUC: 0.6466** (vs. 0.6331 for the baseline)
- Precision@100: 0.810
- Recall@100: 0.217

Calibrated with isotonic regression and served through Mondrian
conformal prediction sets, so every prediction ships with a 95%-coverage
uncertainty set, not just a point estimate (`ADR-010`). On top of that:
survival analysis for time-to-churn (`ADR-011`), Thompson Sampling for
retention-offer selection (`ADR-012`), counterfactual explanations for
actionable "what would change this" recommendations (`ADR-013`), and
SHAP for global/local interpretability (`ADR-016`) — all wired into a
live FastAPI service and Streamlit dashboard.

## Run it

**With Docker:**
```bash
docker compose up --build
```
- Dashboard: http://localhost:8501
- API docs: http://localhost:8000/docs

**Without Docker:**
```bash
git clone https://github.com/kashish-sachdeva-ds/retentionai.git
cd retentionai
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e .
pip install -r requirements.txt
```

Data isn't tracked in git (`data/raw/`, `data/processed/` are gitignored
— see `ADR-003` for why). Two ways to get it:
- **Manual (simplest):** download the [Telco Customer Churn
  dataset](https://www.kaggle.com/datasets/blastchar/telco-customer-churn)
  and place it at `data/raw/telco_churn.csv`.
- **Kaggle CLI:** set up [Kaggle API
  credentials](https://github.com/Kaggle/kaggle-api#api-credentials),
  then run `notebooks/01_data_extraction.ipynb` — it downloads and places
  the file for you, and skips automatically if the CSV already exists.

Then run the notebooks in order, `01` through `13`.

## Testing

```bash
pip install -r requirements-dev.txt
docker run -d -p 6379:6379 redis:7-alpine   # tests need a real Redis instance
python -m pytest tests/ -v
```

## What's next

- Stratified Cox re-fit by `ContractCommitmentMonths` — the proportional
  hazards assumption currently holds for only 1 of 5 covariates (`ADR-011`)
- Wire SHAP explanations into the API/dashboard (currently notebook-only,
  `ADR-016`)

## Why it's structured this way

Every stage exists because the previous one earned it, not because it's a
standard checklist item — e.g. no resampling/class-weighting was added
until Stage 7 actually tested whether it mattered (it barely did). The
`docs/decisions/` folder is the actual record of that reasoning, and is
meant to be read alongside the notebooks, not as an afterthought.
