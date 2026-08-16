"""
RetentionAI dashboard. Calls the FastAPI service over HTTP (not an
in-process shortcut) -- matches the actual deployed architecture, where
the dashboard and API are separate containers (see docker-compose.yml)
that only talk to each other over the network, the same way a real
external caller would.
"""

import os
import time

import requests
import streamlit as st

API_URL = os.environ.get("RETENTIONAI_API_URL", "http://localhost:8000")

st.set_page_config(page_title="RetentionAI", layout="wide")
st.title("RetentionAI — Churn Risk & Retention Offer")

with st.sidebar:
    st.header("Customer profile")
    tenure = st.number_input("Tenure (months)", min_value=0, max_value=100, value=3)
    monthly_charges = st.number_input("Monthly charges ($)", min_value=0.0, value=85.0)
    total_charges = st.number_input("Total charges ($)", min_value=0.0, value=255.0)
    senior_citizen = st.selectbox("Senior citizen", [0, 1], index=0)
    contract = st.selectbox("Contract", ["Month-to-month", "One year", "Two year"])
    internet_service = st.selectbox("Internet service", ["DSL", "Fiber optic", "No"])
    online_security = st.selectbox("Online security", ["Yes", "No"])
    online_backup = st.selectbox("Online backup", ["Yes", "No"])
    device_protection = st.selectbox("Device protection", ["Yes", "No"])
    tech_support = st.selectbox("Tech support", ["Yes", "No"])
    streaming_tv = st.selectbox("Streaming TV", ["Yes", "No"])
    streaming_movies = st.selectbox("Streaming movies", ["Yes", "No"])
    payment_method = st.selectbox(
        "Payment method",
        ["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"],
    )
    gender = st.selectbox("Gender", ["Female", "Male"])
    partner = st.selectbox("Partner", ["Yes", "No"])
    dependents = st.selectbox("Dependents", ["Yes", "No"])
    phone_service = st.selectbox("Phone service", ["Yes", "No"])
    multiple_lines = st.selectbox("Multiple lines", ["Yes", "No"])
    paperless_billing = st.selectbox("Paperless billing", ["Yes", "No"])

    predict_clicked = st.button("Predict churn risk", type="primary")

if "prediction" not in st.session_state:
    st.session_state.prediction = None
if "counterfactual" not in st.session_state:
    st.session_state.counterfactual = None

if predict_clicked:
    payload = {
        "tenure": tenure, "MonthlyCharges": monthly_charges, "TotalCharges": total_charges,
        "SeniorCitizen": senior_citizen, "Contract": contract, "InternetService": internet_service,
        "OnlineSecurity": online_security, "OnlineBackup": online_backup,
        "DeviceProtection": device_protection, "TechSupport": tech_support,
        "StreamingTV": streaming_tv, "StreamingMovies": streaming_movies,
        "PaymentMethod": payment_method, "gender": gender, "Partner": partner,
        "Dependents": dependents, "PhoneService": phone_service,
        "MultipleLines": multiple_lines, "PaperlessBilling": paperless_billing,
    }
    try:
        response = requests.post(f"{API_URL}/predict", json=payload, timeout=10)
        response.raise_for_status()
        st.session_state.prediction = response.json()
        st.session_state.counterfactual = None
    except requests.exceptions.RequestException as e:
        st.error(f"Could not reach the RetentionAI API at {API_URL}: {e}")
        st.session_state.prediction = None

prediction = st.session_state.prediction

if prediction is not None:
    col1, col2, col3 = st.columns(3)
    col1.metric("Calibrated churn probability", f"{prediction['calibrated_churn_probability']:.1%}")

    pred_set = prediction["conformal_prediction_set"]
    set_label = "Confident" if len(pred_set) == 1 else "Ambiguous (diagnostic call warranted)"
    col2.metric("Model confidence (95% conformal set)", set_label, help=f"Prediction set: {pred_set}")

    col3.metric("Recommended offer (Thompson Sampling)", prediction["recommended_arm"])

    st.divider()
    st.subheader("Counterfactual: what would reduce this customer's risk?")

    if st.button("Check for a counterfactual"):
        request_id = prediction["request_id"]
        result = None
        for _ in range(20):
            cf_response = requests.get(f"{API_URL}/counterfactual/{request_id}", timeout=5)
            payload = cf_response.json()
            if payload.get("status") == "ready":
                result = payload
                break
            time.sleep(0.2)
        st.session_state.counterfactual = result

    cf = st.session_state.counterfactual
    if cf is not None:
        if cf.get("raw_changes"):
            st.success("Recommended change(s):")
            for feature, new_value in cf["raw_changes"].items():
                st.write(f"- **{feature}** → {new_value}")
        elif cf.get("flippable"):
            st.info("This customer is already predicted retained — no change needed.")
        else:
            st.warning(
                "No combination of contract tier or add-on bundle flips this prediction. "
                "This customer may need the diagnostic call (ADR-001) rather than a scripted offer."
            )

    st.divider()
    st.subheader("Was this customer actually retained?")
    fb_col1, fb_col2 = st.columns(2)
    if fb_col1.button("Yes, retained"):
        requests.post(f"{API_URL}/feedback/{prediction['recommended_arm']}", params={"retained": True})
        st.success("Feedback recorded — the bandit's posterior for this arm just updated.")
    if fb_col2.button("No, churned anyway"):
        requests.post(f"{API_URL}/feedback/{prediction['recommended_arm']}", params={"retained": False})
        st.info("Feedback recorded.")
else:
    st.info("Fill in the customer profile in the sidebar and click **Predict churn risk**.")
