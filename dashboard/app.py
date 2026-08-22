"""
RetentionAI — Churn-prioritisation decision-support dashboard.

Streamlit decision-support application communicating with the FastAPI
service over HTTP. It exposes calibrated churn scores, conformal
prediction sets, model-consistent counterfactual scenarios, a Thompson
Sampling policy mechanism, and output-drift checks.

It does not estimate causal treatment effects or represent a production
deployment.
"""

import os
import time

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import requests
import streamlit as st

_raw_api_url = os.environ.get("RETENTIONAI_API_URL", "http://localhost:8000").rstrip("/")
API_URL = _raw_api_url if _raw_api_url.endswith("/api/v1") else f"{_raw_api_url}/api/v1"

# ---------------------------------------------------------------------------
# Page configuration
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="RetentionAI — Decision Support",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ---------------------------------------------------------------------------
# Design system — Polished, high-conviction executive enterprise UI
# ---------------------------------------------------------------------------
CUSTOM_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* ---- Base & Typography ---- */
html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #0F172A;
}

.stApp {
    background-color: #F8FAFC;
}

[data-testid="collapsedControl"] { display: none; }
.block-container {
    padding-top: 1.5rem;
    padding-bottom: 3rem;
    max-width: 1280px;
}

/* ---- Header Bar ---- */
.brand-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 12px;
    border-bottom: 1px solid #E2E8F0;
    margin-bottom: 12px;
}
.brand-logo-title {
    display: flex;
    align-items: center;
    gap: 12px;
}
.brand-icon {
    background: #0F172A;
    color: #FFFFFF;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 1.1rem;
    letter-spacing: -0.05em;
}
.brand-title {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    color: #0F172A;
    letter-spacing: -0.025em;
    line-height: 1.2;
}
.brand-subtitle {
    margin: 2px 0 0 0;
    color: #64748B;
    font-size: 0.85rem;
    font-weight: 500;
}

/* ---- Status Chips ---- */
.status-pill-group {
    display: flex;
    align-items: center;
    gap: 8px;
}
.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 9999px;
    letter-spacing: 0.01em;
}
.status-pill-ready {
    background: #ECFDF5;
    color: #065F46;
    border: 1px solid #A7F3D0;
}
.status-pill-degraded {
    background: #FFFBEB;
    color: #92400E;
    border: 1px solid #FDE68A;
}
.status-pill-offline {
    background: #FEF2F2;
    color: #991B1B;
    border: 1px solid #FECACA;
}
.status-pill-version {
    background: #F1F5F9;
    color: #334155;
    border: 1px solid #E2E8F0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
}

.disclosure-text {
    font-size: 0.76rem;
    color: #94A3B8;
    margin: 0 0 16px 0;
    line-height: 1.4;
}

/* ---- Section Headers ---- */
.section-tag {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    margin: 0 0 10px 0;
    display: flex;
    align-items: center;
    gap: 6px;
}

/* ---- Executive Card Container ---- */
.exec-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 14px;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04);
}

/* ---- Preset Selector Cards ---- */
.preset-box {
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 8px;
    background: #FFFFFF;
    transition: all 0.15s ease;
}
.preset-box-active {
    border: 1.5px solid #2563EB;
    background: #EFF6FF;
}
.preset-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}
.preset-name {
    font-size: 0.88rem;
    font-weight: 700;
    color: #0F172A;
    margin: 0;
}
.preset-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.badge-red { background: #FEE2E2; color: #991B1B; }
.badge-green { background: #ECFDF5; color: #065F46; }
.badge-amber { background: #FEF3C7; color: #92400E; }

.preset-description {
    font-size: 0.77rem;
    color: #64748B;
    margin: 0 0 8px 0;
    line-height: 1.35;
}
.preset-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.param-chip {
    font-size: 0.70rem;
    font-weight: 500;
    background: #F1F5F9;
    color: #475569;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #E2E8F0;
}

/* ---- Trait Summary Strip ---- */
.trait-strip {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 0.78rem;
    color: #334155;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
}
.trait-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

/* ---- Score Cards Grid ---- */
.metric-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 14px;
}
.metric-tile {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 16px;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
}
.metric-tile-title {
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748B;
    margin: 0 0 6px 0;
}
.metric-tile-number {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #0F172A;
    line-height: 1.1;
    margin: 0 0 8px 0;
}
.metric-tile-sub {
    font-size: 0.75rem;
    color: #64748B;
    margin: 0;
    line-height: 1.3;
}

/* ---- Severity Pills ---- */
.severity-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.74rem;
}
.severity-high { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
.severity-medium { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
.severity-low { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }

/* ---- Visual Risk Bar ---- */
.risk-bar-container {
    background: #E2E8F0;
    border-radius: 9999px;
    height: 8px;
    position: relative;
    margin: 10px 0 6px 0;
    overflow: hidden;
}
.risk-bar-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.3s ease;
}
.risk-threshold-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #0F172A;
    z-index: 2;
}

/* ---- Policy Arm Pill ---- */
.arm-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #EFF6FF;
    color: #1D4ED8;
    border: 1px solid #BFDBFE;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.82rem;
}

/* ---- Context & Decision Box ---- */
.context-box {
    background: #F8FAFC;
    border-left: 3px solid #2563EB;
    border-radius: 0 8px 8px 0;
    padding: 12px 16px;
    margin-bottom: 14px;
    font-size: 0.84rem;
    color: #334155;
    line-height: 1.5;
}
.context-box strong {
    color: #0F172A;
}

/* ---- Lever Comparison Table ---- */
.lever-card {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.lever-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: #1E293B;
}
.lever-change {
    font-size: 0.82rem;
    font-weight: 700;
    color: #059669;
    font-family: 'JetBrains Mono', monospace;
}

/* ---- Warning Banner ---- */
.demo-banner {
    background: #FFFBEB;
    border: 1px solid #FDE68A;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 14px;
    font-size: 0.82rem;
    color: #92400E;
    line-height: 1.45;
}

/* ---- Streamlit Component Cleanups ---- */
.stButton>button {
    border-radius: 8px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    transition: all 0.15s ease;
}
.stButton>button[kind="primary"] {
    background: #2563EB;
    border: 1px solid #1D4ED8;
    color: #FFFFFF;
}
.stButton>button[kind="primary"]:hover {
    background: #1D4ED8;
    border-color: #1E40AF;
}

div[data-testid="stExpander"] {
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    background: #FFFFFF;
    margin-bottom: 12px;
}

div[data-testid="stTabs"] button {
    font-size: 0.86rem;
    font-weight: 600;
    color: #64748B;
    padding: 8px 16px;
}
div[data-testid="stTabs"] button[aria-selected="true"] {
    color: #0F172A !important;
    border-bottom-color: #2563EB !important;
}

pre, code {
    font-family: 'JetBrains Mono', monospace !important;
}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# Preset Customer Archetypes
# ---------------------------------------------------------------------------
PRESETS = {
    "at_risk": {
        "label": "At-risk new customer",
        "desc": "Short tenure, month-to-month, fibre optic, few support add-ons",
        "badge": "High Risk",
        "badge_class": "badge-red",
        "quick_tags": ["2 mo tenure", "Month-to-month", "Fiber optic", "$89.50/mo"],
        "data": {
            "tenure": 2, "MonthlyCharges": 89.5, "TotalCharges": 179.0,
            "SeniorCitizen": 0, "Contract": "Month-to-month",
            "InternetService": "Fiber optic", "OnlineSecurity": "No",
            "OnlineBackup": "No", "DeviceProtection": "No", "TechSupport": "No",
            "StreamingTV": "Yes", "StreamingMovies": "Yes",
            "PaymentMethod": "Electronic check", "gender": "Female",
            "Partner": "No", "Dependents": "No", "PhoneService": "Yes",
            "MultipleLines": "No", "PaperlessBilling": "Yes",
        },
    },
    "loyal": {
        "label": "Loyal long-tenure customer",
        "desc": "Two-year contract, DSL, full security add-ons, high tenure",
        "badge": "Low Risk",
        "badge_class": "badge-green",
        "quick_tags": ["68 mo tenure", "Two year", "DSL", "$64.00/mo"],
        "data": {
            "tenure": 68, "MonthlyCharges": 64.0, "TotalCharges": 4352.0,
            "SeniorCitizen": 0, "Contract": "Two year",
            "InternetService": "DSL", "OnlineSecurity": "Yes",
            "OnlineBackup": "Yes", "DeviceProtection": "Yes", "TechSupport": "Yes",
            "StreamingTV": "No", "StreamingMovies": "No",
            "PaymentMethod": "Bank transfer (automatic)", "gender": "Male",
            "Partner": "Yes", "Dependents": "Yes", "PhoneService": "Yes",
            "MultipleLines": "Yes", "PaperlessBilling": "No",
        },
    },
    "borderline": {
        "label": "Borderline mid-contract customer",
        "desc": "One-year contract, fibre optic, partial add-ons, senior",
        "badge": "Moderate Risk",
        "badge_class": "badge-amber",
        "quick_tags": ["18 mo tenure", "One year", "Fiber optic", "$79.00/mo"],
        "data": {
            "tenure": 18, "MonthlyCharges": 79.0, "TotalCharges": 1422.0,
            "SeniorCitizen": 1, "Contract": "One year",
            "InternetService": "Fiber optic", "OnlineSecurity": "No",
            "OnlineBackup": "Yes", "DeviceProtection": "No", "TechSupport": "No",
            "StreamingTV": "Yes", "StreamingMovies": "No",
            "PaymentMethod": "Credit card (automatic)", "gender": "Female",
            "Partner": "No", "Dependents": "No", "PhoneService": "Yes",
            "MultipleLines": "No", "PaperlessBilling": "Yes",
        },
    },
}

# ---------------------------------------------------------------------------
# Business logic constants & helpers
# ---------------------------------------------------------------------------
# ADR-002: Cost of intervention (~$70) / Lost Annual Customer Value (~$840) = 8.33%
COST_THRESHOLD = 70.0 / 840.0


def _internet_addon_options(internet_service: str) -> list[str]:
    if internet_service == "No":
        return ["No internet service"]
    return ["Yes", "No"]


def _phone_addon_options(phone_service: str) -> list[str]:
    if phone_service == "No":
        return ["No phone service"]
    return ["Yes", "No"]


def _risk_severity(p_churn: float, threshold: float) -> tuple[str, str, str, str]:
    """Return (label, css_class, icon, bar_color)."""
    if p_churn >= 0.50:
        return "High Flight Risk", "severity-high", "▲", "#DC2626"
    elif p_churn >= threshold:
        return "Elevated Triage Risk", "severity-medium", "◆", "#D97706"
    else:
        return "Low Churn Risk", "severity-low", "●", "#059669"


# ---------------------------------------------------------------------------
# Session state initialization
# ---------------------------------------------------------------------------
if "prediction" not in st.session_state:
    st.session_state.prediction = None
if "counterfactual" not in st.session_state:
    st.session_state.counterfactual = None
if "selected_preset" not in st.session_state:
    st.session_state.selected_preset = "at_risk"

# ---------------------------------------------------------------------------
# TOP HEADER BAR
# ---------------------------------------------------------------------------
api_status_html = ""
model_version_html = ""

try:
    health_resp = requests.get(f"{API_URL}/health", timeout=1.5)
    if health_resp.status_code == 200:
        health_data = health_resp.json()
        api_status_html = '<span class="status-pill status-pill-ready">● API Ready</span>'
        mv = health_data.get("model_version", "")
        if mv:
            short_v = mv[:14] + "…" if len(mv) > 14 else mv
            model_version_html = f'<span class="status-pill status-pill-version" title="{mv}">Model: v{short_v}</span>'
    else:
        api_status_html = '<span class="status-pill status-pill-degraded">◆ API Degraded</span>'
except Exception:
    api_status_html = '<span class="status-pill status-pill-offline">▲ API Offline</span>'

st.markdown(
    f"""
    <div class="brand-header">
        <div class="brand-logo-title">
            <div class="brand-icon">⚡</div>
            <div>
                <h1 class="brand-title">RetentionAI</h1>
                <p class="brand-subtitle">Churn-prioritisation decision support for a constrained call budget</p>
            </div>
        </div>
        <div class="status-pill-group">
            {api_status_html}
            {model_version_html}
        </div>
    </div>
    <p class="disclosure-text">
        Portfolio demonstration. Estimates churn propensity — not retention-offer uplift or causal impact.
    </p>
    """,
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# MAIN WORKSPACE — Two-column assessment
# ---------------------------------------------------------------------------
col_input, col_result = st.columns([0.36, 0.64], gap="large")

# ===========================================================================
# LEFT COLUMN: 1. Select a customer
# ===========================================================================
with col_input:
    st.markdown('<div class="section-tag">1. Select a customer profile</div>', unsafe_allow_html=True)

    # Render interactive preset archetype cards
    for key, preset in PRESETS.items():
        is_active = st.session_state.selected_preset == key
        active_cls = " preset-box-active" if is_active else ""
        tags_html = "".join(f'<span class="param-chip">{t}</span>' for t in preset["quick_tags"])

        st.markdown(
            f"""
            <div class="preset-box{active_cls}">
                <div class="preset-header-row">
                    <span class="preset-name">{preset["label"]}</span>
                    <span class="preset-badge {preset['badge_class']}">{preset["badge"]}</span>
                </div>
                <p class="preset-description">{preset["desc"]}</p>
                <div class="preset-tags">{tags_html}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        btn_label = "Active Profile" if is_active else f"Load Profile"
        if st.button(
            btn_label,
            key=f"btn_preset_{key}",
            disabled=is_active,
            use_container_width=True,
        ):
            st.session_state.selected_preset = key
            st.session_state.prediction = None
            st.session_state.counterfactual = None
            # Clear stored form widget keys to reload active preset defaults
            _widget_keys = [
                "tenure", "monthly", "total", "contract", "pm",
                "paperless", "internet", "sec", "bkp", "dev", "tech",
                "stv", "smv", "phone", "mult", "gender", "senior",
                "partner", "deps",
            ]
            for wk in _widget_keys:
                st.session_state.pop(wk, None)
            st.rerun()

    preset_data = PRESETS[st.session_state.selected_preset]["data"]

    # Trait quick glance summary
    st.markdown(
        f"""
        <div class="trait-strip">
            <span class="trait-item">👤 {preset_data['gender']}</span>
            <span class="trait-item">💳 {preset_data['PaymentMethod']}</span>
            <span class="trait-item">📄 Paperless: {preset_data['PaperlessBilling']}</span>
            <span class="trait-item">🛡️ Security: {preset_data['OnlineSecurity']}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Collapsible edit fields
    with st.expander("Customize customer attributes", expanded=False):
        st.markdown("**Account & Billing**")
        tenure = st.number_input(
            "Tenure (months)", min_value=0, max_value=100,
            value=preset_data["tenure"], key="tenure",
        )
        monthly_charges = st.number_input(
            "Monthly charges ($)", min_value=0.0,
            value=float(preset_data["MonthlyCharges"]), key="monthly",
        )
        total_charges = st.number_input(
            "Total charges ($)", min_value=0.0,
            value=float(preset_data["TotalCharges"]), key="total",
        )

        contract_opts = ["Month-to-month", "One year", "Two year"]
        contract = st.selectbox(
            "Contract commitment", contract_opts,
            index=contract_opts.index(preset_data["Contract"]), key="contract",
        )
        pm_opts = [
            "Electronic check", "Mailed check",
            "Bank transfer (automatic)", "Credit card (automatic)",
        ]
        payment_method = st.selectbox(
            "Payment method", pm_opts,
            index=pm_opts.index(preset_data["PaymentMethod"]), key="pm",
        )
        paperless_billing = st.selectbox(
            "Paperless billing", ["Yes", "No"],
            index=["Yes", "No"].index(preset_data["PaperlessBilling"]), key="paperless",
        )

        st.markdown("**Services Ecosystem**")
        net_opts = ["DSL", "Fiber optic", "No"]
        internet_service = st.selectbox(
            "Internet service", net_opts,
            index=net_opts.index(preset_data["InternetService"]), key="internet",
        )
        addon_opts = _internet_addon_options(internet_service)

        def _addon_idx(f_name: str) -> int:
            val = preset_data.get(f_name, "No")
            return addon_opts.index(val) if val in addon_opts else 0

        online_security = st.selectbox("Online security", addon_opts, index=_addon_idx("OnlineSecurity"), key="sec")
        online_backup = st.selectbox("Online backup", addon_opts, index=_addon_idx("OnlineBackup"), key="bkp")
        device_protection = st.selectbox("Device protection", addon_opts, index=_addon_idx("DeviceProtection"), key="dev")
        tech_support = st.selectbox("Tech support", addon_opts, index=_addon_idx("TechSupport"), key="tech")
        streaming_tv = st.selectbox("Streaming TV", addon_opts, index=_addon_idx("StreamingTV"), key="stv")
        streaming_movies = st.selectbox("Streaming movies", addon_opts, index=_addon_idx("StreamingMovies"), key="smv")

        phone_opts = ["Yes", "No"]
        phone_service = st.selectbox(
            "Phone service", phone_opts,
            index=phone_opts.index(preset_data["PhoneService"]), key="phone",
        )
        mult_opts = _phone_addon_options(phone_service)
        mult_idx = mult_opts.index(preset_data["MultipleLines"]) if preset_data["MultipleLines"] in mult_opts else 0
        multiple_lines = st.selectbox("Multiple lines", mult_opts, index=mult_idx, key="mult")

        st.markdown("**Demographics**")
        gender_opts = ["Female", "Male"]
        gender = st.selectbox("Gender", gender_opts, index=gender_opts.index(preset_data["gender"]), key="gender")
        senior_citizen = st.selectbox("Senior citizen", [0, 1], index=preset_data["SeniorCitizen"], key="senior")
        partner = st.selectbox("Partner", ["Yes", "No"], index=["Yes", "No"].index(preset_data["Partner"]), key="partner")
        dependents = st.selectbox("Dependents", ["Yes", "No"], index=["Yes", "No"].index(preset_data["Dependents"]), key="deps")

    # Primary Assessment Trigger
    predict_clicked = st.button("Assess churn risk", type="primary", use_container_width=True)

# ---- Execute Inference API Call ----
if predict_clicked:
    payload = {
        "tenure": tenure, "MonthlyCharges": monthly_charges,
        "TotalCharges": total_charges, "SeniorCitizen": senior_citizen,
        "Contract": contract, "InternetService": internet_service,
        "OnlineSecurity": online_security, "OnlineBackup": online_backup,
        "DeviceProtection": device_protection, "TechSupport": tech_support,
        "StreamingTV": streaming_tv, "StreamingMovies": streaming_movies,
        "PaymentMethod": payment_method, "gender": gender,
        "Partner": partner, "Dependents": dependents,
        "PhoneService": phone_service, "MultipleLines": multiple_lines,
        "PaperlessBilling": paperless_billing,
    }
    try:
        with st.spinner("Executing calibrated inference & conformal coverage check…"):
            response = requests.post(f"{API_URL}/predict", json=payload, timeout=10)
            response.raise_for_status()
            st.session_state.prediction = response.json()
            st.session_state.counterfactual = None
    except requests.exceptions.RequestException as e:
        st.error(f"Could not reach the RetentionAI API at {API_URL}: {e}")
        st.session_state.prediction = None

prediction = st.session_state.prediction

# ===========================================================================
# RIGHT COLUMN: 2. Review recommendation
# ===========================================================================
with col_result:
    st.markdown('<div class="section-tag">2. Review recommendation</div>', unsafe_allow_html=True)

    if prediction is not None:
        p_churn = prediction["calibrated_churn_probability"]
        pred_set = prediction["conformal_prediction_set"]
        recommended_arm = prediction["recommended_arm"]
        request_id = prediction["request_id"]

        severity_label, severity_class, severity_icon, bar_color = _risk_severity(p_churn, COST_THRESHOLD)
        set_str = "{" + ", ".join(map(str, sorted(pred_set))) + "}"
        is_single_class = len(pred_set) == 1

        # ---- TOP 3-TILE EXECUTIVE SCORECARD ----
        st.markdown(
            f"""
            <div class="metric-grid">
                <div class="metric-tile">
                    <p class="metric-tile-title">Calibrated Churn Score</p>
                    <p class="metric-tile-number">{p_churn:.1%}</p>
                    <span class="severity-pill {severity_class}">{severity_icon} {severity_label}</span>
                    <div class="risk-bar-container" title="Score: {p_churn:.1%} | Cutoff: {COST_THRESHOLD:.1%}">
                        <div class="risk-bar-fill" style="width: {min(100, max(4, p_churn * 100))}%; background: {bar_color};"></div>
                        <div class="risk-threshold-marker" style="left: {COST_THRESHOLD * 100}%;" title="Decision Boundary ({COST_THRESHOLD:.1%})"></div>
                    </div>
                    <p class="metric-tile-sub">Boundary: {COST_THRESHOLD:.1%} cost threshold</p>
                </div>
                <div class="metric-tile">
                    <p class="metric-tile-title">Conformal Uncertainty (95%)</p>
                    <p class="metric-tile-number" style="font-family: 'JetBrains Mono', monospace; font-size: 1.7rem;">{set_str}</p>
                    <span class="severity-pill {'severity-low' if is_single_class else 'severity-medium'}">
                        {'● Single-Class Certainty' if is_single_class else '◆ Dual-Class Ambiguity'}
                    </span>
                    <p class="metric-tile-sub" style="margin-top: 14px;">
                        {'Guaranteed class-conditional coverage' if is_single_class else 'Diagnostic review recommended before action'}
                    </p>
                </div>
                <div class="metric-tile">
                    <p class="metric-tile-title">Retention Action & Arm</p>
                    <div style="margin: 4px 0 8px 0;">
                        <span class="arm-pill">🏷️ {recommended_arm.replace('_', ' ').title()}</span>
                    </div>
                    <span class="severity-pill {'severity-high' if p_churn >= COST_THRESHOLD else 'severity-low'}">
                        {'⚡ Priority Triage Flag' if p_churn >= COST_THRESHOLD else '✓ Standard Monitoring'}
                    </span>
                    <p class="metric-tile-sub" style="margin-top: 14px;">
                        Assigned via Thompson Sampling exploration
                    </p>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # ---- DECISION ECONOMICS & STRATEGY CONTEXT ----
        if p_churn >= COST_THRESHOLD:
            context_narrative = (
                f"This customer's estimated churn propensity is <strong>{p_churn:.1%}</strong>, which exceeds the "
                f"cost-sensitive triage threshold (<strong>{COST_THRESHOLD:.1%}</strong>). Given an intervention cost "
                f"of ~<strong>$70</strong> versus ~<strong>$840</strong> in annual customer lifetime value, "
                f"prioritizing this customer for outreach yields positive expected retention ROI. "
                f"A human specialist or validated retention policy should review the recommended "
                f"<strong>{recommended_arm.title()}</strong> offer."
            )
        else:
            context_narrative = (
                f"This customer's estimated churn propensity is <strong>{p_churn:.1%}</strong>, remaining below the "
                f"economic triage cutoff (<strong>{COST_THRESHOLD:.1%}</strong>). Under a constrained call-center budget, "
                f"proactive retention outreach is not prioritized for this profile."
            )

        st.markdown(
            f"""
            <div class="context-box">
                {context_narrative}
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.caption(f"Traceability ID: `{request_id}` (policy arm-matched outcome tracking active for this prediction).")

        # ---- ACTIONABLE SCENARIO (COUNTERFACTUAL) ----
        with st.expander("Explore feasible scenario levers (Counterfactual search)", expanded=True):
            st.caption(
                "Searches actionable levers (Contract Commitment, Online Security, Tech Support) for the smallest "
                "normalized shift that moves this score below the triage cutoff. This is a model-consistent scenario, "
                "not proof of causal offer impact."
            )

            cf_btn = st.button("Check for a scenario", key="cf_btn")
            if cf_btn:
                result = None
                with st.spinner("Evaluating actionable parameter grid…"):
                    for _ in range(25):
                        try:
                            cf_resp = requests.get(
                                f"{API_URL}/counterfactual/{request_id}", timeout=3,
                            )
                            payload = cf_resp.json()
                            if payload.get("status") == "ready":
                                result = payload
                                break
                        except Exception:
                            pass
                        time.sleep(0.2)
                st.session_state.counterfactual = result

            cf = st.session_state.counterfactual
            if cf is not None:
                if cf.get("raw_changes"):
                    st.markdown("**Identified model-consistent levers:**")
                    for feat, new_val in cf["raw_changes"].items():
                        st.markdown(
                            f"""
                            <div class="lever-card">
                                <span class="lever-label">Upgrade {feat}</span>
                                <span class="lever-change">→ {new_val}</span>
                            </div>
                            """,
                            unsafe_allow_html=True,
                        )
                    st.caption("Association-based scenario only; does not guarantee that altering these features causes retention.")
                elif cf.get("flippable"):
                    st.info("Customer is already classified below the triage boundary — zero feature alterations required.")
                else:
                    st.warning("No actionable parameter permutation within operational constraints flips this score. Route for qualitative review.")

    else:
        # Crisp, welcoming executive empty state
        st.markdown(
            """
            <div class="exec-card" style="text-align: center; padding: 48px 24px;">
                <div style="font-size: 2rem; margin-bottom: 8px;">📊</div>
                <h3 style="font-size: 1.15rem; font-weight: 700; color: #0F172A; margin: 0 0 6px 0;">Decision Cockpit Ready</h3>
                <p style="color: #64748B; font-size: 0.88rem; max-width: 480px; margin: 0 auto 16px auto; line-height: 1.45;">
                    Select an archetypal profile on the left or customize customer traits, then click
                    <strong>Assess churn risk</strong> to view calibrated probability scores, conformal prediction sets, and economic triage decisions.
                </p>
                <div style="display: inline-flex; gap: 8px; font-size: 0.76rem; color: #475569; background: #F1F5F9; padding: 6px 14px; border-radius: 9999px;">
                    <span>✓ Calibrated Inference</span>
                    <span>•</span>
                    <span>✓ Mondrian Conformal Coverage</span>
                    <span>•</span>
                    <span>✓ Cost-Sensitive Triage</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

# ---------------------------------------------------------------------------
# EVIDENCE & METHODOLOGY (Expandable secondary navigation)
# ---------------------------------------------------------------------------
st.markdown("<hr style='border:none; border-top:1px solid #E2E8F0; margin: 28px 0 16px 0;'>", unsafe_allow_html=True)

with st.expander("Evidence & methodology", expanded=False):
    tab_model, tab_design, tab_policy, tab_monitor = st.tabs([
        "Model card", "System design", "Experimental policy", "Monitoring",
    ])

    # ---- TAB 1: MODEL CARD & RELEASE EVIDENCE ----
    with tab_model:
        st.markdown("#### Versioned holdout release evidence")
        st.caption(
            "Fetched directly from the serving model artifact. Holdout data was completely disjoint from "
            "model fitting, isotonic calibration, and conformal-threshold fitting (ADR-017)."
        )
        try:
            ev_resp = requests.get(f"{API_URL}/model-card", timeout=3)
            ev_resp.raise_for_status()
            card = ev_resp.json()
            evaluation = card["evaluation"]

            if evaluation.get("status") == "not_available":
                st.warning("Serving artifact has no co-versioned holdout report. Retrain model to generate validation artifacts.")
            else:
                ranking = evaluation["ranking"]
                calibration = evaluation["calibration"]
                conformal = evaluation["conformal"]
                ci_low, ci_high = ranking["pr_auc_95pct_bootstrap_ci"]

                e1, e2, e3, e4 = st.columns(4)
                e1.metric("Serving version", card["model_version"])
                e2.metric(
                    "Holdout PR-AUC",
                    f"{ranking['pr_auc']:.3f}",
                    f"95% CI [{ci_low:.3f}, {ci_high:.3f}]",
                )
                e3.metric(
                    f"Precision@{ranking['decision_k']}",
                    f"{ranking['precision_at_k']:.1%}",
                )
                e4.metric("Brier score", f"{calibration['brier_score']:.3f}")

                cov_rows = [
                    {"Class label": "No churn (0)" if k == "0" else "Churn (1)", **v}
                    for k, v in conformal["class_conditional_coverage"].items()
                ]
                left_mc, right_mc = st.columns(2)
                with left_mc:
                    st.markdown("**Conformal coverage guarantees**")
                    st.dataframe(pd.DataFrame(cov_rows), use_container_width=True, hide_index=True)
                    st.caption(
                        f"Target coverage: {conformal['target_coverage']:.0%}; "
                        f"average set size: {conformal['average_prediction_set_size']:.2f}."
                    )
                with right_mc:
                    st.markdown("**Disjoint evaluation splits**")
                    st.dataframe(pd.DataFrame([evaluation["split_counts"]]), use_container_width=True, hide_index=True)
                    st.caption(f"10-bin Expected Calibration Error (ECE): {calibration['ece_10_bins']:.3f}")

                if evaluation.get("slices"):
                    st.markdown("**Diagnostic demographic performance slices**")
                    slice_rows = [
                        {"feature": feat, **row}
                        for feat, rows in evaluation["slices"].items()
                        for row in rows
                    ]
                    if slice_rows:
                        st.dataframe(pd.DataFrame(slice_rows), use_container_width=True, hide_index=True)
                st.info("Diagnostic slices quantify subgroup performance; they do not establish causal treatment fairness or uplift.")
        except (requests.exceptions.RequestException, KeyError, TypeError, ValueError) as exc:
            st.info(f"Release evidence endpoint is currently unavailable: {exc}")

    # ---- TAB 2: SYSTEM DESIGN & ADRs ----
    with tab_design:
        st.markdown("#### 14-Stage ML engineering lifecycle & Architecture Decision Records")
        stages_df = pd.DataFrame([
            {"Stage": "1",  "Module": "Business framing & success metrics",     "Decision": "ADR-001, ADR-002", "Verdict": "PR-AUC & Precision@K with cost-sensitive threshold"},
            {"Stage": "2",  "Module": "Reproducible extraction",                "Decision": "ADR-003",          "Verdict": "Gitignored data + automated Kaggle pull"},
            {"Stage": "3",  "Module": "Data understanding",                     "Decision": "ADR-004",          "Verdict": "Identified structural 'No internet service' categories"},
            {"Stage": "4",  "Module": "Hypothesis-driven EDA",                  "Decision": "ADR-005",          "Verdict": "Confirmed contract length & tenure as primary drivers"},
            {"Stage": "5",  "Module": "Feature engineering & IV scoring",       "Decision": "ADR-006",          "Verdict": "Rejected TotalAddOnServices; kept ContractCommitment"},
            {"Stage": "6",  "Module": "Leakage-safe pipeline & VIF",            "Decision": "ADR-007",          "Verdict": "Fit on train only; iterative multicollinearity elimination"},
            {"Stage": "7",  "Module": "Baseline model",                         "Decision": "ADR-008",          "Verdict": "Logistic Regression benchmark (PR-AUC 0.6331)"},
            {"Stage": "8",  "Module": "Champion model selection",               "Decision": "ADR-009",          "Verdict": "XGBoost confirmed champion (PR-AUC 0.6466, Precision@100 0.810)"},
            {"Stage": "9",  "Module": "Calibration & conformal prediction",     "Decision": "ADR-010",          "Verdict": "Isotonic regression + Mondrian class-conditional sets"},
            {"Stage": "10", "Module": "Survival analysis",                      "Decision": "ADR-011",          "Verdict": "Cox Proportional Hazards time-to-churn dynamics"},
            {"Stage": "11", "Module": "Thompson Sampling multi-arm bandit",     "Decision": "ADR-012",          "Verdict": "Bayesian online exploration vs exploitation"},
            {"Stage": "12a","Module": "Counterfactual explanations",            "Decision": "ADR-013",          "Verdict": "Exact brute-force search over actionable upgrades"},
            {"Stage": "12b","Module": "Production FastAPI service",             "Decision": "ADR-014",          "Verdict": "Unified asynchronous inference & attribution service"},
            {"Stage": "12c","Module": "Containerisation & monitoring",          "Decision": "ADR-015",          "Verdict": "Docker Compose + PSI/KS drift governance"},
            {"Stage": "13", "Module": "SHAP global & local interpretability",   "Decision": "ADR-016",          "Verdict": "TreeExplainer exact Shapley value additivity"},
            {"Stage": "14", "Module": "Production hardening & system integrity","Decision": "ADR-017",          "Verdict": "Disjoint 3-way split, artifact persistence, schema validation"},
        ])
        st.dataframe(stages_df, use_container_width=True, hide_index=True)

    # ---- TAB 3: EXPERIMENTAL POLICY (BANDIT) ----
    with tab_policy:
        st.markdown("#### Thompson Sampling Bayesian policy mechanism")

        st.markdown(
            """
            <div class="demo-banner">
                <strong>Simulation mechanism notice:</strong> These controls demonstrate the Bayesian Thompson Sampling
                closed-loop update mechanics. In production, outcomes arrive 30–90 days later via authenticated billing
                webhooks. This is a mechanism demonstration and does not prove causal offer efficacy.
            </div>
            """,
            unsafe_allow_html=True,
        )

        try:
            post_resp = requests.get(f"{API_URL}/bandit/posteriors", timeout=3)
            post_resp.raise_for_status()
            arms_data = post_resp.json()["arms"]

            from scipy import stats as sp_stats

            x_vals = np.linspace(0.001, 0.999, 300)
            display_map = {
                "discount":   ("Discount Offer",   "#2563EB"),
                "technician": ("Technician Visit", "#0891B2"),
                "control":    ("Control Success",  "#64748B"),
            }
            fig_beta = go.Figure()
            for arm in arms_data:
                label, color = display_map.get(arm["arm"], (arm["arm"], "#64748B"))
                a, b = arm["alpha"], arm["beta"]
                fig_beta.add_trace(go.Scatter(
                    x=x_vals,
                    y=sp_stats.beta.pdf(x_vals, a, b),
                    mode="lines",
                    name=f"{label} (α={a:.0f}, β={b:.0f}; n={arm['n_observations']})",
                    line=dict(color=color, width=2.5),
                    fill="tozeroy",
                ))
            fig_beta.update_layout(
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="#FFFFFF",
                font={"color": "#0F172A", "family": "Inter"},
                xaxis=dict(title="Bernoulli reward probability", gridcolor="#F1F5F9"),
                yaxis=dict(title="Density", gridcolor="#F1F5F9"),
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                height=320,
                margin=dict(l=40, r=20, t=20, b=40),
            )
            st.plotly_chart(fig_beta, use_container_width=True)
            st.caption("Beta(1, 1) indicates uninformative prior (0 observations). Posteriors update atomically upon outcome recording.")
        except (requests.exceptions.RequestException, KeyError, TypeError, ValueError) as exc:
            st.info(f"Bandit posteriors endpoint unavailable: {exc}")

        # Simulated outcome recorder
        if prediction is not None:
            st.markdown("---")
            st.markdown("**Simulate delayed outcome for current prediction**")
            st.caption(f"Request ID: `{prediction['request_id']}` | Assigned policy arm: **{prediction['recommended_arm'].title()}**")
            fb1, fb2 = st.columns(2)
            if fb1.button("Retained", key="fb_yes", use_container_width=True):
                fb_payload = {"request_id": prediction["request_id"], "retained": True}
                try:
                    resp = requests.post(
                        f"{API_URL}/feedback/{prediction['recommended_arm']}",
                        json=fb_payload, timeout=5,
                    )
                    if resp.status_code == 409:
                        st.warning("Feedback already recorded for this prediction (idempotency protection active).")
                    else:
                        resp.raise_for_status()
                        st.success(f"Feedback recorded for arm '{prediction['recommended_arm']}'. Posterior updated.")
                except Exception as e:
                    st.error(f"Error recording feedback: {e}")

            if fb2.button("Churned", key="fb_no", use_container_width=True):
                fb_payload = {"request_id": prediction["request_id"], "retained": False}
                try:
                    resp = requests.post(
                        f"{API_URL}/feedback/{prediction['recommended_arm']}",
                        json=fb_payload, timeout=5,
                    )
                    if resp.status_code == 409:
                        st.warning("Feedback already recorded for this prediction (idempotency protection active).")
                    else:
                        resp.raise_for_status()
                        st.info(f"Feedback recorded for arm '{prediction['recommended_arm']}'. Posterior adjusted.")
                except Exception as e:
                    st.error(f"Error recording feedback: {e}")

    # ---- TAB 4: MONITORING & DRIFT GOVERNANCE ----
    with tab_monitor:
        st.markdown("#### Output score distribution drift governance")
        st.markdown(
            "Monitors model prediction distribution against the calibration reference baseline using paired "
            "Population Stability Index (PSI) and 2-Sample Kolmogorov-Smirnov (KS) hypothesis tests."
        )

        if st.button("Run drift check", type="primary", key="drift_btn"):
            try:
                d_resp = requests.get(f"{API_URL}/monitoring/drift", timeout=5).json()
                if d_resp.get("status") == "ok":
                    m1, m2, m3 = st.columns(3)
                    m1.metric("Recent inference sample", d_resp["n_recent_predictions"])
                    m2.metric("Population Stability Index (PSI)", f"{d_resp['psi']:.4f}", d_resp["psi_interpretation"])
                    m3.metric(
                        "Two-Sample KS p-value",
                        f"{d_resp['ks_p_value']:.4f}",
                        "Drift Detected" if d_resp["ks_drift_detected"] else "Stable Distribution",
                    )
                else:
                    st.info(
                        f"Monitoring status: {d_resp.get('status')} "
                        f"({d_resp.get('n_recent_predictions', 0)} / "
                        f"{d_resp.get('minimum_required', 30)} minimum samples required for stable testing)"
                    )
            except Exception as e:
                st.error(f"Could not connect to drift monitoring endpoint: {e}")
