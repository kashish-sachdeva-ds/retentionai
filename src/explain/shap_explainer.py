"""
Stage 13 -- SHAP explanations.

Complements, rather than duplicates, the other explanation layers already
in this project:
    - Feature importance (Stage 8): global -- "across the whole model,
      which features matter most on average"
    - Counterfactual search (Stage 12a): "the minimal actionable change
      that would flip THIS customer's prediction"
    - SHAP (here): "for THIS specific customer's actual prediction, how
      much did each feature push it up or down from the baseline"

The champion model is XGBoost (ADR-009, confirmed on real data across
PR-AUC, Precision@K, and Recall@K), which means TreeExplainer is the
correct tool here -- NOT LinearExplainer, which only applies to linear
models like logistic regression. TreeExplainer computes EXACT Shapley
values for tree ensembles via the polynomial-time algorithm from
Lundberg et al. (2018/2020), not a sampling-based approximation --
"exact" for a genuinely different reason than a linear model's closed
form, but exact either way. Worth knowing which case applies before
defending "how does SHAP work" under questioning.
"""

import numpy as np
import pandas as pd
import shap


def build_explainer(model) -> shap.TreeExplainer:
    """XGBoost's tree structure is exactly what TreeExplainer needs --
    no background dataset required (unlike LinearExplainer or
    KernelExplainer), since the exact algorithm walks the trees
    themselves rather than needing a reference sample to estimate
    against."""
    return shap.TreeExplainer(model)


def explain_prediction(explainer, instance: pd.DataFrame, feature_names: list) -> pd.DataFrame:
    """One row in, one row of per-feature contributions out -- signed,
    in log-odds units, sorted by magnitude so the biggest drivers of
    THIS prediction are first."""
    shap_values = explainer.shap_values(instance)
    contributions = pd.DataFrame({
        "feature": feature_names,
        "shap_value": shap_values[0],
    }).sort_values("shap_value", key=np.abs, ascending=False)
    return contributions


def verify_additivity(explainer, model, instance: pd.DataFrame) -> dict:
    """The exact-additivity property is SHAP's core guarantee: base_value
    + sum(shap_values) should equal the model's actual raw margin output
    for that instance -- the log-odds score BEFORE the sigmoid, not
    predict()'s 0/1 class label. For XGBoost's sklearn wrapper, that's
    predict(..., output_margin=True), not decision_function() (which
    doesn't exist on XGBClassifier -- that's a linear/SVM-model method,
    another symptom of the wrong-champion-model assumption this module
    replaces). Checking this directly, rather than assuming the library
    did it correctly, is the same discipline as every other verified
    claim in this project.
    """
    shap_values = explainer.shap_values(instance)
    base_value = explainer.expected_value
    base_value = float(base_value) if np.isscalar(base_value) else float(base_value[0])

    reconstructed = base_value + shap_values[0].sum()
    actual_margin = float(model.predict(instance, output_margin=True)[0])

    return {
        "base_value": base_value,
        "sum_shap_values": float(shap_values[0].sum()),
        "reconstructed_margin": float(reconstructed),
        "actual_margin": actual_margin,
        "matches": bool(np.isclose(reconstructed, actual_margin, atol=1e-4)),
    }
