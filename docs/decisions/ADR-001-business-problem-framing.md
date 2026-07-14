# ADR-001: Business Problem Framing — Actionable Churn Only, Not Churn in General

**Date:** 2026-07-11
**Status:** Accepted

## Context
Before touching the dataset, the brief was deliberately kept as vague as a
real business brief would be: a mid-size telecom's VP of Retention says
"we're losing too many customers and it's hurting revenue — help us figure
out who's likely to leave, before they do, so we can act on it." No
spreadsheet, no columns, no EDA — the goal was to reason about what the
*business* needs before letting any pattern in the data quietly shape that
reasoning (a bias worth naming outright: HARKing — hypothesizing after
results are known — which happens when a data pattern you've already seen
shapes a business story you then present as if you thought of it first).

## Options Considered
1. **Reactive, generic retention offer** — give every flagged customer the
   same discount, regardless of why they're at risk.
2. **Diagnostic call first, then a matched intervention** — call the
   customer, find out the actual reason, then respond with whichever tool
   fits: a price-based offer (discount) for cost/competitor complaints, or
   a service-based fix (technician visit, equipment swap, outage credit)
   for reliability complaints.
3. **Treat all flagged churn as equally actionable** — assume every
   high-risk customer can be retained if you just try hard enough.

## Decision
Option 2. The intervention has to be matched to the diagnosed reason, and
the proactive call is the diagnostic step that makes that matching
possible — not just one intervention among several, but the mechanism that
decides which of the others to use.

Just as important: Option 3 was explicitly rejected. Some churn reasons —
relocating outside the coverage area, no longer needing the service — are
not fixable by any offer. This means the real target for this project
isn't "predict who will churn," it's closer to **"predict who will churn
and could plausibly have been retained."** Those are not the same
question, and conflating them was the main risk in this stage.

## Reasoning
A discount doesn't fix a reliability complaint, and a technician visit
doesn't fix a price complaint — offering the wrong tool wastes the
intervention budget and may not even register with the customer as a real
response to their actual problem. Reasoning through concrete cases (a
customer unhappy about price vs. a customer with a flaky connection vs. a
customer relocating) surfaced this before a single model was built, which
is the point of doing this stage before EDA: it forces the "what would we
even do with this prediction" question to be answered on its own terms,
not backfilled after a model already exists.

## Trade-offs / What This Costs
- The system isn't a fully automated loop — a human diagnostic call is a
  required step before the "real" fix, at least for this version.
- Without knowing in advance which customers are in the unfixable bucket
  (relocation, no longer needed), the model may still spend some budget on
  customers no offer could have saved, unless that's addressed later.

## What Would Change My Mind
If the retention team's process changes such that diagnosis can happen
without a live call (e.g., a self-serve reason-for-leaving survey, or
enough historical data to infer likely churn *reason* directly), the
call-first assumption should be revisited.
