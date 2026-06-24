# ADR-0016 — Inspection-address suggestion corpus regenerated from the 2-year EVA full-address export

**Status:** Proposed (2026-06-24). **ADR-0013 remains binding and is re-affirmed.** Relates to
ADR-0017 (data governance). Realised in Phase 4a.

## Context

A new EVA export `fullevaexportinspectionaddresses.xlsx` (**~17,737 inspection rows**) has arrived with
columns *Case ID, Vehicle Reg, Insured Name, Claim No, Created Date, InspLocAdd, InspLocPCode,
InspLocName, InspLocCont, InspLocAdd1* — i.e. the **FULL street / postcode / site-name**, much richer
than the prior `codexwork` CSV that yielded only ~697 suggested rows.

The operator says it "**is now the source of truth and to entirely replace the current records**", and
lists three helper methods to consider: (1) provider-always-image-based autofill; (2) most-common /
closest-to-accident; (3) vision-AI / geolocate.

## Decision

Adopt the export to **FULLY REPLACE** the SUGGESTION layer of `cr1bd_inspectionaddress`. Every
imported row is a **SUGGESTION** (`decisionMode=Unknown`), so **ADR-0013 REMAINS BINDING and is
re-affirmed** — there is **NO runtime inspection-address matcher**, nothing auto-confirms, and staff
still pick per case. All helper signals bind to the **OFFLINE corpus-build layer** or to
**suggestion-ORDERING**, never to a per-Case runtime resolver.

- **Full replace, backup-first.** The export "**is now the source of truth and is to entirely replace
  the current records**". Before regenerating, **back up the current corpus to the repo first**, then
  rebuild the suggestion layer from the export. (See *Consequences* for the preserve/replace mechanics.)
- **Provider / Principal is parsed from the export's `Case ID`** — the **leading alpha prefix** is the
  Principal code (e.g. `CCPY26050` → `CCPY`). **BRANCH:** if the `Case ID` is **VRM-shaped**, the row is
  an **INDIVIDUAL / private-claimant case keyed by VRM** (no Principal code). This replaces the earlier
  "no `provider_code` column → map via Claim No / Insured Name" guesswork.
- **Dedup sites on the FULL ADDRESS** — `(provider + full address)`, with **postcode as a secondary**
  key — not postcode alone.
- **Helper #1 (provider-always-image-based)** = a per-provider **SUGGESTED default surfaced for operator
  confirmation, NEVER auto-applied** and subject to the no-silent-image-based rule (`address-policy.ts`).
  It is **OPERATOR-DESIGNATED for specific providers only** — it is **NOT statistically derived** from
  the export (a high image-based % there usually signals **missing data**, not a deliberate policy).
- **Helper #2 (frequency + recency ranking)** = **implemented NOW** as offline-derived ranking metadata
  and **surfaced in the Code App now** (not deferred to M2).
- **Helper #2b ("closest to accident") is IMPLEMENTED NOW as a suggestion-ORDERING signal** — **never
  an auto-select**, so ADR-0013 is **not reopened**. It uses an **accident location/postcode WHEN
  PRESENT in the instruction** (formats vary — an opportunistic, best-effort parse), else falls back to
  **CLAIMANT HOME-ADDRESS proximity** (a *soft* signal — the claimant may have been travelling, so it is
  not a guarantee). This **replaces the earlier "closest to accident is DROPPED" verdict**. It needs two
  best-effort parser extractions (accident location, claimant home address) plus **gated** geocoding.
- **Helper #3 (vision / geocode)** = permitted **ONLY as offline corpus mining + the gated proximity
  ordering above** (Azure Maps geocode), **gated** (`AZURE_MAPS_ENABLED=false`), **never per-Case
  auto-resolution**.

## Consequences

A **NEW offline pre-processor** must:

1. **back up the current `cr1bd_inspectionaddress` corpus to the repo** (pre-step, before any replace);
2. profile the `.xlsx`;
3. parse provider / Principal from the **`Case ID` leading alpha prefix**, branching VRM-shaped
   `Case ID`s to **VRM-keyed individual** rows (no Principal code);
4. drop "Image Based Assessment" rows;
5. normalise postcodes (postcode.io);
6. **dedup ~17,737 inspections to unique physical sites per provider on the FULL ADDRESS** (postcode
   secondary), emitting the 8-column shape `16-seed-suggested-addresses.ps1` consumes;
7. compute **frequency + recency** ranking metadata (surfaced in the Code App), and the **gated
   proximity-ordering** signal (accident-loc-when-present, else claimant-home proximity).

Add a **`-ReplaceSuggestions` mode** that regenerates only `sourceLabel startswith 'suggested'` and
**PRESERVES the hand-curated Confirmed rows** (a full truncate happens only on explicit operator
confirmation, and only after the repo backup above).

Every imported row remains a **suggestion** (`decisionMode=Unknown`): staff still pick/edit per case
and nothing auto-confirms — **ADR-0013 stays intact**.

## Links

- ADR-0013 (re-affirmed — no runtime address matcher; suggestion-ORDERING is permitted)
- [`docs/architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md)
- ADR-0017 (data retention, erasure & PII lifecycle)
- Phase 4a plan — [`docs/plans/phase-4-address-and-chaser/inspection-address-revamp.md`](../plans/phase-4-address-and-chaser/inspection-address-revamp.md)
