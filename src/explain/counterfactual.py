"""
Stage 12a -- Counterfactual explanations ("what would flip this prediction").

Built as an exact search, not via dice-ml's gradient/genetic optimizer --
deliberate, same reasoning as vif.py/iv.py/conformal.py being hand-built.
The ACTIONABLE feature space here (which levers the business can actually
pull) is small and fully enumerable:
    ContractCommitmentMonths in {0, 12, 24}   (offer a contract upgrade)
    OnlineSecurity_Yes in {0, 1}              (offer free online security)
    TechSupport_Yes in {0, 1}                 (offer free tech support)
That's at most 3 x 2 x 2 = 12 combinations per customer -- brute force
finds the TRUE minimal-cost flip, not an approximation, and is exact
where a generic optimizer would only be probabilistic.

TotalAddOnServices is NOT used here -- rejected in Stage 5 (ADR-006) for
underperforming its own raw source columns, and that verdict doesn't get
reversed by moving to a different kind of analysis. OnlineSecurity_Yes
and TechSupport_Yes are used instead: the two individual add-on columns
with the strongest standalone IV in Stage 5's real check (0.72 and 0.70
respectively), and TechSupport already appeared as a real covariate in
Stage 10's survival analysis -- a consistent choice across stages, not a
fresh pick each time.

Restricting to these three features specifically (not every column the
model uses) is the same discipline as ADR-001: a counterfactual
recommending "if this customer weren't a senior citizen" or "if this
customer had less tenure" isn't an offer anyone can make. Only genuinely
actionable levers are allowed to vary.
"""

import itertools

import numpy as np
import pandas as pd

ACTIONABLE_GRIDS = {
    "ContractCommitmentMonths": [0, 12, 24],
    "OnlineSecurity_Yes": [0, 1],
    "TechSupport_Yes": [0, 1],
}

# A retention team can offer a contract upgrade or a free add-on -- never
# a downgrade or a takeaway. Without this constraint, the search can
# "recommend" removing a customer's tech support, which isn't a real
# offer anyone would make; it's an artifact of searching the full grid
# with no direction constraint. (This was a real bug once -- see ADR-013.)
UPGRADE_ONLY_FEATURES = {"ContractCommitmentMonths", "OnlineSecurity_Yes", "TechSupport_Yes"}


def _cost(original_raw: dict, candidate_raw: dict, grids: dict) -> float:
    """Normalized total change across actionable features -- how big a
    lever-pull this counterfactual requires, on a comparable 0-1 scale per
    feature regardless of its native range."""
    total = 0.0
    for feature, grid in grids.items():
        feature_range = max(grid) - min(grid)
        if feature_range == 0:
            continue
        total += abs(candidate_raw[feature] - original_raw[feature]) / feature_range
    return total


def find_counterfactual(
    model,
    instance_model_input: pd.Series,
    instance_raw: dict,
    scaler,
    scaled_columns: list,
    grids: dict = None,
    desired_class: int = 0,
):
    """instance_model_input: the row exactly as the model expects it
    (scaled, encoded -- one row from X_test). instance_raw: the SAME
    customer's actionable features in raw, human units (e.g.
    ContractCommitmentMonths=0, TechSupport_Yes=0) -- needed because the
    search enumerates raw values, then re-scales them through the SAME
    fitted scaler the pipeline originally used, to stay in the model's
    expected input space. scaled_columns must match the exact column
    order the scaler was fit on (Stage 6 scales every encoded column, not
    just continuous ones, so this includes the binary dummies too).

    Returns the minimal-cost combination of actionable feature values
    that flips the model's prediction to `desired_class`, or None if
    nothing in the grid achieves it -- itself a real, meaningful finding:
    this customer cannot be moved to "retained" through these levers
    alone.
    """
    grids = grids or ACTIONABLE_GRIDS
    feature_names = list(grids.keys())
    value_lists = [grids[f] for f in feature_names]

    best = None
    best_cost = np.inf

    for combo in itertools.product(*value_lists):
        candidate_raw = dict(instance_raw)
        for f, v in zip(feature_names, combo):
            candidate_raw[f] = v

        # skip any combination that removes a lever the business can only
        # realistically offer MORE of, never less
        if any(
            f in UPGRADE_ONLY_FEATURES and candidate_raw[f] < instance_raw[f]
            for f in feature_names
        ):
            continue

        candidate_model_input = instance_model_input.copy()
        for f, v in zip(feature_names, combo):
            col_idx = scaled_columns.index(f)
            dummy_row = pd.DataFrame(
                np.zeros((1, len(scaled_columns))), columns=scaled_columns
            )
            dummy_row.iloc[0, col_idx] = v
            scaled_value = scaler.transform(dummy_row)[0, col_idx]
            candidate_model_input[f] = scaled_value

        pred_class = model.predict(pd.DataFrame([candidate_model_input]))[0]
        if pred_class == desired_class:
            cost = _cost(instance_raw, candidate_raw, grids)
            if cost < best_cost:
                best_cost = cost
                best = {
                    "raw_changes": {
                        f: candidate_raw[f] for f in feature_names
                        if candidate_raw[f] != instance_raw[f]
                    },
                    "candidate_raw": candidate_raw,
                    "cost": cost,
                }

    return best


def explain_counterfactual(instance_raw: dict, result: dict) -> str:
    if result is None:
        return "No combination of contract tier or add-ons in the searched grid flips this prediction."
    lines = []
    for feature, new_value in result["raw_changes"].items():
        lines.append(f"  {feature}: {instance_raw[feature]} -> {new_value}")
    return "Recommended change(s):\n" + "\n".join(lines)
