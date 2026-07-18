# Verification — TKT-222

Verdict: **VERIFIED-LIVE** — generator tests pin the backfill on all three create arms with
the trigger/original exclusions; the route test pins link-vs-never-re-point counts and the
summary audit. Live: deployed 2026-07-16 and proven across two days.

## Live evidence

- 2026-07-16 22:54Z (FW26029 create): `{"evt":"retroLinkRelated","caseId":"62778371-…",
  "linked":0,"scanned":1}` — the seam ran on the first live create and honestly linked nothing
  (the sibling correspondence had been rung-1-linked as triggers instead). Banked in TKT-226's
  evidence (`fw_retro2_orch.json`).
- 2026-07-17 01:43Z (sweep, fresh reconstruction `03da61a3…`): link-related fed the TKT-225
  ingest child `retroRelatedIngest processed=2 failed=0 fieldsApplied=1` with a paired
  `retroBackfillFields outcome=applied` — related rows linked AND (TKT-225) a gap field
  back-filled from one. `retro_related` rows now persist a real subtype code (100000016,
  TKT-226's DDL — the original stamp silently nulled; see TKT-226).
