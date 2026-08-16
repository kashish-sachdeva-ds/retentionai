import numpy as np
import pandas as pd
import pytest

from src.config import RAW_CSV_PATH
from src.features.pipeline import run_stage6_split
from src.modeling.baseline import train_logistic_regression, precision_at_k, recall_at_k
from src.modeling.champion import train_xgboost


@pytest.fixture(scope="module")
def split_data():
    df = pd.read_csv(RAW_CSV_PATH)
    return run_stage6_split(df)


def test_precision_at_k_perfect_ranking_gives_perfect_precision():
    y_true = np.array([1, 1, 1, 0, 0, 0])
    y_score = np.array([0.9, 0.8, 0.7, 0.3, 0.2, 0.1])  # churners ranked highest
    assert precision_at_k(y_true, y_score, k=3) == 1.0


def test_precision_at_k_worst_ranking_gives_zero_precision():
    y_true = np.array([1, 1, 1, 0, 0, 0])
    y_score = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])  # churners ranked lowest
    assert precision_at_k(y_true, y_score, k=3) == 0.0


def test_recall_at_k_captures_all_positives_when_k_covers_them():
    y_true = np.array([1, 0, 1, 0, 1])
    y_score = np.array([0.9, 0.1, 0.8, 0.05, 0.7])
    assert recall_at_k(y_true, y_score, k=3) == 1.0


def test_baseline_trains_and_predicts_valid_probabilities(split_data):
    X_train, X_test, y_train, y_test, _ = split_data
    model = train_logistic_regression(X_train, y_train)
    proba = model.predict_proba(X_test)[:, 1]
    assert proba.shape[0] == len(X_test)
    assert (proba >= 0).all() and (proba <= 1).all()


def test_champion_trains_and_predicts_valid_probabilities(split_data):
    X_train, X_test, y_train, y_test, _ = split_data
    model = train_xgboost(X_train, y_train)
    proba = model.predict_proba(X_test)[:, 1]
    assert proba.shape[0] == len(X_test)
    assert (proba >= 0).all() and (proba <= 1).all()


def test_champion_does_not_use_is_new_customer_or_total_addon_services(split_data):
    """Both were rejected in ADR-006 -- the champion model must never be
    trained on either, regardless of what any other stage assumes."""
    X_train, _, _, _, _ = split_data
    assert "IsNewCustomer" not in X_train.columns
    assert "TotalAddOnServices" not in X_train.columns
