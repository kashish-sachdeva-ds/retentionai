# ADR-010: Stage 9 Calibration & Mondrian Conformal Prediction

**Date:** 2026-08-09
**Status:** Accepted, with one open issue (see Decision Point 2 update below)

## Context
Stage 8 established ranking quality (XGBoost beats the baseline). This
stage asks a different question: are the champion model's predicted
probabilities themselves trustworthy, not just well-ranked. Also
resolves a real gap: Stage 6 never built a calibration split.

## Decision Point 1 — Carve `calib` out of Stage 8's test set now, not retroactively
**Options considered:** (a) claim a calibration set existed since Stage 6
(it didn't — `run_stage6_split` returns train/test only); (b) split
Stage 8's existing test set into calib+test here, keeping the already-
trained champion model and Stage 8's reported numbers untouched.
**Decision:** (b).
**Reasoning:** Backdating a split that was never actually built would
misrepresent this project's real history — the same discipline this
project has held since `ADR-000`. Splitting Stage 8's test set in half,
rather than re-splitting from scratch, avoids retraining the champion
model and keeps Stage 8's committed PR-AUC/Precision@K numbers as the
official, unchanged record.

## Decision Point 2 — Build conformal prediction from scratch, not from a library
**Decision:** hand-implement nonconformity scoring, per-class thresholds,
and prediction sets (`src/modeling/conformal.py`) rather than using MAPIE
or a similar library.
**Reasoning:** the goal throughout this project has been understanding a
technique well enough to defend it under questioning, not producing a
working artifact by calling a function. A hand-built, tested version
demonstrates the mechanism directly. A library remains a reasonable
choice for hardening this into production later, once the underlying
idea is confirmed solid here.

**Update, real-data run:** this decision point also covers reusing
`calib` for both isotonic calibration fitting and conformal threshold
computation — real data surfaced a likely problem with that specific
choice. Class 1 (churn) empirical coverage came in at 88.2% (n=187)
against a 95% target — roughly 4.2 standard errors below target, too
large to be finite-sample noise. Class 0 held at 98.1% (n=518).

**Leading hypothesis:** isotonic regression can fit its own calibration
sample slightly better than it generalizes to fresh data. Computing
nonconformity scores on `calib` *after* calibrating on that same `calib`
means those scores are optimistically low relative to how the calibrated
model would score genuinely fresh data — producing a threshold that's too
tight. This would hit the minority class hardest, since isotonic has
proportionally less data to fit per unit of flexibility there — consistent
with class 1 being the one that undercovered, and with the resulting
average set size (1.452) being smaller/more "confident" than it should be
given the actual coverage achieved.

**Status:** flagged, not fixed here. The real fix — splitting `calib`
into two disjoint subsets, one for fitting the isotonic calibration and
one for computing nonconformity thresholds — changes a decision this ADR
already made and deserves its own verification pass (does it actually
close the gap?) rather than a silent patch inside this notebook.

## Decision Point 3 — Isotonic regression over Platt scaling
**Decision:** isotonic regression for calibration.
**Reasoning:** Platt (sigmoid) scaling assumes the miscalibration has a
specific sigmoid shape and needs relatively little calibration data — a
reasonable choice for a small calibration set or SVM-style scores.
Isotonic is non-parametric and more flexible, at the cost of needing more
data to avoid overfitting the correction curve itself. The calibration
set here is a genuine few hundred rows, not a few dozen, and tree-based
models don't reliably miscalibrate in the simple shape Platt assumes —
isotonic fits this specific combination of model type and calibration-set
size, chosen for that reason, not by default.

## Decision Point 4 — Confirm the distortion empirically before fixing it
**Decision:** measure raw ECE and mean-predicted-vs-actual churn rate
first, calibrate second, then re-measure — never assume the distortion
is present.
**Reasoning:** same discipline as Stage 5's IV check — assuming a known
failure mode without checking it is a discipline violation, not a
shortcut.
[Fill in once run on real data: raw ECE, calibrated ECE, and whether
calibration meaningfully helped or the raw model was already reasonable.]

**Result (real data):** raw ECE 0.0581, calibrated ECE 0.0472 — a real
but modest 19% reduction, not a dramatic fix. Mean predicted P(churn)
moved from 0.2522 (raw) to 0.2372 (calibrated) against an actual test
churn rate of 0.2652 — calibration corrected in the right direction but
slightly overshot, landing further from the true rate on the low side
than the raw model was on the high side. Worth recording precisely, not
rounding up to "solved."

## Decision Point 5 — Report coverage and set-size efficiency together
**Decision:** never report conformal coverage without average set size
alongside it.
**Reasoning:** a predictor that always outputs both classes trivially
achieves 100% coverage and provides zero decision value. Coverage without
an efficiency number is an incomplete, potentially misleading report of
how useful the predictor actually is.
[Fill in once run on real data: coverage per class, average set size, and
whether either class's coverage landed slightly under the 0.95 target —
expected finite-sample noise, not a bug, but worth stating plainly
either way.]

**Result (real data):** class 0 coverage 0.981 (n=518) — clears target.
Class 1 coverage 0.882 (n=187) — does not clear target, and by enough
margin (~4.2 SE) that this is a real finding, not the "expected noise"
this decision point anticipated. Average set size 1.452 of 2.0. See the
Decision Point 2 update above for the likely cause and recommended fix.

## Decision Point 6 — Connect wide conformal sets to ADR-001's diagnostic call
**Decision:** frame ambiguous (2-class) predictions as the concrete
trigger for when `ADR-001`'s diagnostic call matters most, not as an
isolated statistic.
**Reasoning:** `ADR-001` established that a raw churn flag doesn't say
*why* someone is at risk. A wide conformal set is a direct, model-driven
signal of exactly that situation — the model doesn't have enough
information to justify skipping straight to a specific offer.

## Trade-offs / What This Costs
- The calibration set is roughly half of Stage 8's already-modest test
  set, so both are individually smaller than either alone — a genuine
  cost of not building a 3-way split back in Stage 6, paid now rather
  than never.
- The ADR-002 cost-sensitive threshold and Stage 8's actual budget-based K
  are very likely to disagree sharply (a pure threshold flags far more
  customers than the budget allows) — concrete evidence for why `ADR-002`
  ranked under a fixed budget instead of relying on a threshold alone,
  not a flaw in either number.

## What Would Change My Mind
- Real-data class 1 coverage (88.2%) did fall notably below 0.95, beyond
  ordinary finite-sample noise — the trigger condition below was met.
  Investigated: most likely cause is reusing `calib` for both isotonic
  fitting and conformal thresholds (Decision Point 2 update), not a
  calib/test exchangeability violation — calib and test were drawn via
  the same stratified split and have nearly identical churn rates (0.2656
  vs 0.2652), which argues against a basic distributional mismatch.
- Average set size (1.452) improved substantially versus the earlier
  synthetic-data run (1.913) — consistent with a much larger real
  calibration set (704 rows vs. ~300), as anticipated.

## Follow-up (not yet done)
Split `calib` into two disjoint subsets — one for fitting the isotonic
calibration, one for computing conformal nonconformity thresholds — and
re-check whether class 1 coverage reaches the 0.95 target. This is a
genuine correction to Decision Point 2's original reasoning, not a minor
tweak, and should get its own verification pass before being folded back
into this ADR as settled.
