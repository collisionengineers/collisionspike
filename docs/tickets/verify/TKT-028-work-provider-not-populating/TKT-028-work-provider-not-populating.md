---
id: TKT-028
title: work_provider not populating on intake
status: verify
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001, TKT-021]
research-link: docs/tickets/verify/TKT-028-work-provider-not-populating/evidence/operator-note.md
---

# work_provider not populating on intake

## Problem
On new cases the `work_provider` field is not being populated even though the
provider is being detected. The operator's specific example is VRM **KV64EHB**,
case **QDOS26001** for provider **QDOS** — the provider was detected but the
field did not fill.

## Evidence
- `evidence/operator-note.md` — the operator's drop-note naming the failing
  example (KV64EHB / QDOS26001 / QDOS).

## Proposed change
PROPOSED (not built) — **verify before building; this may already be fixed:**
- First, reproduce the operator's specific failing example (KV64EHB / QDOS26001 /
  QDOS) against the current build. The 2026-06-30 live end-to-end run showed case
  QDOS26001 populating `work_provider` (via `work_provider_id`) correctly, and a
  Connexus sender correctly NOT matching (that intermediary case is TKT-021). So
  the detect-but-not-populate symptom may already be resolved by the parser /
  provider-match fix.
- Only if the example still fails: trace where provider detection produces a
  match but the `work_provider` / `work_provider_id` is not written to the case,
  and fix the write/binding.

## Acceptance
- The operator's example (KV64EHB / QDOS26001 / QDOS) populates `work_provider`
  (resolved to `work_provider_id`) on intake.
- Detected providers are written to the case rather than detected-then-dropped.
- No regression to the correct non-match behaviour for intermediaries (TKT-021).

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
