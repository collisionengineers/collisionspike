---
id: TKT-076
title: Inspection suggestions ignore the provider and distance — real scoping + nearest-first
status: done
priority: P1
area: ui
tickets-it-relates-to: [TKT-062, TKT-075, TKT-080]
research-link: docs/tickets/done/TKT-076-inspection-provider-scope-proximity/evidence/operator-note.md
---

# Inspection suggestions ignore the provider and distance — real scoping + nearest-first

## Problem

The inspection-address shortlist is effectively the same global top-8 for every case:

- **Provider scoping is a silent no-op.** `inspectionAddressSuggestions`
  (`services/data-api/src/features/cases/inspection-routes.ts`) filters on `s.providerCode`, but the
  rows did not carry the canonical `provider_code`, and the filter keeps rows with **none**
  (`!s.providerCode || …`) — every case sees the same interleaved global list.
- **TKT-062 residual**: when the provider scope is empty the fallback serves global rows
  **unlabelled** — staff can't tell they're looking at an unscoped list.
- **No proximity signal**: Tier 2 (ordering by distance from the accident/claimant postcode)
  was designed in ADR-0016 #2b but never built — a Leeds case ranks Cornwall sites the same as
  Leeds ones.

## Evidence

- `evidence/operator-note.md` — plan Phase B + root causes 1/5 (2026-07-06 investigation).
- `services/data-api/src/features/cases/inspection-routes.ts` ~lines 86–95 — scoping over `all` in JS, keep-if-no-code
  filter, unlabelled fallback.
- `services/data-api/src/shared/mapping/` ~line 352 — `providerCode` lacked canonical column backing.
- `services/functions/location-assist/clue_extraction.py` — the postcode-regex shape to reuse.
- Depends on TKT-075 landing the `provider_code` + lat/lon columns and the reseed (TKT-080)
  for live data; fixture rows keep the behavior testable before then.

## Proposed change

PROPOSED (not built) — in `services/data-api/src/features/cases/inspection-routes.ts` + `services/data-api/src/shared/mapping/`,
**ordering only** (ADR-0013: no runtime address matcher, a human always confirms):

- **Real server-side scoping**: read the canonical `provider_code` column and scope with `WHERE`,
  not a keep-if-absent JS filter.
- **Kill the silent firehose**: unknown/empty provider → a small **labelled** global top-N
  ("Showing common locations — no provider-specific sites yet" in handler language), never
  unlabelled corpus rows.
- **Tier 2 proximity (ordering only)**: extract a postcode from the case's
  `eva_accident_circumstances` / `eva_claimant_address` with a deterministic regex (same shape
  as `clue_extraction.py`), resolve its centroid via postcodes.io (cached), blend distance
  into the ordering, and return a `distanceMiles` hint per suggestion for the UI (TKT-079).
- **Unit tests**: scoping, marker parse, proximity blend, empty-provider behaviour, and the
  honest-empty (`200` + `[]` on failure) contract preserved.

## Acceptance

- [ ] A case whose provider has scoped sites gets ONLY that provider's sites in the shortlist
      (verified against known corpus rows).
- [ ] A case with no provider match gets a small, explicitly **labelled** global top-N — never
      an unlabelled global list (TKT-062 residual closed).
- [ ] When a case postcode is extractable, nearer sites rank ahead of farther ones and each
      suggestion carries `distanceMiles`; when none is extractable, ordering degrades to the
      existing rank/frequency/recency with no error.
- [ ] postcodes.io lookups are cached (no per-request external call storm) and a lookup
      failure degrades silently to non-proximity ordering.
- [ ] Honest-empty preserved: any failure still resolves `200` with `[]`.
- [ ] No runtime address matcher introduced; nothing auto-confirms (ADR-0013).

## Verification requirements (proof standard)

1. **Offline tests** — api unit tests for: WHERE-scoping (provider hit / miss), earlier-row
   fallback parse, labelled-fallback shape, proximity blend ordering (fixture centroids),
   missing-postcode degradation, honest-empty. All green, recorded.
2. **Gate** — `node verify-all.mjs` green; api deploy recorded in [changes.md](./changes.md).
3. **Live probes (post-reseed, with TKT-080)** — for one case per major provider (QDOS, PCH,
   QCL, FW): capture the deployed endpoint's JSON showing provider-correct sites +
   `distanceMiles`; for one providerless case capture the labelled fallback. Record all in
   [verification.md](./verification.md).
4. **Cross-check** — one shortlist's ordering re-derived by hand from the corpus rows +
   case postcode (show the arithmetic) to prove the blend does what it claims.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Phase B); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
