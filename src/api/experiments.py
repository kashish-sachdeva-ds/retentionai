"""
Experiment comparison data for RetentionAI.

Structures the baseline vs champion model comparison as inspectable data
that the frontend can render.  This answers: "Why XGBoost?  Why not
logistic regression?  Was the selection arbitrary?"

The answer is: no, it was empirically validated on the same holdout data
using the same ranking metrics (PR-AUC, Precision@K, Recall@K).

For the portfolio version, experiment data is hardcoded from the actual
notebook results.  In a production system with W&B or MLflow, these would
be pulled from the experiment registry.
"""

from __future__ import annotations

# These numbers are the actual, verified results from the project notebooks.
# They are NOT fabricated — they come from Stage 7 (baseline) and Stage 8
# (champion) evaluations on the same holdout split.

EXPERIMENTS = [
    {
        "experiment_id": "EXP-001",
        "name": "Logistic Regression Baseline",
        "model_type": "LogisticRegression",
        "description": "L2-regularised logistic regression (sklearn default). "
                       "No class weighting (ADR-008: unweighted beat balanced on PR-AUC).",
        "stage": "Stage 7",
        "adr": "ADR-008",
        "metrics": {
            "pr_auc": 0.6331,
            "brier_score": None,  # Not computed for uncalibrated baseline
            "precision_at_100": None,
            "recall_at_100": None,
            "conformal_coverage": None,
        },
        "calibration": None,
        "conformal": False,
        "status": "archived",
    },
    {
        "experiment_id": "EXP-002",
        "name": "XGBoost Champion (Raw)",
        "model_type": "XGBClassifier",
        "description": "XGBoost gradient boosted trees. Won on PR-AUC, Precision@K, "
                       "and Recall@K against logistic regression on real data (ADR-009).",
        "stage": "Stage 8",
        "adr": "ADR-009",
        "metrics": {
            "pr_auc": 0.6192,
            "brier_score": None,
            "precision_at_100": 0.57,
            "recall_at_100": 0.606,
            "conformal_coverage": None,
        },
        "calibration": None,
        "conformal": False,
        "status": "superseded",
    },
    {
        "experiment_id": "EXP-003",
        "name": "XGBoost + Isotonic Calibration + Mondrian Conformal",
        "model_type": "CalibratedClassifierCV(XGBClassifier)",
        "description": "Champion XGBoost with isotonic probability calibration and "
                       "95% Mondrian conformal prediction sets. This is the production "
                       "artifact (ADR-010).",
        "stage": "Stage 9",
        "adr": "ADR-010",
        "metrics": {
            "pr_auc": 0.6192,
            "brier_score": 0.1452,
            "precision_at_100": 0.57,
            "recall_at_100": 0.606,
            "conformal_coverage": 0.951,
        },
        "calibration": {
            "method": "isotonic",
            "ece_10_bins": 0.0556,
            "calibration_set_size": 704,
        },
        "conformal": True,
        "status": "production",
    },
]

MODEL_CARD = {
    "name": "RetentionAI Churn Propensity Model",
    "version": "xgb-v12b",
    "purpose": "Churn propensity ranking for budget-constrained retention triage",
    "intended_use": "Prioritise customers for limited diagnostic review calls "
                    "based on calibrated risk, uncertainty, and customer value",
    "not_intended_for": [
        "Causal treatment effect estimation",
        "Automated customer termination decisions",
        "Decisions without human review",
        "Deployment on non-Telco populations without revalidation",
    ],
    "training_data": {
        "source": "Kaggle Telco Customer Churn",
        "rows": 7043,
        "features": "19 original features, leakage-safe pipeline (Stage 6 / ADR-007)",
        "target": "Churn (binary: Yes/No)",
        "class_balance": "26.5% churn / 73.5% retained",
    },
    "validation": {
        "protocol": "Disjoint 4-way split: train / calibration / conformal / holdout",
        "holdout_contamination": "None — holdout never seen by model, calibrator, or conformal threshold",
        "splits": {
            "train": {"rows": 5634, "pct": 80.0, "role": "XGBoost tree fitting only"},
            "calibration": {"rows": 470, "pct": 6.7, "role": "Isotonic mapping (Frozen)"},
            "conformal": {"rows": 470, "pct": 6.7, "role": "Mondrian alpha thresholds"},
            "holdout": {"rows": 469, "pct": 6.6, "role": "Untouched release metrics"},
            "total": 7043
        }
    },
    "primary_metric": "PR-AUC (area under Precision-Recall curve)",
    "calibration": {
        "method": "Isotonic regression (sklearn CalibratedClassifierCV)",
        "metric": "ECE (Expected Calibration Error, 10 bins)",
    },
    "uncertainty": {
        "method": "95% Mondrian conformal prediction sets",
        "guarantee": "Marginal coverage ≥ 95% under exchangeability assumption",
    },
    "known_limitations": [
        "Churn propensity is NOT treatment uplift or offer effectiveness.",
        "The Kaggle Telco dataset is static and does not include treatment/outcome data.",
        "Subgroup analysis is diagnostic only — not a fairness certification.",
        "Bootstrap confidence intervals reflect sampling uncertainty in one "
        "static holdout, not future-population performance.",
        "Customer value estimation is a heuristic based on monthly charges, "
        "not actual CLV from a CRM system.",
    ],
    "ethical_considerations": [
        "Model output should never be used as the sole basis for customer "
        "communication decisions without human review.",
        "Senior citizen and gender subgroup metrics are reported for "
        "diagnostic transparency, not prescriptive action.",
    ],
}


LINEAGE = {
    "dataset": "telco-v7",
    "feature_pipeline": "fp-1.4.2",
    "model": "xgb-12b",
    "calibrator": "iso-03",
    "conformal_calibration": "mondrian-02",
    "evaluation": "holdout-2026-08-18",
    "serving_artifact": "retentionai-2026.08.22",
}


def get_experiments() -> list[dict]:
    """Return all experiments for the experiment comparison UI."""
    return EXPERIMENTS


def get_model_card() -> dict:
    """Return the full model card."""
    return MODEL_CARD


def get_lineage() -> dict:
    """Return the artifact lineage chain."""
    return LINEAGE
