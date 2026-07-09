# Operator plan excerpt — Phase B: Fix provider scoping + ranking in the Data API

> From `PLAN-inspection-address-repair.md` (investigation/planning session 2026-07-06). The full
> plan is preserved at
> [TKT-075 evidence](../../../done/TKT-075-inspection-corpus-pipeline/evidence/operator-note.md).

Root causes this phase closes (verified):

1. **Provider scoping is a silent no-op.** The API filters on `s.providerCode`, parsed from a
   `provider=` token in `source_note` — but the seed never writes `source_note`, and the filter
   keeps rows with **no** providerCode (`!s.providerCode || …`). Net: every case sees the same
   global top-8, interleaved across all providers.
2. **TKT-062 residuals:** the empty-provider fallback still silently serves global rows
   (unlabelled), and no case-postcode/proximity signal exists in ranking.
3. **Tier 2 — proximity ordering** (accident/claimant postcode distance): designed in ADR-0016
   #2b, never built.

Plan — in `api/src/functions/inspection.ts` + `api/src/lib/mappers.ts`:

- Read the new `provider_code` column (fallback: note token/label prefix for legacy rows);
  scope server-side with `WHERE`.
- Kill the silent firehose/global fallback: unknown provider → small **labelled** global top-N,
  never unlabelled corpus rows (closes the TKT-062 residual).
- **Tier 2 proximity (ordering only):** extract a postcode from the case's
  `eva_accident_circumstances` / `eva_claimant_address` (deterministic regex, same shape as
  `functions/location-suggest/clue_extraction.py`), resolve centroid via postcodes.io (cached),
  blend distance into ordering + return a `distanceMiles` hint.
- Unit tests: scoping, marker parse, proximity blend, empty-provider behaviour, honest-empty
  preserved.

ADR-0013 stays intact: ordering only; a human always confirms; "Image Based Assessment" always
needs a recorded reason.
