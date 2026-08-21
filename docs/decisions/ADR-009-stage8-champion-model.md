# ADR-009: Stage 8 Champion Model — XGBoost vs. Logistic Regression

**Date:** 2026-08-09
**Status:** Accepted

## Context
Logistic regression (Stage 7 baseline) and XGBoost trained on identical
data, evaluated with identical scoring functions (`src/modeling/baseline.py`,
shared with Stage 7 specifically so the comparison can't be an artifact of
measurement), at identical K.

## Decision Point 1 — K refined from Stage 7's approximation to ADR-002's real ratio
**Decision:** `K = round(len(X_test) * 500 / 7043)`, replacing Stage 7's
rough "top 20% of the test set."
**Reasoning:** Stage 7 approximated because no model existed yet to
justify the precision of computing it exactly. Now that a real comparison
is happening, there's no reason not to use `ADR-002`'s actual numbers —
roughly 500 calls against the real ~7,043-customer base — rather than a
round approximation. This makes Stage 8's K a different number than
Stage 7's; that's an intentional refinement, not an inconsistency to
paper over.

## Decision Point 2 — Tie-break rule when PR-AUC and Precision@K disagree
**Decision:** if the two metrics disagree on a winner, Precision@K
decides, not PR-AUC.
**Reasoning:** PR-AUC averages ranking quality across every possible
cutoff. The business only ever acts at one cutoff — the fixed call
budget. A model that's a better *average* ranker while being worse
specifically at the cutoff the business actually uses is, in deployment
terms, the worse choice. This doesn't discard `ADR-002` — PR-AUC was the
correct primary metric *before* a concrete K existed, since it didn't
require committing to one. Now that K is fixed and known, the metric
measured at that exact K is more informative than an average that
includes cutoffs the business will never use.
**Result (real data):** the two decision metrics did not disagree.
XGBoost won both PR-AUC (0.6466 vs. 0.6331) and Precision@K
(0.810 vs. 0.780). The tie-break rule therefore was not needed for the
real-data comparison. Recall@K also favored XGBoost (0.217 vs. 0.209).

## Decision Point 3 — Resolving ADR-006's open question on ContractCommitmentMonths
**What happened:** `ADR-006` kept `ContractCommitmentMonths` over raw
`Contract` on structural grounds alone, explicitly stating IV couldn't
judge whether the bet was right and that only a real model comparison
could confirm it.
**Result (synthetic run):** ranked 1st of 13 features in XGBoost
importance (0.171).
**Decision:** treat this as real corroboration of `ADR-006`'s reasoning,
pending the real-data result.
**Result (real data):** `ContractCommitmentMonths` ranked 1st out of 17
features in XGBoost's native feature importance, with an importance score
of 0.287. It therefore remained firmly in the top half of the feature list
and strongly corroborated ADR-006's structural decision to retain the
commitment-duration representation.

## Decision Point 4 — Expected-value ranking deliberately not built here
**Decision:** ranking stays plain probability, not `P(churn) x CLV`.
**Reasoning:** `ADR-002`'s own cost math treats CLV as roughly constant
across customers, so the two rankings coincide for now. Introducing
per-customer CLV weighting at this stage — just because it sounds like a
natural next step — would repeat the exact mistake `ADR-000` describes:
reaching for a more sophisticated technique before the stage that would
actually justify it. No specific finding in this project yet demonstrates
that CLV varies enough, or matters enough, to be worth the added
complexity.

## Trade-offs / What This Costs
- XGBoost, if selected as champion, is less directly interpretable than
  the LR baseline — feature importance shows *what* matters, not signed,
  log-odds-scale *how much and which direction*. Any stakeholder-facing
  explanation would still need the LR coefficients as a supporting
  narrative alongside it, not a replacement for it.
- The K used here is specific to the current ~500-call budget. If that
  budget changes substantially, this comparison needs re-running, not an
  assumption that the same model still wins at a different K.

## What Would Change My Mind
- If the real-data champion differs from the synthetic-run result, that's
  expected and fine — the synthetic run exists only to prove the code
  runs correctly, never to decide the actual champion.
- If `ContractCommitmentMonths` ranks in the bottom half of real-data
  feature importance, `ADR-006`'s structural bet should be recorded as
  not empirically confirmed — logical reasoning that didn't pay off in
  practice, worth stating plainly rather than defending after the fact.
