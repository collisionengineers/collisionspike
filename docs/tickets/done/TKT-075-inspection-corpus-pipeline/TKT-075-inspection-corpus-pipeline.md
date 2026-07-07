---
id: TKT-075
title: Rebuild the inspection-address corpus in-repo — correct provider attribution + geocodes
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-062, TKT-076, TKT-080, TKT-074]
research-link: docs/tickets/done/TKT-075-inspection-corpus-pipeline/evidence/operator-note.md
---

# Rebuild the inspection-address corpus in-repo — correct provider attribution + geocodes

## Problem

The live `inspection_address` suggestion corpus is wrong at the data layer, and the pipeline
that built it is not reproducible (verified root causes, 2026-07-06 investigation):

- **Provider mis-attribution**: the old (not-in-repo) preprocessor took the leading alpha of
  `Case ID`, so `a.qdos…` rows became provider "A" (~3,064 rows) and `ap.qdos…` became "AP"
  (~1,590) — QDOS/PCH sites are attributed to bogus principals. The API-side marker strip
  (ADR-0021 `^(AP|A|D)\.`) exists in `inspection.ts` but the **data** is still wrong.
- **Duplicates**: postcode variants (`B5 6JX` vs `B56JX`) split one site into multiple rows.
- **Lost signal**: `InspLocName` site names dropped; ~112 usable name+postcode-only rows
  excluded; the `"Image Based Asessment"` source typo defeats the image-based drop (~97 junk
  rows in the corpus).
- **No provenance columns**: the seed (`910_seed_corpus.sql`) never writes `source_note`, so
  provider scoping has nothing to scope on (see TKT-076), and there are no lat/lon columns for
  proximity ordering.
- **Not reproducible**: the old `dataverse/.build` preprocessor/CSV are gone; the source export
  survives at `docs/reference/fullevaexportinspectionaddresses.xlsx` (user-confirmed, ~17,737
  rows, **git-ignored — must stay out of history**, it contains PII).

## Evidence

- `evidence/operator-note.md` — the full 2026-07-06 investigation & repair plan (this ticket =
  Phase A + root causes 2–3).
- `migration/assets/schema/seed/910_seed_corpus.sql` — no `source_note`, no provider column.
- `migration/assets/schema/040_inspection_address.sql` — current DDL (no `provider_code`,
  no lat/lon).
- `docs/adr/0016-inspection-address-corpus-eva-export.md` — the corpus design this repairs.
- Live counts: the registry
  [live-environment.md](../../../architecture/live-environment.md) (never embedded here).

## Proposed change

PROPOSED (not built) — a new, committed, reproducible pipeline `scripts/inspection-corpus/`
(Python, stdlib xlsx parsing) reading the git-ignored source export:

- **Marker-aware provider parse** (`ap.qdos25448` → `QDOS`), VRM-shaped-ID exclusion, junk-ID
  drop.
- **Deterministic postcode normalisation** before dedup; dedup per (provider, normalised
  site); recompute frequency/last-seen/rank per provider.
- **Carry site names** into suggestion lines; keep name+postcode-only sites; typo-tolerant
  image-based/no-site drop (catches "Asessment").
- **Emit a committed, PII-free CSV** (no insured names/VRMs/claim numbers) + a per-provider
  run report (operator input for `always_image_based` policy designation — stats never
  auto-set policy, per ADR-0016).
- **Separate `geocode_sites.py` network step**: postcodes.io bulk lookup → lat/lon per site
  (kept apart from the pure parse so the pipeline is testable offline).
- **Additive DDL delta**: `provider_code varchar(16)`, `latitude`/`longitude` on
  `040_inspection_address.sql` + a dated delta file.
- **New idempotent `920_replace_suggested_addresses.sql`**: backup-first, replaces only
  `source_label LIKE 'suggested%'` rows, writes `provider_code` + lat/lon + a proper
  `source_note`, **preserves confirmed rows**. (The live apply is Phase F → TKT-080.)

ADR-0013 unchanged: this is suggestion **data** only — a human always confirms.

## Acceptance

- [ ] Running the pipeline on the source export reproduces a deterministic PII-free CSV
      (same input → identical output) with per-provider report.
- [ ] `a.qdos…`/`ap.qdos…` rows attribute to QDOS (not "A"/"AP"); no bogus one/two-letter
      marker principals remain in the output.
- [ ] Postcode-variant duplicates collapse to one site each; site names are carried;
      name+postcode-only sites retained; image-based/no-site rows (typo included) dropped.
- [ ] The committed CSV contains no insured names, VRMs, or claim numbers (spot-audited), and
      the source `.xlsx` remains git-ignored.
- [ ] The geocode step writes lat/lon for sites with resolvable postcodes and records misses.
- [ ] The DDL delta + `920` seed apply cleanly to a scratch/dev database: suggested rows
      replaced, confirmed rows byte-identical, re-runnable (idempotent).

## Verification requirements (proof standard)

1. **Offline pipeline tests** — Python unit tests for the marker parse, VRM-shape exclusion,
   postcode normalisation, dedup keying, and the typo-tolerant drops (fixture rows in-repo);
   a determinism check (two runs, identical hash).
2. **PII audit** — a scripted scan of the emitted CSV for VRM shapes / name columns, recorded
   in [verification.md](./verification.md); confirm `git check-ignore` on the source `.xlsx`.
3. **Scratch-DB apply** — DDL delta + `920` seed applied twice to a scratch database; capture
   before/after counts (suggested replaced, confirmed preserved) and the idempotency proof.
4. **Gate** — `node verify-all.mjs` + `node scripts/check-doc-links.mjs` green (new scripts +
   docs linked). Live reseed proof belongs to TKT-080, not here.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Phase A + root causes); full plan preserved in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (full plan)](./evidence/operator-note.md)
