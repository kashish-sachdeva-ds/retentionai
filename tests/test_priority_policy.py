"""Tests for the Decision Policy and Priority scoring engine."""

import pytest
from src.policies.priority import (
    CustomerPriority,
    DEFAULT_WEIGHTS,
    ECONOMIC_THRESHOLD,
    UncertaintyState,
    compute_contactability,
    compute_exit_sensitivity,
    compute_priority_score,
    determine_action,
    estimate_customer_value,
    score_customer,
)
from src.policies.budget import allocate_budget, compare_strategies


def test_estimate_customer_value():
    val1 = estimate_customer_value(monthly_charges=70.0, tenure_months=0, contract="Month-to-month")
    assert val1 == 840.0

    val2 = estimate_customer_value(monthly_charges=100.0, tenure_months=72, contract="Two year")
    assert val2 > 1200.0


def test_exit_sensitivity():
    high_exit = compute_exit_sensitivity(
        contract="Month-to-month", payment_method="Electronic check", tenure_months=1
    )
    low_exit = compute_exit_sensitivity(
        contract="Two year", payment_method="Credit card (automatic)", tenure_months=60
    )
    assert high_exit > low_exit


def test_uncertainty_state_from_conformal_set():
    u_churn = UncertaintyState.from_conformal_set([1])
    assert u_churn.label == "high_confidence_churn"
    assert not u_churn.human_review_required

    u_ambig = UncertaintyState.from_conformal_set([0, 1])
    assert u_ambig.label == "ambiguous"
    assert u_ambig.human_review_required

    u_retain = UncertaintyState.from_conformal_set([0])
    assert u_retain.label == "high_confidence_retain"
    assert not u_retain.human_review_required


def test_determine_action():
    u_ambig = UncertaintyState.from_conformal_set([0, 1])
    action, conf = determine_action(0.85, u_ambig)
    assert action == "Human Diagnostic Review Required"
    assert conf == "low"

    u_churn = UncertaintyState.from_conformal_set([1])
    action, conf = determine_action(0.85, u_churn)
    assert action == "Prioritize for Diagnostic Review"
    assert conf == "high"


def test_score_customer_and_budget_allocation():
    raw_cust_1 = {
        "customerID": "CUST-001",
        "tenure": 2,
        "MonthlyCharges": 95.0,
        "Contract": "Month-to-month",
        "PaymentMethod": "Electronic check",
        "PhoneService": "Yes",
        "PaperlessBilling": "Yes",
    }
    raw_cust_2 = {
        "customerID": "CUST-002",
        "tenure": 60,
        "MonthlyCharges": 25.0,
        "Contract": "Two year",
        "PaymentMethod": "Credit card (automatic)",
        "PhoneService": "Yes",
        "PaperlessBilling": "No",
    }

    p1 = score_customer("CUST-001", raw_cust_1, calibrated_prob=0.88, conformal_set=[1])
    p2 = score_customer("CUST-002", raw_cust_2, calibrated_prob=0.03, conformal_set=[0])

    assert p1.priority.priority_score > p2.priority.priority_score
    assert p1.above_economic_threshold
    assert not p2.above_economic_threshold

    # Test budget allocation
    alloc = allocate_budget([p1, p2], budget=1, objective="balanced")
    assert alloc.budget == 1
    assert alloc.selected[0].customer_id == "CUST-001"
    assert alloc.high_risk_covered == 1

    comparison = compare_strategies([p1, p2], budget=1)
    assert "risk_first" in comparison
    assert "value_aware" in comparison
    assert "balanced" in comparison
