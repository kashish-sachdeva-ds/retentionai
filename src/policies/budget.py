"""
Budget-constrained allocation for the retention priority queue.

Given a set of scored customers and a finite call budget, this module
selects the optimal subset to contact under three objective functions:

  risk_first   — maximise coverage of highest-risk customers
  value_aware  — maximise total customer value under risk
  balanced     — weighted combination of risk and value

The budget constraint is the single most important product concept in
RetentionAI: the model is not the product, the decision under scarcity is.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from src.policies.priority import CustomerPriority, DEFAULT_WEIGHTS


Objective = Literal["risk_first", "value_aware", "balanced"]


@dataclass
class AllocationResult:
    """Result of a budget allocation run."""
    budget: int
    objective: Objective
    total_customers: int
    selected: list[CustomerPriority]
    not_selected: list[CustomerPriority]

    # Aggregate statistics for the selected set
    avg_risk: float
    total_value: float
    high_risk_covered: int       # customers with P(churn) > 0.80
    uncertain_cases: int         # customers where human review is required
    estimated_revenue_at_risk: float

    # Risk distribution bands for the full population
    risk_bands: dict


def _risk_bands(customers: list[CustomerPriority]) -> dict:
    """Categorise the full population into risk bands for the queue summary."""
    bands = {
        "95_plus": 0,
        "80_to_95": 0,
        "50_to_80": 0,
        "below_50": 0,
    }
    for c in customers:
        p = c.calibrated_probability
        if p >= 0.95:
            bands["95_plus"] += 1
        elif p >= 0.80:
            bands["80_to_95"] += 1
        elif p >= 0.50:
            bands["50_to_80"] += 1
        else:
            bands["below_50"] += 1
    return bands


def _sort_key(objective: Objective):
    """Return a sort key function for the given objective."""
    if objective == "risk_first":
        # Pure risk ranking: highest calibrated probability first
        return lambda c: -c.calibrated_probability
    elif objective == "value_aware":
        # Value-weighted: risk × customer_value
        return lambda c: -(c.calibrated_probability * c.customer_value)
    else:
        # Balanced: use the composite priority score (already computed)
        return lambda c: -c.priority.priority_score


def allocate_budget(
    customers: list[CustomerPriority],
    budget: int,
    objective: Objective = "balanced",
) -> AllocationResult:
    """Select the top-N customers to contact within the given budget.

    The allocation is a simple top-K selection after sorting by the
    objective-specific criterion.  This is intentionally NOT a knapsack
    optimisation — the diagnostic call cost is constant per ADR-002
    ($70 per call), so the optimal allocation is always the top-K by
    the chosen ranking metric.
    """
    sorted_customers = sorted(customers, key=_sort_key(objective))
    actual_budget = min(budget, len(sorted_customers))

    selected = sorted_customers[:actual_budget]
    not_selected = sorted_customers[actual_budget:]

    avg_risk = (
        sum(c.calibrated_probability for c in selected) / len(selected)
        if selected else 0.0
    )
    total_value = sum(c.customer_value for c in selected)
    high_risk = sum(1 for c in selected if c.calibrated_probability > 0.80)
    uncertain = sum(1 for c in selected if c.uncertainty.human_review_required)
    revenue_at_risk = sum(
        c.customer_value * c.calibrated_probability for c in selected
    )

    return AllocationResult(
        budget=actual_budget,
        objective=objective,
        total_customers=len(customers),
        selected=selected,
        not_selected=not_selected,
        avg_risk=round(avg_risk, 4),
        total_value=round(total_value, 2),
        high_risk_covered=high_risk,
        uncertain_cases=uncertain,
        estimated_revenue_at_risk=round(revenue_at_risk, 2),
        risk_bands=_risk_bands(customers),
    )


def compare_strategies(
    customers: list[CustomerPriority],
    budget: int,
) -> dict[str, AllocationResult]:
    """Run all three objectives and return results for side-by-side comparison."""
    return {
        objective: allocate_budget(customers, budget, objective)
        for objective in ("risk_first", "value_aware", "balanced")
    }
