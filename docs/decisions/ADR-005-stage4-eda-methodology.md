# ADR-005: Stage 4 EDA — Methodology Decisions

**Date:** 2026-07-12
**Status:** Accepted

## Context
Stage 4 is where it's easiest to accidentally slide into HARKing — finding a
pattern in a plot and retroactively inventing a business reason for it. A
few concrete methodology choices were made to keep this stage honest.

## Decision Point 1 — Hypotheses written before any plot, not after
**Options considered:** (a) explore freely, then explain whatever patterns
turn up; (b) write domain-driven hypotheses first, then test each one
specifically.
**Decision:** (b).
**Reasoning:** Option (a) is how HARKing happens — a plot suggests a story,
and the story gets written as if it were predicted in advance. Writing the
five hypotheses (H1-H5) before running a single cell means each result is a
genuine confirm/contradict, not a retrofit. H2 and H5 coming out
unconfirmed is direct evidence this actually worked as intended — a rigged
walkthrough would have confirmed everything.

## Decision Point 2 — Fix the correlation heatmap to include the encoded target
**Options considered:** (a) reuse the reference notebook's approach
(`select_dtypes(include='number')` before encoding Churn); (b) encode
`Churn` to `Churn_numeric` first, specifically so the target appears in the
correlation matrix.
**Decision:** (b).
**Reasoning:** The reference notebook's heatmap technically ran without
error but silently excluded the one relationship most worth checking — the
target's correlation with everything else. A correlation matrix that leaves
out the target isn't wrong, exactly, it's just answering a smaller question
than it appears to.

## Decision Point 3 — Exclude "No internet service" customers from the add-on analysis
**Options considered:** (a) include all customers when comparing churn rate
by TechSupport/OnlineSecurity; (b) restrict to customers who have internet
service at all.
**Decision:** (b).
**Reasoning:** For customers with `InternetService == "No"`, these columns
read `"No internet service"` — a structural non-answer (confirmed in Stage
3), not a real "No." Including them would silently compare "has the add-on"
vs. "doesn't have internet at all," which isn't the comparison H2 is
actually about.

## Decision Point 4 — Bucket tenure instead of using it only as a raw correlation
**Options considered:** (a) rely solely on the tenure-Churn correlation
coefficient; (b) also bucket tenure into ranges and compare churn rate per
bucket.
**Decision:** (b), in addition to (a).
**Reasoning:** A single correlation number can hide a non-linear
relationship — churn risk might drop sharply in the first year and then
flatten, which a linear correlation coefficient alone wouldn't reveal.
Bucketing surfaces the shape of the relationship, which matters later for
deciding whether tenure needs a transformation before modeling.

## Decision Point 5 — No modeling or feature-engineering decisions made in this notebook
**Options considered:** (a) act on findings immediately (e.g., drop columns
that look uninformative, engineer new features from what looks promising);
(b) record findings only, defer all pipeline decisions to their own stage.
**Decision:** (b).
**Reasoning:** This is the same discipline as ADR-000 and ADR-002 — an EDA
finding is an input to a later, separately-justified decision, not a
decision by itself. The six-column multicollinearity risk flagged in Stage
3 is *not* re-litigated or acted on here; it waits for an actual VIF check.

## Trade-offs / What This Costs
- Running on synthetic data means H1, H3, and H4 are partly circular — they
  were built into the generator's churn formula, so "confirming" them here
  is weaker evidence than confirming them on the real dataset.

## What Would Change My Mind
Once this notebook is re-run on the real Kaggle CSV, any hypothesis that
flips direction or drops to near-zero effect should be treated as the more
trustworthy result — the real data overrides the synthetic run every time,
not the other way around.
