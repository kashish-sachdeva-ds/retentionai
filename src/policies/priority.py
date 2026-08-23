"""
Priority scoring for budget-constrained customer retention triage.

This is the core of RetentionAI's decision policy: converting a calibrated
churn probability into a multi-dimensional priority score that accounts for
risk, customer value, uncertainty, and contactability.

The priority score is NOT a probability.  It is an operational ranking metric
designed to answer: "Given a limited call budget, which customers should a
retention team investigate first?"

The weighting scheme is explicit and inspectable — a key design decision.
Rather than hiding the ranking logic inside a black box, the weights are
surfaced to the user so they can be challenged, adjusted, and audited.
This is deliberately NOT a learned model: the policy layer is a business
decision, not a statistical inference.

Weight rationale (default):
    risk             51%  — calibrated churn probability is the primary signal
    customer_value   21%  — higher-value customers justify intervention cost
    exit_sensitivity 14%  — contract/payment patterns indicating ease of exit
    contactability    8%  — whether the customer can realistically be reached
    uncertainty_adj   6%  — penalise ambiguous predictions, reward confidence
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np


# ---------------------------------------------------------------------------
# Policy configuration
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS = {
    "risk": 0.51,
    "customer_value": 0.21,
    "exit_sensitivity": 0.14,
    "contactability": 0.08,
    "uncertainty_adj": 0.06,
}

# ADR-002: $70 diagnostic call cost vs $840 lost annual revenue
ANNUAL_CUSTOMER_VALUE_BASELINE = 840.0
DIAGNOSTIC_CALL_COST = 70.0
ECONOMIC_THRESHOLD = DIAGNOSTIC_CALL_COST / ANNUAL_CUSTOMER_VALUE_BASELINE  # ~0.0833

CONTRACT_MONTHS = {"Month-to-month": 0, "One year": 12, "Two year": 24}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class UncertaintyState:
    """Interprets a Mondrian conformal prediction set into an actionable state."""
    conformal_set: list[int]
    label: Literal["high_confidence_churn", "ambiguous", "high_confidence_retain", "empty"]
    confidence: Literal["high", "medium", "low"]
    human_review_required: bool

    @staticmethod
    def from_conformal_set(pred_set: list[int] | set[int]) -> "UncertaintyState":
        pred_set = sorted(pred_set)
        if pred_set == [1]:
            return UncertaintyState(
                conformal_set=pred_set,
                label="high_confidence_churn",
                confidence="high",
                human_review_required=False,
            )
        if pred_set == [0]:
            return UncertaintyState(
                conformal_set=pred_set,
                label="high_confidence_retain",
                confidence="high",
                human_review_required=False,
            )
        if pred_set == [0, 1]:
            return UncertaintyState(
                conformal_set=pred_set,
                label="ambiguous",
                confidence="low",
                human_review_required=True,
            )
        return UncertaintyState(
            conformal_set=pred_set,
            label="empty",
            confidence="low",
            human_review_required=True,
        )


@dataclass
class PriorityBreakdown:
    """Full decomposition of a priority score into its contributing factors."""
    priority_score: float
    risk_component: float
    value_component: float
    exit_sensitivity_component: float
    contactability_component: float
    uncertainty_component: float
    weights_used: dict = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))


@dataclass
class CustomerPriority:
    """Complete priority assessment for one customer."""
    customer_id: str
    calibrated_probability: float
    conformal_set: list[int]
    uncertainty: UncertaintyState
    customer_value: float
    exit_sensitivity: float
    contactability: float
    priority: PriorityBreakdown
    recommended_action: str
    decision_confidence: str
    above_economic_threshold: bool


# ---------------------------------------------------------------------------
# Scoring functions
# ---------------------------------------------------------------------------

def estimate_customer_value(
    monthly_charges: float,
    tenure_months: int,
    contract: str,
) -> float:
    """Estimate annual customer value from observable contract data.

    Uses monthly charges × 12 as the base, with a tenure loyalty multiplier
    that accounts for the empirical observation that longer-tenure customers
    tend to have higher lifetime value.  This is a heuristic, not a causal
    model — the Architecture page explicitly labels it as such.
    """
    annual_revenue = monthly_charges * 12.0
    # Tenure loyalty multiplier: new customers get 1.0, 6-year customers get up to 1.5
    tenure_factor = 1.0 + min(tenure_months / 144.0, 0.5)
    return round(annual_revenue * tenure_factor, 2)


def compute_exit_sensitivity(
    contract: str,
    payment_method: str,
    tenure_months: int,
) -> float:
    """Score [0, 1] for how easily a customer can exit.

    High exit sensitivity = month-to-month, electronic check, short tenure.
    Low exit sensitivity  = two-year contract, auto-pay, long tenure.
    """
    contract_score = {
        "Month-to-month": 1.0,
        "One year": 0.4,
        "Two year": 0.1,
    }.get(contract, 0.5)

    payment_score = {
        "Electronic check": 0.9,
        "Mailed check": 0.6,
        "Bank transfer (automatic)": 0.2,
        "Credit card (automatic)": 0.2,
    }.get(payment_method, 0.5)

    # Short tenure = higher exit sensitivity
    tenure_score = max(0.0, 1.0 - (tenure_months / 48.0))

    return round(0.45 * contract_score + 0.30 * payment_score + 0.25 * tenure_score, 4)


def compute_contactability(
    phone_service: str,
    contract: str,
    paperless_billing: str,
) -> float:
    """Score [0, 1] for how reachable a customer is for a diagnostic call.

    This is a simplified heuristic.  In production, contactability would
    come from CRM data (contact preferences, do-not-call lists, timezone,
    last interaction date).  For the portfolio, we use observable proxies.
    """
    phone = 1.0 if phone_service == "Yes" else 0.3
    # Non-paperless customers may be harder to reach quickly
    billing = 0.8 if paperless_billing == "Yes" else 0.5
    # Longer contracts imply an established relationship
    contract_factor = {"Month-to-month": 0.6, "One year": 0.8, "Two year": 1.0}.get(contract, 0.7)

    return round(0.5 * phone + 0.25 * billing + 0.25 * contract_factor, 4)


def compute_priority_score(
    calibrated_prob: float,
    uncertainty: UncertaintyState,
    customer_value: float,
    exit_sensitivity: float,
    contactability: float,
    *,
    weights: dict | None = None,
    value_baseline: float = ANNUAL_CUSTOMER_VALUE_BASELINE,
) -> PriorityBreakdown:
    """Compute a composite priority score in [0, 100].

    Each component is normalised to [0, 1] before weighting so the final
    score is interpretable as a percentage.  The decomposition is returned
    so the UI can show "why this customer was ranked here."
    """
    w = weights or DEFAULT_WEIGHTS

    # Risk: calibrated probability directly maps to [0, 1]
    risk_norm = calibrated_prob

    # Value: normalise against baseline (most customers are near $840/yr)
    value_norm = min(customer_value / (value_baseline * 2.0), 1.0)

    # Exit sensitivity: already [0, 1]
    exit_norm = exit_sensitivity

    # Contactability: already [0, 1]
    contact_norm = contactability

    # Uncertainty: reward confident churn predictions, penalise ambiguity
    uncertainty_map = {
        "high_confidence_churn": 1.0,     # model is sure → boost priority
        "high_confidence_retain": 0.0,    # model is sure it won't churn → lower
        "ambiguous": 0.3,                 # model unsure → moderate penalty
        "empty": 0.1,                     # something unexpected → flag
    }
    uncertainty_norm = uncertainty_map.get(uncertainty.label, 0.3)

    raw = (
        w["risk"] * risk_norm
        + w["customer_value"] * value_norm
        + w["exit_sensitivity"] * exit_norm
        + w["contactability"] * contact_norm
        + w["uncertainty_adj"] * uncertainty_norm
    )
    score = round(raw * 100.0, 1)

    return PriorityBreakdown(
        priority_score=score,
        risk_component=round(w["risk"] * risk_norm * 100, 1),
        value_component=round(w["customer_value"] * value_norm * 100, 1),
        exit_sensitivity_component=round(w["exit_sensitivity"] * exit_norm * 100, 1),
        contactability_component=round(w["contactability"] * contact_norm * 100, 1),
        uncertainty_component=round(w["uncertainty_adj"] * uncertainty_norm * 100, 1),
        weights_used=dict(w),
    )


def determine_action(
    calibrated_prob: float,
    uncertainty: UncertaintyState,
    threshold: float = ECONOMIC_THRESHOLD,
) -> tuple[str, str]:
    """Determine recommended action and decision confidence.

    Returns (action, confidence) tuple.

    Uses scientifically honest terminology:
    - "Prioritize for Diagnostic Review" not "Schedule Diagnostic Call"
      (propensity ≠ causal uplift)
    - Explicit "Human Diagnostic Review Required" when model is uncertain
    """
    if uncertainty.label == "ambiguous":
        return "Human Diagnostic Review Required", "low"

    if calibrated_prob > threshold:
        if uncertainty.label == "high_confidence_churn":
            return "Prioritize for Diagnostic Review", "high"
        return "Prioritize for Diagnostic Review", "medium"

    if uncertainty.label == "high_confidence_retain":
        return "Monitor — No Automated Priority", "high"

    return "Monitor — No Automated Priority", "medium"


def score_customer(
    customer_id: str,
    raw_customer: dict,
    calibrated_prob: float,
    conformal_set: list[int],
    *,
    weights: dict | None = None,
) -> CustomerPriority:
    """Full priority assessment for one customer.

    This is the main entry point for the priority scoring system.
    """
    uncertainty = UncertaintyState.from_conformal_set(conformal_set)

    customer_value = estimate_customer_value(
        monthly_charges=raw_customer.get("MonthlyCharges", 70.0),
        tenure_months=raw_customer.get("tenure", 12),
        contract=raw_customer.get("Contract", "Month-to-month"),
    )

    exit_sensitivity = compute_exit_sensitivity(
        contract=raw_customer.get("Contract", "Month-to-month"),
        payment_method=raw_customer.get("PaymentMethod", "Electronic check"),
        tenure_months=raw_customer.get("tenure", 12),
    )

    contactability = compute_contactability(
        phone_service=raw_customer.get("PhoneService", "Yes"),
        contract=raw_customer.get("Contract", "Month-to-month"),
        paperless_billing=raw_customer.get("PaperlessBilling", "Yes"),
    )

    priority = compute_priority_score(
        calibrated_prob=calibrated_prob,
        uncertainty=uncertainty,
        customer_value=customer_value,
        exit_sensitivity=exit_sensitivity,
        contactability=contactability,
        weights=weights,
    )

    action, confidence = determine_action(calibrated_prob, uncertainty)

    return CustomerPriority(
        customer_id=customer_id,
        calibrated_probability=calibrated_prob,
        conformal_set=sorted(conformal_set),
        uncertainty=uncertainty,
        customer_value=customer_value,
        exit_sensitivity=exit_sensitivity,
        contactability=contactability,
        priority=priority,
        recommended_action=action,
        decision_confidence=confidence,
        above_economic_threshold=calibrated_prob > ECONOMIC_THRESHOLD,
    )
