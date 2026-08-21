# Contributing to RetentionAI

This is a solo portfolio project, so "contributing" mostly means "future
me, or anyone reviewing this, understanding the conventions well enough
to extend it without breaking the discipline the project is built on."

## The one rule that matters more than any other

**No architectural decision ships without an ADR.** Every stage in
`docs/decisions/` follows the same shape: what was decided, why, what it
costs, and what would change the decision. If you're adding a new stage
or materially changing an existing one, write the ADR *before* or
*alongside* the code, not as an afterthought once the code already
works — the ADRs exist to capture reasoning while it's still fresh and
honest, not to retroactively justify a result you already like.

If a notebook produces real numbers, the corresponding ADR gets those
real numbers too — not a `[Fill in once run on real data]` placeholder
left unresolved after the notebook was actually run. Same for any
notebook's own "Interpretation" cells: run first, interpret from the
actual output, not before.

## Commit messages

Roughly [Conventional Commits](https://www.conventionalcommits.org/),
scoped to the part of the codebase touched:

```
feat(explain): add SHAP explanations for the real XGBoost champion
fix(ci): provide synthetic dataset at test path
docs(adr): record Stage 13 SHAP explanation decisions
test: add real pytest suite covering Stages 6-12b
```

Common scopes: `api`, `explain`, `bandit`, `monitoring`, `deploy`, `adr`,
`ci`. Not enforced by tooling — just the convention this history already
follows; keep following it.

## Tests

- One test file per `src/` module: `src/bandit/thompson.py` is tested by
  `tests/test_bandit.py`, `src/survival/cox.py` by
  `tests/test_survival.py`, and so on. Keep the filename matched to what
  it actually tests — a test file that doesn't match its own contents is
  the single easiest thing for a reviewer to catch, and it did happen
  once in this repo's history (since fixed).
- Tests that need Redis assume a real instance on `localhost:6379`, not
  a mock. Locally:
  ```bash
  docker run -d -p 6379:6379 redis:7-alpine
  pip install -r requirements-dev.txt
  python -m pytest tests/ -v
  ```
- `tests/test_dashboard.py` and the live-server tests in `tests/test_api.py`
  spin up a real `uvicorn` server / real Streamlit `AppTest` against that
  real Redis instance — they share `db=0` with your local dev API if you
  have one running, and will reset its bandit/monitoring state as a side
  effect (a known, stated limitation, not a bug).

## Data

Never commit `data/raw/` or `data/processed/` contents (see `ADR-003`).
`scripts/generate_synthetic.py` produces a schema-matching synthetic
stand-in for CI and for anyone without Kaggle credentials — it's not a
substitute for re-running the real notebooks against the real dataset
before trusting any reported number.

## Docker

`docker compose up --build` should bring up Redis, the API, and the
dashboard, in that order, gated on health checks. This is built and
smoke-tested by the `docker-build` job in `.github/workflows/ci-cd.yml`
on every push — if you change either Dockerfile or `docker-compose.yml`,
that job is the real check, not a local "it probably works."
