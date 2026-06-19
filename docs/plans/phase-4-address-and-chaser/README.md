# Phase 4 — Address-Matching & Chaser

**Goal:** resolve a Case's part-postcode `Loc` (≈57% of cases) to a full inspection address via the
corpus yards, and draft chasers for partial cases (never auto-send).

**Status:** address-matching Function **deployed live**; chaser is **draft-only, built + imported off**.
See [../../../ROADMAP.md](../../../ROADMAP.md) Phase 4.

## Implementation checklist (by feature)

**4a · Inspection-address matching** — [inspection-address-matching.md](./inspection-address-matching.md)
1. [x] Address-policy gate in the Code App (per-provider; no silent "Image Based Assessment")
2. [x] Known-site reference data modelled + seeded (`InspectionAddress` + `Repairer`, Phase 1b)
3. [x] **Address-matching service deployed live** — `functions/addressmatch` (`POST /api/match-address`): part-postcode → district `startswith` over the corpus → EVA field 9; postcode.io (`AZURE_MAPS_ENABLED=false`)
4. [ ] Azure Maps (gated) — only if needed, later

**4b · Chaser automation (ADR-0003)** — covered by [../m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) §10
5. [x] `chaser-draft` flow built (imported off); draft-only behind the outbound kill switch
6. [ ] 🔒 Activate **draft-only** chasers — confirm a chaser drafts (never sends), targeting the right garage
7. [ ] Wire chaser targeting to the garage↔provider coverage (N:N) once **Phase 1b.3 Input 4** is loaded

## Plans in this phase

- [inspection-address-matching.md](./inspection-address-matching.md) — the 4a matcher deep-dive.
- Chaser (4b) lives in the M2 umbrella: [../m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md).

## Needs the operator

Chaser activation is a hard blocker; targeting depends on the gated clarifying-info Input 4. See
[../../gated.md](../../gated.md).
