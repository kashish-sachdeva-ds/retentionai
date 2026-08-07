"""
Stage 8 — Champion model (XGBoost).

Reuses precision_at_k / recall_at_k from src.modeling.baseline rather than
redefining them here -- see that module's docstring for why a shared
scoring function is the whole point, not a style preference.
"""

import pandas as pd
from xgboost import XGBClassifier


def train_xgboost(X_train: pd.DataFrame, y_train: pd.Series, **kwargs) -> XGBClassifier:
    """Reasonable defaults, not a tuned search -- this stage asks 'does a
    competently-configured XGBoost beat the baseline at all', not 'what is
    the best XGBoost achievable'. A full hyperparameter search is a later,
    separate decision, only worth its cost once it's established that
    XGBoost is the right model family to invest further in."""
    defaults = dict(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="aucpr",
        random_state=42,
    )
    defaults.update(kwargs)
    model = XGBClassifier(**defaults)
    model.fit(X_train, y_train)
    return model
