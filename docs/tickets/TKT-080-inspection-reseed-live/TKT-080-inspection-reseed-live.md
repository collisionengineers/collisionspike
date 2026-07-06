---
id: TKT-080
title: Reseed the live address catalogue + deploy and prove the whole inspection repair
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-075, TKT-076, TKT-077, TKT-062, TKT-074]
research-link: docs/tickets/TKT-080-inspection-reseed-live/evidence/operator-note.md
---

# Reseed the live address catalogue + deploy and prove the whole inspection repair

## Problem

The inspection-address repair (TKT-075 corpus pipeline, TKT-076 scoping/proximity, TKT-077
photo assist) only counts when the **live** Postgres corpus is replaced and the whole chain is
proven on the deployed stack. This is the cutover ticket: a live-data mutation over ~2k
suggestion rows with confirmed rows that **must** survive, plus the deploys, smoke tests, and
the documentation/registry updates the MAINTENANCE protocol requires.

## Evidence

- `evidence/operator-note.md` — plan Phase F (2026-07-06 investigation).
- Inputs: the TKT-075 pipeline outputs (DDL delta, PII-free CSV, `920` replace seed).
- Live counts before/after: the registry
  [live-environment.md](../../architecture/live-environment.md) / `LIVE_FACTS.json` (never
  embedded here).
- Docs to reconcile: `docs/architecture/inspection-address-corpus.md`, ADR-0016, docs/gated.md,
  the TKT-062 residual annotations.

## Proposed change

PROPOSED (not executed) — ordered, backup-first cutover:

1. **Backup** the live `inspection_address` table (recorded, restorable).
2. **Apply** the additive DDL delta (`provider_code`, `latitude`, `longitude`).
3. **Run** the idempotent `920_replace_suggested_addresses.sql` — replaces only
   `source_label LIKE 'suggested%'` rows; confirmed rows preserved.
4. **Verify data**: per-provider counts match the pipeline's run report; confirmed rows
   byte-identical pre/post.
5. **Deploy** API + SPA + the location-suggest Function (whichever of TKT-076/077/079 are
   ready to ride the same cutover).
6. **Smoke-test** one case per major provider (QDOS, PCH, QCL, FW) + one assist run on a photo
   case.
7. **Document**: update `inspection-address-corpus.md` (in-repo pipeline + marker rule),
   ADR-0016 note, `LIVE_FACTS.json` + the live-environment mirror (bump `lastVerified`),
   docs/gated.md; add the short ADR note that auto-*suggest* on corpus miss stays within
   ADR-0013; close/annotate the TKT-062 residuals.

## Acceptance

- [ ] A restorable backup of the pre-reseed table exists and is referenced in
      [changes.md](./changes.md).
- [ ] Post-reseed: suggested rows carry `provider_code` + lat/lon + a proper `source_note`;
      per-provider counts equal the pipeline report; **every confirmed row is preserved
      unchanged**.
- [ ] The seed is proven idempotent on live (a second run changes nothing).
- [ ] Per-provider smoke tests (QDOS, PCH, QCL, FW) each show provider-correct, ranked
      suggestions in the deployed SPA; one photo-case assist run succeeds.
- [ ] Registry + docs updated per the MAINTENANCE protocol; `node verify-all.mjs` and
      `VERIFY_LIVE=1 node verify-all.mjs` green; TKT-062 residuals closed/annotated.

## Verification requirements (proof standard — this ticket IS the live proof)

1. **Data proof** — SQL before/after: total suggested/confirmed counts, per-provider counts vs
   the run report, a checksum (or row-level diff) over confirmed rows proving preservation,
   and the second-run no-op output. All pasted into [verification.md](./verification.md).
2. **Deploy proof** — deploy outputs/commits for API + SPA + Function recorded in
   [changes.md](./changes.md).
3. **Live smoke matrix** — one case per major provider: endpoint JSON + SPA screenshot each;
   one assist run on a photo case with its telemetry.
4. **Gate proof** — `verify-all` offline AND live-mode outputs captured; the doc-links gate
   green after the doc updates.
5. **Rollback readiness** — the tested restore path for the backup stated in verification.md
   (what command restores it, verified against the backup artefact).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Phase F); excerpt in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
