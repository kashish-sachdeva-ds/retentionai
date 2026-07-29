# RetentionAI

Customer churn prediction for a telecom business — built to practice
staged, decision-documented ML engineering end to end, not just "train a
model on a Kaggle CSV and report accuracy."

## Status: In progress — Stage 7 of ~13 complete

Every stage is backed by an Architecture Decision Record (ADR) in
`docs/decisions/`, documenting what was decided and *why*, not just what
the code does. Start with `docs/decisions/ADR-000-staged-build-process.md`
for why the project is built this way — including an earlier, ungrounded
attempt that got reset once it became clear code was being written before
the problem was actually framed.

## Problem

A telecom is losing customers and wants to intervene before they leave.
Framed explicitly (`ADR-001`) as: predict who is both likely to churn
*and* plausibly retainable — not just "predict churn" — since a model
that flags customers who can't realistically be saved (e.g. relocating,
no longer needing service) isn't actionable.

Success metric is PR-AUC, not accuracy — the dataset is ~26.5% churn, and
accuracy rewards a model that just predicts "no churn" for everyone.
Precision/Recall at the top 20% of the ranking is tracked alongside it,
mapping directly to a real retention-team call capacity constraint
(`ADR-002`).

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

## Current baseline

Logistic regression, `class_weight=none` (compared directly against
`balanced` in `ADR-008` rather than assumed):

- **PR-AUC: 0.6331**
- ROC-AUC: 0.8380
- Precision@20%: 0.642 — of the top 20% of customers by predicted risk,
  64% genuinely churn
- Recall@20%: 0.484

This is the floor the next stage has to beat, not a candidate for
production.

## Up next

- **Stage 8** — champion model (tree-based), evaluated against this
  baseline
- **Stage 9** — calibration + conformal prediction
- **Stage 10+** — survival analysis (time-to-churn), retention-offer
  targeting, counterfactual explanations, production API

## Setup

```bash
git clone <repo-url>
cd retentionai
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -e .
pip install -r requirements.txt
```

Data isn't tracked in git (`data/raw/`, `data/processed/` are
gitignored — see `ADR-003` for why). Place the
[Telco Customer Churn dataset](https://www.kaggle.com/datasets/blastchar/telco-customer-churn)
at `data/raw/telco_churn.csv`, then run the notebooks in order,
`01` through `06`.

## Why it's structured this way

Every stage exists because the previous one earned it, not because it's a
standard checklist item — e.g. no resampling/class-weighting was added
until Stage 7 actually tested whether it mattered (it barely did). The
`docs/decisions/` folder is the actual record of that reasoning, and is
meant to be read alongside the notebooks, not as an afterthought.
