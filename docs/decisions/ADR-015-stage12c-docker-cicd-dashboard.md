# ADR-015: Stage 12c — Docker, CI/CD, Dashboard, and a Real Test Suite

**Date:** 2026-08-15
**Status:** Accepted

## Context
Final production-layer pieces: Docker images, docker-compose
orchestration, GitHub Actions CI/CD, the Streamlit dashboard, and —
genuinely new to this stage — a real, committed pytest suite and drift
monitoring. Neither of the last two existed anywhere in this project
before this stage; both are built and tested here for the first time,
not "closed gaps" from an earlier stage that never actually built them.

## Decision Point 1 — Build a real test suite now, since none existed
**What happened:** every ADR since Stage 6 has described verification —
"confirmed by hand," "tested directly," "verified against real data" —
but none of that was ever saved as a committed, re-runnable test file.
All of it lived in ad-hoc notebook cells and chat sessions.
**Decision:** wrote a genuine `tests/` directory (60 tests across 11
files) covering every module built since Stage 6, run for real against
this project's actual code — not adapted from a template, not assumed
to pass.
**Reasoning:** a CI pipeline that runs `pytest tests/` against an empty
or nonexistent test directory verifies nothing, regardless of how
correct the workflow YAML is. The tests convert this project's informal
verification history into something that actually runs on every push.
**Two real bugs the test-writing process itself caught:**
- `streamlit.testing.v1.AppTest.from_file()` resolves relative paths
  against the *calling test file's* location, not the working
  directory — `"dashboard/app.py"` silently resolved to
  `tests/dashboard/app.py` and failed with `FileNotFoundError`. Fixed
  with an absolute path computed from the test file's own location.
- None, otherwise — every other module passed its real tests on the
  first run, which is itself informative: the repeated verify-before-
  trust discipline in Stages 6–12b meant there wasn't a backlog of
  hidden bugs waiting to be caught here.

## Decision Point 2 — Build drift monitoring fresh, not as a "closed gap"
**What happened:** an earlier draft of this ADR claimed Stage 12b built
`src/monitoring/drift.py` but never wired it in. That's false — Stage
12b's real `ADR-014` explicitly and deliberately excluded drift
monitoring, stating no monitoring module existed yet.
**Decision:** built `src/monitoring/drift.py` (PSI + KS) genuinely fresh
in this stage, with its own reasoning, and wired it into
`GET /monitoring/drift`.
**Reasoning:** monitoring the model's own output distribution (one
number) rather than every input feature separately is a real, common
first drift signal — simpler to alert on, and it implicitly captures the
combined effect of any input drift.
**A real property discovered while testing it:** at the conventional
p<0.05 threshold, the KS test flags "drift" on live traffic that hasn't
actually changed roughly 5–7% of the time by construction — verified
directly (7/100 trials on genuinely identical distributions). Documented
in the module itself so a single flagged check during real operation
isn't over-interpreted as confirmed drift.

## Decision Point 3 — Hold the same verification bar, name where it can't be met
**Options considered:** (a) write Docker/CI-CD/dashboard code without
being explicit about what could and couldn't be verified; (b) verify
everything possible for real, and state plainly, per-artifact, what
couldn't be.
**Decision:** (b).
**Reasoning:** this project's discipline since `ADR-000` has been "prove
it, don't assert it." Concretely, per artifact:
- **Test suite**: genuinely run, 60/60 passing, against real Redis and
  the real trained champion model — not mocked.
- **Streamlit dashboard**: genuinely tested via `AppTest` against a real
  running `uvicorn` server and real Redis, including the predict button,
  the counterfactual check, the feedback loop, and the API-unreachable
  error path.
- **GitHub Actions CI/CD**: low-risk — it only orchestrates already-
  verified commands on a standard runner. Depends on
  `scripts/generate_synthetic.py` (carried over from this project's
  earliest sandbox testing) to give CI a stand-in dataset, since the
  real Kaggle CSV is gitignored and CI has no Kaggle credentials.
- **Dockerfiles and `docker-compose.yml`**: reviewed carefully, not
  build-tested in this authoring environment (no Docker daemon here) —
  though the developer's own machine now has Docker Desktop running,
  making this the first stage where that gap can actually be closed
  outside this environment, not just written around.

## Decision Point 4 — Remove `test_shap_explainer.py` from the test suite
**What happened:** a `test_shap_explainer.py` file was included alongside
the real reference project's actual test files, testing a SHAP explainer
that was never built anywhere in this project.
**Decision:** excluded entirely, not adapted.
**Reasoning:** consistent with this ADR's own Trade-offs section (below)
— SHAP was never implemented. A test for code that doesn't exist isn't
a test, it's a placeholder that would need deleting or perpetually
skipping either way. Cleaner to simply not include it.

## Trade-offs / What This Costs
- **SHAP was never implemented.** LR coefficients and XGBoost's
  `feature_importances_` cover global interpretability; SHAP would add
  per-prediction attribution neither currently provides. A real future
  addition, not a silent omission — named here rather than left
  unmentioned.
- **Docker images remain unverified for an actual `docker-compose up`
  run** in this authoring environment — a real, stated risk until built
  and run, not a formality. (See Decision Point 3 — this is now
  genuinely testable outside this environment.)
- **The drift endpoint's reference distribution is fixed at API startup**
  and never refreshed — a long-running production service would
  eventually need a policy for updating what "reference" means as the
  customer base evolves, which this version doesn't address.
- **Test suite and the live API dev instance share Redis db=0** in this
  environment. `test_redis_bandit.py` correctly isolates itself on
  db=15; `test_api.py` necessarily uses db=0 to exercise the same state
  `main.py` reads and writes, meaning running the suite resets live dev
  state as a side effect — acceptable for local development, a genuine
  bug risk in a real production environment.

## What Would Change My Mind
- Once Docker images are actually built and run (on the developer's own
  Docker Desktop), any discrepancy from what's written here should be
  corrected in this ADR and the Dockerfiles both — not treated as done
  just because it was written carefully.
- If SHAP explanations become a real priority, they should get their own
  stage and ADR, the same treatment DiCE-style counterfactuals got when
  their gap was caught (`ADR-013`) — not bolted on without the same
  reasoning-first process everything else in this project went through.
