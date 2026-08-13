"""
Single-customer inference transform for the live API.

Deliberately reuses prepare_features() and transform_new() directly from
src/features/pipeline.py rather than reimplementing equivalent logic here
-- using the SAME code at train time and serve time is what actually
prevents train/serve skew, a real and common cause of production ML bugs
(subtly different logic at inference silently producing wrong predictions
that no amount of model quality can fix).

This turned out simpler than a first pass might suggest: transform_new()
was already built in Stage 6 for exactly this job -- "apply an
already-fitted pipeline to new data (test set now, or production data
later)." A live customer is just another row of "new data" to that
function; no new transform logic needed here at all, only a thin adapter
for the API's request shape.
"""

import pandas as pd

from src.features.pipeline import prepare_features, transform_new


def transform_customer_for_inference(raw_customer: dict, artifacts: dict) -> pd.DataFrame:
    """raw_customer: a dict matching the raw Telco schema (tenure, Contract,
    InternetService, the six add-on columns, etc.) -- what an external
    caller would realistically send, not pre-engineered features. No
    "Churn" field, since a live customer's true label is exactly what's
    being predicted.

    artifacts: the dict returned by fit_transform_train() at startup --
    carries the fitted scaler, the IV-surviving column list, and the
    exact final encoded column order the model expects.
    """
    # prepare_features() requires a Churn column (to encode y, unused here)
    # and a customerID column (an ID_COLS entry it drops) -- neither is
    # meaningful for a live prediction request, so placeholders are
    # supplied and discarded. Reusing prepare_features() unmodified
    # (rather than a near-duplicate without these two fields) is what
    # keeps this path identical to the training path, not just similar
    # to it.
    customer_with_placeholders = dict(raw_customer)
    customer_with_placeholders["Churn"] = "No"
    customer_with_placeholders["customerID"] = "live-request"

    df = pd.DataFrame([customer_with_placeholders])
    X, _ = prepare_features(df)
    return transform_new(X, artifacts)
