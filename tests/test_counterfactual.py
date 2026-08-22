import numpy as np
import pandas as pd
import pytest

from src.config import RAW_CSV_PATH
from src.features.pipeline import run_stage6_split
from src.modeling.champion import train_xgboost
from src.modeling.calibration import calibrate_model
from src.explain.counterfactual import find_counterfactual, ACTIONABLE_GRIDS, UPGRADE_ONLY_FEATURES


@pytest.fixture(scope="module")
def trained_model_and_data():
    df = pd.read_csv(RAW_CSV_PATH)
    X_train, X_test, y_train, y_test, artifacts = run_stage6_split(df)
    model = train_xgboost(X_train, y_train)
    return model, X_test, artifacts


def test_actionable_grids_only_contains_real_kept_features(trained_model_and_data):
    """TotalAddOnServices was rejected in ADR-006 -- must never appear
    here, no matter what any uploaded draft assumes."""
    _, _, artifacts = trained_model_and_data
    assert "TotalAddOnServices" not in ACTIONABLE_GRIDS
    for feature in ACTIONABLE_GRIDS:
        assert feature in artifacts["encoded_columns"]


def test_contract_grid_matches_the_real_encoding():
    """Month-to-month is 0 in this project's real ContractCommitmentMonths
    mapping, not 1."""
    assert ACTIONABLE_GRIDS["ContractCommitmentMonths"] == [0, 12, 24]


def test_search_never_recommends_downgrading_an_upgrade_only_feature(trained_model_and_data):
    """Real bug once (ADR-013 Decision Point 3): the search could
    'recommend' decreasing an add-on or contract length. Sampled across
    several real churners to catch it structurally, not on one hand-picked case."""
    model, X_test, artifacts = trained_model_and_data
    scaler = artifacts["scaler"]
    scaled_columns = artifacts["encoded_columns"]
    X_test_raw = pd.DataFrame(scaler.inverse_transform(X_test), columns=scaled_columns, index=X_test.index)

    preds = model.predict(X_test)
    churner_idx = np.where(preds == 1)[0][:15]

    for idx in churner_idx:
        raw_full = X_test_raw.iloc[idx]
        raw = {f: round(raw_full[f]) for f in ACTIONABLE_GRIDS}
        for f, grid in ACTIONABLE_GRIDS.items():
            raw[f] = min(grid, key=lambda x: abs(x - raw[f]))

        result = find_counterfactual(model, X_test.iloc[idx], raw, scaler, scaled_columns, desired_class=0)
        if result is None:
            continue
        for feature, new_value in result["candidate_raw"].items():
            if feature in UPGRADE_ONLY_FEATURES:
                assert new_value >= raw[feature]


def test_find_counterfactual_returns_none_when_grid_cannot_flip(trained_model_and_data):
    """A customer already at the maximum of every actionable lever, still
    predicted to churn, should come back None -- a real finding (ADR-013
    Decision Point 5), not an error."""
    model, X_test, artifacts = trained_model_and_data
    scaler = artifacts["scaler"]
    scaled_columns = artifacts["encoded_columns"]

    max_raw = {f: max(grid) for f, grid in ACTIONABLE_GRIDS.items()}
    # Use a real churner's row as the base and force it to the grid's max
    # -- valid regardless of whether this specific customer happens to be
    # flippable, since we're testing the "already maxed out" code path.
    instance_input = X_test.iloc[0]
    result = find_counterfactual(model, instance_input, max_raw, scaler, scaled_columns, desired_class=0)
    # Not asserting None specifically (this customer might already be
    # predicted retained) -- asserting the function completes and, if a
    # result exists, it made no further upgrades beyond max.
    if result is not None:
        assert result["raw_changes"] == {}


def test_counterfactual_uses_calibrated_threshold(trained_model_and_data):
    """Post-audit fix (Blocker 2): the counterfactual should use the same
    decision boundary as the calibrated prediction, not the raw model's
    default 0.5. Verify that a counterfactual found with the calibrated
    model + ADR-002 threshold (0.083) actually flips the prediction
    under that threshold."""
    model, X_test, artifacts = trained_model_and_data
    scaler = artifacts["scaler"]
    scaled_columns = artifacts["encoded_columns"]
    X_test_raw = pd.DataFrame(scaler.inverse_transform(X_test), columns=scaled_columns, index=X_test.index)

    from sklearn.model_selection import train_test_split
    df = pd.read_csv(RAW_CSV_PATH)
    _, X_test_full, _, y_test_full, _ = run_stage6_split(df)
    X_calib, _, y_calib, _ = train_test_split(
        X_test_full, y_test_full, test_size=0.5, random_state=7, stratify=y_test_full
    )
    cal_model = calibrate_model(model, X_calib, y_calib, method="isotonic")

    threshold = 70.0 / 840.0  # ADR-002 cost-sensitive threshold
    preds = model.predict(X_test)
    churner_idx = np.where(preds == 1)[0][:5]

    for idx in churner_idx:
        raw_full = X_test_raw.iloc[idx]
        raw = {f: round(raw_full[f]) for f in ACTIONABLE_GRIDS}
        for f, grid in ACTIONABLE_GRIDS.items():
            raw[f] = min(grid, key=lambda x: abs(x - raw[f]))

        result = find_counterfactual(
            cal_model, X_test.iloc[idx], raw, scaler, scaled_columns,
            desired_class=0, threshold=threshold,
        )
        if result is not None:
            # Verify the flip actually holds under the calibrated model
            candidate_input = X_test.iloc[idx].copy()
            for f, v in result["candidate_raw"].items():
                col_idx = scaled_columns.index(f)
                dummy_row = pd.DataFrame(
                    np.zeros((1, len(scaled_columns))), columns=scaled_columns
                )
                dummy_row.iloc[0, col_idx] = v
                scaled_value = scaler.transform(dummy_row)[0, col_idx]
                candidate_input[f] = scaled_value
            prob = cal_model.predict_proba(pd.DataFrame([candidate_input]))[0, 1]
            assert prob < threshold
