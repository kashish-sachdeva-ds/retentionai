"""
Generates SYNTHETIC data matching the Telco Customer Churn schema, so
the Phase 1 pipeline and tests can run end-to-end without the real
Kaggle file. This is a stand-in only — Claude's sandbox can't reach
kaggle.com, so this script exists purely to prove the pipeline code
is correct. Swap in the real dataset before doing any real EDA/modeling:

    kaggle datasets download -d blastchar/telco-customer-churn -p data/ --unzip

The relationships below (short tenure + month-to-month + high charges
=> higher churn probability) are deliberately baked in so that IV /
VIF / SMOTE all have something real to react to — but the exact
numbers are made up, not measured.
"""

import numpy as np
import pandas as pd

from src.config import PROJECT_ROOT

RNG = np.random.default_rng(7)
N = 1500


def generate(n: int = N) -> pd.DataFrame:
    customer_id = [f"SYN-{i:05d}" for i in range(n)]
    gender = RNG.choice(["Male", "Female"], n)
    senior_citizen = RNG.choice([0, 1], n, p=[0.84, 0.16])
    partner = RNG.choice(["Yes", "No"], n)
    dependents = RNG.choice(["Yes", "No"], n, p=[0.3, 0.7])

    tenure = RNG.integers(0, 73, n)
    contract = RNG.choice(
        ["Month-to-month", "One year", "Two year"], n, p=[0.55, 0.24, 0.21]
    )
    internet_service = RNG.choice(
        ["DSL", "Fiber optic", "No"], n, p=[0.34, 0.44, 0.22]
    )
    phone_service = RNG.choice(["Yes", "No"], n, p=[0.9, 0.1])

    # These add-on columns are STRUCTURALLY dependent on the parent service
    # column, not independently random — this mirrors the real dataset, where
    # "No phone service" / "No internet service" only appear because the
    # customer doesn't have that underlying service at all, not as a random
    # third category.
    def dependent_addon(parent_has_service: np.ndarray, yes_prob: float, none_label: str) -> np.ndarray:
        out = np.where(
            parent_has_service,
            RNG.choice(["Yes", "No"], n, p=[yes_prob, 1 - yes_prob]),
            none_label,
        )
        return out

    has_phone = phone_service == "Yes"
    has_internet = internet_service != "No"

    multiple_lines = dependent_addon(has_phone, 0.47, "No phone service")
    online_security = dependent_addon(has_internet, 0.37, "No internet service")
    online_backup = dependent_addon(has_internet, 0.44, "No internet service")
    device_protection = dependent_addon(has_internet, 0.44, "No internet service")
    tech_support = dependent_addon(has_internet, 0.37, "No internet service")
    streaming_tv = dependent_addon(has_internet, 0.49, "No internet service")
    streaming_movies = dependent_addon(has_internet, 0.50, "No internet service")
    paperless_billing = RNG.choice(["Yes", "No"], n, p=[0.59, 0.41])
    payment_method = RNG.choice(
        ["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"],
        n,
    )

    base_charge = np.where(internet_service == "Fiber optic", 70, np.where(internet_service == "DSL", 45, 20))
    monthly_charges = (base_charge + RNG.normal(15, 12, n)).clip(18, 120).round(2)

    total_charges = (tenure * monthly_charges + RNG.normal(0, 20, n)).clip(0, None).round(2)
    total_charges_str = total_charges.astype(str)
    # Mimic the real dataset's quirk: brand-new customers (tenure == 0)
    # have TotalCharges stored as a blank string, not 0.
    total_charges_str = np.where(tenure == 0, " ", total_charges_str)

    # Bake in a realistic churn signal: short tenure + month-to-month +
    # high monthly charges => higher churn log-odds.
    logit = (
        -1.5
        + (-0.04) * tenure
        + np.where(contract == "Month-to-month", 1.1, np.where(contract == "One year", -0.2, -1.0))
        + 0.01 * (monthly_charges - 60)
        + np.where(internet_service == "Fiber optic", 0.4, 0.0)
    )
    prob_churn = 1 / (1 + np.exp(-logit))
    churn = RNG.binomial(1, prob_churn)
    churn_label = np.where(churn == 1, "Yes", "No")

    df = pd.DataFrame({
        "customerID": customer_id,
        "gender": gender,
        "SeniorCitizen": senior_citizen,
        "Partner": partner,
        "Dependents": dependents,
        "tenure": tenure,
        "PhoneService": phone_service,
        "MultipleLines": multiple_lines,
        "InternetService": internet_service,
        "OnlineSecurity": online_security,
        "OnlineBackup": online_backup,
        "DeviceProtection": device_protection,
        "TechSupport": tech_support,
        "StreamingTV": streaming_tv,
        "StreamingMovies": streaming_movies,
        "Contract": contract,
        "PaperlessBilling": paperless_billing,
        "PaymentMethod": payment_method,
        "MonthlyCharges": monthly_charges,
        "TotalCharges": total_charges_str,
        "Churn": churn_label,
    })
    return df


if __name__ == "__main__":
    data = generate()
    output_path = PROJECT_ROOT / "data" / "sample_synthetic.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(output_path, index=False)
    print(f"Wrote {output_path} — shape {data.shape}, churn rate {(data['Churn'] == 'Yes').mean():.3f}")
