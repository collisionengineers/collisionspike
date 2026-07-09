# Changes — TKT-086: Accident circumstances still not being 100% extracted

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**The dropped sample — verified finding: NO circumstances exist at source.** The `.DOC` is RTF-in-.DOC
(magic `{\rtf1`); the engine reads it fully (all identity fields extract correctly: VRM PJ08AKX, ref
TJD/ABBAS/S495535.001, names/dates/address). The letter carries only `Accident: <date>` — no
narrative — and the carrier email only a vehicle-status advisory ("total loss with an unroadworthy
status" — vehicle condition, NOT circumstances; deliberately not stuffed into the field). The
orchestration body-supplement (`supplementAccidentCircumstancesFromBody`) correctly did not fire (no
"Accident Circumstances" label). **Correct extraction for this pair is EMPTY** — pinned as sibling
regression fixture `OAK_RTF_01` (engine-v2.10) so junk can never fill it and the format lane stays
proven.

**Corpus-wide measurement (the ticket's scope note):**
[evidence/circumstances-coverage-2026-07-09.md](./evidence/circumstances-coverage-2026-07-09.md) —
348 active cases: 178 populated (>40 chars, 51.1%) / 167 empty / 3 short. The residual is NAMED per
provider: PCH 46/50 empty (the largest single gap), BlackStone 12/12, QCL 11+1/12, Montreal 8/8,
Fairway 7/8, Swan 5/5, Baker Coleman 4/4; AX 35/35 populated (TKT-050 holding), QDOS 78%. Follow-up
tickets should be cut per layout WITH a dropped sample each (none on file here beyond the Oakwood
pair).

**Deploys:** parser engine-v2.10 live (the fixture rides the re-vendor; no extraction-rule change was
needed for this layout).

**Remainders:** acceptance line 1 ("extracts its full circumstances narrative") is superseded by the
verified finding — the verbatim target is EMPTY-at-source, recorded here + in the fixture notes; the
live /api/parse probe on the sample and the per-provider follow-up fixes are the open work. PCH
coverage is the recommended next ticket.
