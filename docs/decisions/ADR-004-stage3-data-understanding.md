# ADR-004: Stage 3 Data Understanding — Cleaning and Structural Decisions

**Date:** 2026-07-12
**Status:** Accepted

## Context
Before EDA, the raw dataset needed a grain check, a real look at the target,
a dtype audit, and a decision on the one real data-quality issue
(`TotalCharges`) — without yet making any modeling or feature-engineering
decisions, which belong to later stages.

## Decision Point 1 — Fill missing TotalCharges with 0, not the column mean
**Options considered:** (a) drop the 11 affected rows; (b) impute with the
column mean; (c) impute with 0.
**Decision:** (c).
**Reasoning:** Every affected row has `tenure == 0` — these are brand-new
customers who genuinely have not been billed yet. Their TotalCharges isn't
unknown, it's exactly $0. The mean is the right tool when a value is truly
unknown and needs a reasonable estimate; here the true value is already
known, so using the mean would inject a false ~$2000 charge onto customers
who have paid nothing, biasing the column for no reason. Dropping the rows
would also be wrong — losing 11 real customers to avoid a one-line fix.

## Decision Point 2 — Treat `"No internet service"` / `"No phone service"` as structural, not missing
**Options considered:** (a) treat these as a missing-data problem needing
imputation; (b) treat them as a real, determined category, verified against
`InternetService` / `PhoneService`.
**Decision:** (b).
**Reasoning:** Crosstabs confirm these values appear if and only if the
customer lacks the parent service — verified empirically, not assumed. They
carry real information (which customers have no internet at all) and should
never be imputed away.

## Decision Point 3 — Leave the SeniorCitizen 0/1 vs. Yes/No inconsistency unfixed for now
**Options considered:** (a) fix it immediately upon noticing it; (b) document
it now, fix it later as part of a single, deliberate encoding pass across
all categorical columns.
**Decision:** (b).
**Reasoning:** Ad hoc fixes the moment an inconsistency is spotted lead to
scattered, undocumented transformations. Encoding belongs to the modeling
pipeline stage, where every categorical column gets handled the same way,
in one place, as one logged decision — not patched piecemeal through the
notebook history.

## Trade-offs / What This Costs
- The dataset still contains an inconsistent binary encoding until Stage 6 —
  anyone reading this notebook alone, without the later pipeline stage,
  will see the inconsistency still present.

## What Would Change My Mind
If a real business reason ever required treating "No internet service" as
missing (e.g., the survey process changes and starts recording true
unknowns in that field), this would need to be revisited — the current
decision assumes the current data-collection process, not any process.
