# Changes — TKT-052: Merged image-only case loses the provider (merge logic wrong)

> Regression follow-up (2026-07-11): [changes-regression-11-07-26.md](./changes-regression-11-07-26.md)

## Status
Reopened to `now` on 2026-07-11 after PR 55 review found merge concurrency and UUID-canonicalisation gaps. The 2026-07-09 deployment record below remains historical evidence.

## What shipped

- **Domain decision** (`packages/domain/src/domain/dedup.ts`): new pure
  **`decideMergeProvider(sourceProviderId, targetProviderId)`** — the merged survivor must end with
  whichever side carries a resolved provider; both-known-and-different re-asserts ADR-0010
  inviolable rule 2 (`crossProvider` → refuse, never resolved by preference).
- **Merge seam** (`api/src/functions/cases.ts` `mergeCases`): after the evidence re-parent it now
  (1) also re-points the source's `inbound_email` rows to the survivor (TKT-092 acceptance:
  "emails re-pointed at the surviving case"), and (2) when the target lacks a provider and the
  source has one, fills `work_provider_id` (+ `eva_work_provider` display name fill-if-empty) with
  a **`field_level_provenance`** row ("Carried over from the merged case") and the merge audit now
  records `movedEmails` + `providerFilled`. The existing cross-provider 400 refusal is untouched
  (and re-asserted defensively by the domain helper).
- **Unit tests against the ADR-0010 ladder** (`packages/domain/src/domain/dedup.test.ts`):
  image-only survivor inherits the source's provider; target-known kept; both-different →
  crossProvider refuse; neither → null.
- The wave's data-fix merges (TKT-092 §B/§C) applied the same preference manually — every survivor
  kept its provider (`providerPreserved: true` in the audit rows).

## Deploy state
api redeployed (89 fns) 2026-07-09.

## Remainders (honest)
- Live click-through of a staff merge where the SURVIVOR is the image-only side (the exact operator
  screenshot shape) — verifier item; no such live pair existed post-data-fix to exercise it.
