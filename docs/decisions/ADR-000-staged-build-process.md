# ADR-000: Why This Project Restarted at Stage 1 — The Stage 0 False Start

**Date:** 2026-07-15
**Status:** Accepted

## Context

The project's actual first attempt — retroactively labeled "Stage 0" —
started writing code and analysis before the business problem was
properly framed. `src/features/iv.py` itself predates this restart and
sat unused until Stage 5 finally gave it an actual, cited reason to run
(`ADR-006`). An initial data-understanding notebook existed before any
ADR had been written to justify what it was for — added 2026-07-14,
deleted the same day as "incorrect," then rewritten from scratch once
Stage 1's real framing existed the next day.

## Options Considered

1. **Keep going from Stage 0, backfill the ADRs afterward** — write the
   missing business-framing and metric-selection documents to match code
   that already existed.

2. **Restart at Stage 1, treat Stage 0 as void, and write every ADR
   before or alongside the code it justifies from that point forward.**

3. **Keep the Stage 0 code and notebooks in the repo as a visible
   "before" state**, for transparency, alongside the restarted work.

## Decision

Option 2. Stage 0 is treated as void, not as a foundation to explain
after the fact.

## Reasoning

Backfilling an ADR to justify code that already exists is exactly the
HARKing risk `ADR-001` names directly — a decision written to match a
result you've already seen isn't a real decision, it's a post-hoc story.

The only way to know whether a genuinely staged, decision-first process
changes what gets built is to run it forward for real, not narrate it
backward.

Keeping the Stage 0 artifacts visible (Option 3) was considered for
transparency, but a half-finished notebook with no ADR behind it doesn't
demonstrate anything this document doesn't already say more clearly — the
record of the mistake belongs in an ADR, not in dead code left sitting
in the repo.

This is the discipline every later ADR in this project cites back to
`ADR-000` for: don't reach for a capability, a technique, or a line of
code before the stage that actually earns it.

Stage 0 is the concrete example of what skipping that costs — code and
analysis that had to be thrown away and redone, not because it was
technically wrong, but because nothing had yet established *why* it was
the right thing to build.

## Trade-offs / What This Costs

- Stage 0's work isn't preserved in this repository beyond what git
  history retains of the deleted notebook — there's no clean
  "before/after" diff to point to directly, only this document's account
  of it plus the commit log's timestamps (`02_data_understanding.ipynb`
  added and removed the same day, 2026-07-14, one day before `ADR-001`
  was committed).

- Restarting cost real time relative to continuing forward from Stage
  0's code as-is. That cost is treated as the actual price of the
  lesson, not glossed over.

## What Would Change My Mind

If a future project under real time pressure can't afford a full restart
when an early ungrounded start is caught, the fallback isn't "keep going
as if nothing happened" — it's to stop, write the missing ADR
immediately to bring the documentation up to the code's actual state,
and resume the discipline from that point forward, rather than either a
full restart or a full silent continuation.