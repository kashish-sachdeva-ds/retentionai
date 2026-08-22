# RetentionAI UI Redesign Brief

## Copy/paste prompt for an implementation LLM

Redesign the Streamlit dashboard in `dashboard/app.py` for **RetentionAI**, a
telecom churn-prioritization portfolio project. The audience is a recruiter,
hiring manager, data scientist, or ML engineer reviewing a portfolio in a
2–5 minute live demo.

Do not change the FastAPI API, model, training code, or business claims.
Keep the dashboard as a Streamlit app that talks to the existing FastAPI
service through `RETENTIONAI_API_URL` (default `http://localhost:8000`). Use
only packages already declared in `pyproject.toml`. Preserve the existing
customer request schema and these API endpoints:

- `GET /health`
- `POST /predict`
- `GET /counterfactual/{request_id}`
- `GET /model-card`
- `GET /bandit/posteriors`
- `POST /feedback/{arm_name}`
- `GET /monitoring/drift`

The dashboard must be an honest **decision-support demonstration**, not a
claim of causal retention optimization or production deployment. It predicts
churn propensity; it does not estimate whether an offer causes retention.

### Product goal

Make the first screen understandable to a non-technical recruiter in under
30 seconds. Make the technical evidence easy to inspect without forcing it
on that recruiter. The primary story is:

> Given a limited retention-team budget, score a customer’s churn risk,
> communicate uncertainty, and provide a feasible next review action.

### Design principles

1. Start with business value, not model names or ML jargon.
2. Show one clear action per screen; use progressive disclosure for detail.
3. Keep a polished, restrained enterprise aesthetic. Avoid glassmorphism,
   excessive gradients, emoji-heavy labels, dense cards, and “AI” hype.
4. Use accessible contrast, concise labels, and color plus text/icon status
   cues. Never rely on red/green alone.
5. Do not show historical notebook metrics as live evidence. Show only the
   versioned `/model-card` response for the artifact currently serving.
6. Clearly label synthetic-mode or unavailable evidence; do not silently
   imply it represents real customer performance.
7. Do not expose feedback controls as though a human demo user is a real
   billing/outcome system. Keep them in a technical section with a warning.

### Information architecture

Use a compact top header and three primary sections. Do not make every
technical capability a top-level navigation item.

```
┌─────────────────────────────────────────────────────────────────────┐
│ RetentionAI                         [API ready] [Model v2026...]    │
│ Churn-prioritization decision support for a constrained call budget │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────┬───────────────────────────────────────┐
│ 1. Select a customer         │ 2. Review recommendation              │
│    - 3 preset profiles       │    Risk, uncertainty, review priority │
│    - optional edit fields    │    Feasible scenario / limitations    │
│    [Assess churn risk]       │                                       │
└─────────────────────────────┴───────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ Evidence & methodology [expandable / secondary navigation]          │
│ Model card | System design | Experimental policy | Monitoring        │
└─────────────────────────────────────────────────────────────────────┘
```

## Screen specifications

### 1. Header (always visible)

- Product name: `RetentionAI`
- Subtitle: `Churn-prioritization decision support for a constrained call budget`
- Right side status chips:
  - API status: `Ready`, `Unavailable`, or `Degraded`
  - Model version, abbreviated but with full version available in a tooltip
- Small disclosure below the header:
  `Portfolio demonstration. Estimates churn propensity—not retention-offer uplift or causal impact.`

Do not use a large hero illustration or marketing headline.

### 2. Main page: Customer assessment

This is the default page and must carry the entire 2-minute demo.

#### Left panel: customer input

Use three selectable preset cards at the top:

- `At-risk new customer` — short tenure, month-to-month, fibre, few support add-ons
- `Established customer` — medium tenure, one-year contract
- `Stable long-term customer` — high tenure, two-year contract

Include `Custom profile` as a fourth option. Presets should populate a
collapsible `Edit customer details` form; do not show twenty fields by
default. Group optional fields as:

- Account: tenure, monthly charges, total charges
- Contract and billing: contract, payment method, paperless billing
- Services: phone, internet, relevant dependent add-ons
- Household: senior citizen, partner, dependents, gender

Respect structural dependencies already implemented in the API:

- If internet service is `No`, add-ons must be `No internet service`.
- If phone service is `No`, multiple lines must be `No phone service`.

Primary CTA: `Assess churn risk`.

#### Right panel: recommendation (empty state)

Before prediction, show:

`Select a profile and assess churn risk. The result will show risk, uncertainty, and the next review action.`

#### Right panel: recommendation (after prediction)

Use this order:

1. **Review priority** — the largest element. One of:
   - `Priority review` when probability exceeds the documented illustrative
     economic threshold.
   - `Monitor` otherwise.
   Include the probability, but do not call the threshold a production policy.
2. **Calibrated churn risk** — percentage, labeled `Estimated churn probability`.
3. **Uncertainty** — translate the conformal set:
   - `{1}`: `High confidence: churn risk`
   - `{0}`: `High confidence: no-churn risk`
   - `{0, 1}`: `Uncertain: reviewer judgement warranted`
   Explain in one sentence that this is a prediction-set uncertainty signal.
4. **Assigned experiment arm** — e.g. `Discount`, `Technician support`, or
   `Control`. Label it exactly as an experiment assignment, not a recommended
   treatment. Add: `Illustrative policy mechanism; no causal offer-effect claim.`
5. **Feasible scenario** — retrieve the counterfactual asynchronously.
   - Loading: `Checking feasible contract/support scenarios…`
   - Flippable: show natural-language changes, such as `Upgrade to a one-year
     commitment and add online security.`
   - Not flippable: `No feasible scenario in the limited set changes the
     model decision. Escalate for human review.`
   - Explicitly label it `Model-consistent scenario, not a causal recommendation.`

Use no more than four visual cards. Prefer a simple vertical narrative over
a grid of unrelated metrics.

### 3. Evidence & methodology (secondary)

Use a segmented control, sidebar navigation, or expandable section. These
sections are for technical interviewers, not the default recruiter path.

#### A. Release evidence

Fetch `GET /model-card`. Display the serving `model_version` prominently and
only then show:

- Holdout PR-AUC and its bootstrap interval
- Precision@K and Recall@K, including the exact K
- Brier score and 10-bin ECE
- Holdout split counts: train, calibration, conformal, holdout
- Conformal target and class-conditional empirical coverage
- Average prediction-set size
- Diagnostic slice table, if available

Add this text exactly or equivalently:

`Metrics are attached to the currently serving artifact and computed on a
holdout set disjoint from model fitting, calibration, and conformal-threshold
fitting. Slices are diagnostics, not a fairness certification.`

If `/model-card` returns `status: not_available` or fails, show a warning,
not invented values.

#### B. System design

Use one concise diagram:

```
Telco snapshot → leakage-safe features → XGBoost → calibration + uncertainty
       → versioned artifact → API → decision-support dashboard
```

Below it, show five short proof points, each linking or referring to the
relevant code/ADR:

- Train-only feature fitting prevents leakage.
- Calibration makes probability thresholds interpretable.
- Conformal sets communicate uncertainty.
- Versioned artifacts include integrity checks and data provenance.
- Feedback is attributed and idempotent in Redis.

Do not render a large 14-stage table by default. Put the complete ADR index
behind an expander called `Read architecture decisions`.

#### C. Experimental policy (advanced)

Fetch `GET /bandit/posteriors` and show Beta posterior curves or a compact
table. Include a persistent warning:

`Mechanism demonstration only. The project contains no randomized
retention-outcome data, so this does not demonstrate offer effectiveness.`

Move feedback buttons here. Require a clear demo-only notice before enabling
them. Preserve request-ID attribution and duplicate handling.

#### D. Monitoring (advanced)

Fetch `GET /monitoring/drift` only when the user clicks `Check live score
drift`. Show sample count, PSI, KS p-value, and plain-language status. Explain
that score drift is an early warning and that live calibration requires delayed
ground-truth outcomes.

### Copy rules

Use:

- `Estimated churn probability`, not `AI churn prediction`
- `Assigned experiment arm`, not `recommended offer`
- `Model-consistent scenario`, not `the action that will retain this customer`
- `Release evidence`, not `model performance`
- `Portfolio demonstration`, not `production platform`

Avoid terms in the main screen such as `Mondrian`, `isotonic`, `PSI`, `KS`,
`Thompson Sampling`, `SHAP`, or `counterfactual`. Those may appear in the
advanced sections with short explanations.

## Technical requirements

- Keep all requests timeout-bounded and catch `requests` errors without
  crashing the Streamlit app.
- Preserve `st.session_state` prediction and counterfactual behavior.
- Keep all existing structurally valid preset profiles.
- Do not add external fonts, remote image assets, or new JavaScript.
- Prefer Streamlit-native components and limited CSS; maintain keyboard and
  screen-reader-friendly text.
- Replace deprecated `use_container_width=True` calls with the current
  Streamlit width API where practical.
- Add/update tests in `tests/test_dashboard.py` for: initial empty state,
  prediction result, unavailable API, release-evidence rendering, and the
  technical feedback flow.

## Acceptance criteria

The implementation is complete only when:

1. A recruiter can run one preset prediction without opening a technical tab.
2. The first result screen says what to review, the estimated risk, and its
   uncertainty in plain language.
3. The evidence page never displays hard-coded historical metrics as current
   model evidence.
4. Experimental-policy and monitoring functions are visually secondary and
   clearly labelled as technical/demo capabilities.
5. Synthetic or unavailable model evidence is visibly disclosed.
6. Existing API and dashboard tests pass, plus the new UI-state tests.
7. The layout remains usable at laptop width (about 1280 px) and does not
   require horizontal scrolling.

## Suggested manual demo script

1. Open the `At-risk new customer` preset and click `Assess churn risk`.
2. Explain the review-priority result and the uncertainty cue.
3. Open `Release evidence` and point to the artifact version and disjoint
   holdout protocol.
4. If speaking to an ML interviewer, open `System design` and then the
   experimental-policy disclaimer.
