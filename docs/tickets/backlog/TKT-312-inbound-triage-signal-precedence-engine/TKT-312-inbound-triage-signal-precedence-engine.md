---
id: TKT-312
title: Inbound-triage rewrite Phase 2 — signal-precedence evaluator replaces first-match-wins
status: backlog
priority: P1
area: triage
tickets-it-relates-to: [TKT-310, TKT-311]
plan: PLAN-016
research-link: docs/tickets/next/TKT-310-inbound-triage-ground-truth-corpus/evidence/code-read-2026-07-21.md
---

# Inbound-triage rewrite Phase 2 — signal-precedence evaluator replaces first-match-wins

## Problem

`email_classifier.py`'s rules run first-match-wins in accreted order (`0a 0 0b 0c 0d 0e 0f 1 2 3
4 4a 4a2 4b 4c 4d 5 5b 5c 6`), with one shared 8-way `suppress_as_query` disjunct. The rule
ordering was never re-derived as rules accumulated, so the most expensive, least-spoofable
signal — content typing, which requires actually opening the document — is consulted last and
can be vetoed by a filename regex. That is how the QDOS forward incident happened: the
FILENAME-tier `Bodyshopreport-V1.pdf` re-asserted a veto that CONTENT-tier typing had already
cleared.

Blocked on TKT-310 (Phase 0) for the sorted corpus to validate against, and co-designed with
TKT-311 (the taxonomy this engine assigns).

## Change

Not designed. The shape, per PLAN-016:

```
CONTENT   parser opened the document        instruction | report | junk | unknown
IDENTITY  sender domain match  OR  document-resolved provider (distinct third state)
TEXT      sender-written phrases (quoted thread already stripped)
SHAPE     filename + extension              <- weakest; may never veto CONTENT
```

Rules become declarations of which signals support which (stage, intent); contradictions
resolve by rank, not source-line order. A document-resolved provider counts as IDENTITY but as
a distinct third state, not by widening `provider_match_state: 'one'` — a PDF is spoofable, a
DMARC-aligned domain is not.

## Acceptance

- Every current suppressor (TKT-029/030/031/033/037/039/041/043/082/093) and the
  provider-none promotion fall-through has a passing eval item under the new engine before its
  old rule/disjunct is deleted — the disjuncts go, the behaviours they protect do not.
- The QDOS forward promotes as a consequence of the ranked model, not a dedicated rule; the
  TKT-093 forward rule stops being load-bearing.
- `engine.py`'s keyword/phrase corpus (data, not logic), `resources/triage-rules.json`, and
  `packages/domain/src/domain/triage-policy.ts`'s `decideTriage` (a separate, already-gated
  layer, not the orchestration `triagePolicy.ts` implicated in the incident) carry over
  unchanged.
