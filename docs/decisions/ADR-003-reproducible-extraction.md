# ADR-003: Reproducible Data Extraction — Design Decisions

**Date:** 2026-07-11
**Status:** Accepted

> Note: this ADR intentionally bundles several small decisions made together
> in `01_data_extraction.ipynb`, rather than writing one ADR per decision —
> each is minor individually, but together they define what "reproducible
> extraction" actually means for this project.

## Context
Stage 2 required replacing a manual "click download on Kaggle's website"
step with something anyone — including future-me, or CI later — could
re-run and get back the identical dataset. A manual download isn't
reproducible: the honest answer to "how did you get this data" needs to be
a runnable cell, not a memory of clicking a button in a browser once.

---

## Decision Point 1 — Anchor to project root dynamically
**Options considered:** (a) hardcode an absolute path (e.g.
`d:\Important\00-Projects\RetentionAI`); (b) always assume the notebook is
launched from the project root; (c) compute `PROJECT_ROOT` from
`Path.cwd()`, walking up one level if the kernel starts inside `notebooks/`.

**Decision:** (c).

**Reasoning:** A hardcoded absolute path only works on one machine, in one
exact folder location — it breaks the moment anyone else clones the repo,
which is a real reproducibility failure, not a style nitpick. Assuming a
fixed working directory is fragile too, since Jupyter's default cwd depends
on how the notebook was launched. Computing the root relative to the
notebook's own location is the only version that survives being cloned
onto someone else's machine, into a differently-named folder.

## Decision Point 2 — Idempotent download (skip if already present)
**Options considered:** (a) always re-download on every run; (b) check if
the target CSV already exists and skip if so.

**Decision:** (b).

**Reasoning:** A notebook gets re-run constantly — during debugging, after
a fresh clone, in CI later. Always re-downloading wastes time and bandwidth
and makes every re-run depend on Kaggle's servers being up, for zero
benefit once the correct file already exists locally. Skipping when the
file is present is a real idempotency property, not just a speed
optimization — re-running the notebook twice produces the same state as
running it once.

## Decision Point 3 — `check=True` on the subprocess call
**Options considered:** (a) default `check=False`, continue regardless of
exit code; (b) `check=True`, which raises `CalledProcessError` on any
non-zero exit code.

**Decision:** (b).

**Reasoning:** Without `check=True`, a failed Kaggle download (bad
credentials, network failure, rate limit) would silently continue to the
next cell — which would then fail confusingly on a missing file, or worse,
silently reuse a stale file from a previous run with nobody noticing the
fresh download had actually failed. Failing loudly, immediately, at the
exact point of failure beats failing later somewhere unrelated and having
to trace it backward.

## Decision Point 4 — Extract, rename to a stable filename, delete the ZIP
**Options considered:** (a) keep the ZIP and Kaggle's original filename
(`WA_Fn-UseC_-Telco-Customer-Churn.csv`) as-is; (b) extract, rename to a
short stable name (`telco_churn.csv`), delete the ZIP afterward.

**Decision:** (b).

**Reasoning:** Every downstream notebook or script needs one predictable
path to read from — coupling all future code to Kaggle's specific, awkward
default filename creates a single point of fragility if that ever needs to
change. Deleting the ZIP after extraction avoids keeping a redundant
compressed-and-uncompressed copy of the same data sitting in the project
for no reason.

## Decision Point 5 — Exact-shape assert `(7043, 21)`, not a tolerance check
**Options considered:** (a) exact match; (b) range/tolerance check (e.g.
"at least 7000 rows").

**Decision:** (a).

**Reasoning:** This is a static, versioned Kaggle dataset, not a live
production feed — there is exactly one correct shape at any point in time,
so an exact match is the *strongest* available check here, not a brittle
one. (A live, daily-updated source would need a tolerance check instead,
since row count legitimately varies run to run — that's a genuinely
different situation, not the one this project is in.) The assert exists to
fail fast at the extraction stage itself, rather than letting a corrupted
or wrong download silently propagate into EDA, where a shape mismatch
would be far more confusing to debug.

## Decision Point 6 — Credentials via `~/.kaggle/kaggle.json`, never hardcoded
**Options considered:** (a) hardcode the Kaggle API key in the notebook or
a config file; (b) rely on the Kaggle CLI's standard external credentials
file, outside the repo entirely.

**Decision:** (b).

**Reasoning:** A hardcoded key in a notebook is one `git push` away from a
leaked credential — a common, real mistake even in professional repos.
Relying on the external, gitignored credentials file keeps secrets out of
version control by construction, rather than depending on remembering not
to commit them.

## Decision Point 7 — Raw data excluded from git; reproducibility lives in code
**Options considered:** (a) commit the CSV to the repo so it's always
available; (b) `.gitignore` the data directory and regenerate it via the
extraction notebook.

**Decision:** (b).

**Reasoning:** Committing datasets bloats repo size and git history
permanently — even deleting it later doesn't remove it from history — and
it isn't necessary here, since the entire point of Stage 2 was making the
data regenerable on demand. "Reproducible" means anyone can run one
notebook and get the same data back, not that the data itself has to be
checked into version control.

---

## Trade-offs / What This Costs
- Re-running this notebook requires a valid personal Kaggle account and API
  token — the project isn't runnable with zero setup, which is real (if
  standard) friction for anyone trying to reproduce it.
- The exact-shape assert will need manual revisiting if Kaggle's dataset
  owner ever publishes a new version with a different row/column count —
  a deliberate trade of full automation for a hardcoded, currently-correct
  expectation.

## What Would Change My Mind
If this dataset were ever replaced by a live, regularly-updated source (a
real production database or API), Decision Points 2 and 5 would both need
to change: idempotency would need a smarter cache-invalidation rule (e.g.
re-download if the cached file is older than N days), and the assert would
become a tolerance/range check instead of an exact match.
