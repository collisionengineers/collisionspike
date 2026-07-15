# Verification — TKT-001: Fix multi-format document extraction regression

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier dispatch — final sweep verdict; the original pass
below stands corroborated)

## Final sweep verdict (transcribed verbatim, 2026-07-10)

- **Live deployed engine, per-format probes (this pass, engine-v2.15):** `POST /api/parse` on
  `cespike-parser-dev-x7xt3d5ovhi7y` — every format returns a rich multi-field extraction, not just
  the registration: **PDF** (KBS, 7 fields incl. work_provider) · **DOCX** (ACSP, 8 fields incl.
  accident_circumstances) · **earlier .DOC** (OAK, 7 fields — extracts live on the FC1 host when its
  text scrape is clean) · **EML** (the ticket's own follow-up regression sample, 7 fields incl. the
  Redbridge Flyover accident_circumstances — the exact field the 2026-07-01 follow-up regressed on)
  · **MSG** (ALS26066, 7 fields incl. vehicle_model from the NESTED attachment — first recorded live
  .msg proof).
- **Live intake at volume (KQL 7d):** parse-ok by extension pdf 411 / doc 42 / docx 25 / eml 23
  (msg 0 — none arrived); parser requests 200 ×508, 422 ×40 (all `.doc`), 400 ×1; caseResolve 268
  created + 13 attached — the parse→persist chain running at volume.
- **Provenance + re-intake:** the recorded 2026-06-30 DB proof stands (8 EVA columns + 7 provenance
  rows / 6 + 5); the persist path (`services/data-api/src/features/inbound/parser-eva-fields.ts`) unchanged since; `.msg` is
  intake-eligible by code (`parse.ts:126` DOC_EXT).
- **Offline suite state (drifted-venv bypassed via `C:\Python314\python`):** sibling
  `cedocumentmapper_v2.0` full suite at HEAD = tag **engine-v2.15 (the live tag): 453 passed / 4
  skipped / 0 failed**; vendored `test_multiformat_extraction.py` 4 passed / 1 failed — exactly the
  recorded pre-existing environmental `[ALS_doc]` baseline, not a regression; drift guard
  `test_engine_vendored_in_sync.py` **7/7** — vendored == sibling v2.15 == deployed.

### Expected absences / documented limitation (not regressions)
- No `.msg` arrived through live intake in the retention window — capability proven by live probe;
  arrival is a matter of time.
- Not all 12 EVA fields fill when absent from the source document (original gap note stands).
- The table-heavy/scrape-polluted earlier `.doc` subset 422s on the FC1 host (40/82 .doc attempts
  this window, QDOS-triage-letter class) — the in-ticket documented FC1 constraint
  (`changes-regression-01-07-26.md`; ROADMAP Later "Parser custom container"). The email-body
  supplement mitigation is deployed; its Postgres re-intake proof on a QDOS26010-class case remains
  the recorded pending item from the follow-up pass.

### Queued SQL (corroborative, next data pass)
V1 per-format re-intake census (evidence ext × cases × with-provenance, 7d); V2 newest-10 spot check
of populated `eva_*` columns.

### How to re-verify
Live per-format probe via the parser function key + `probe_parse.py` (fixtures listed in the sweep
record); KQL q1–q6 (banked in the session scratchpad); sibling + vendored suites via
`C:\Python314\python` (judge `[ALS_doc]` against the environmental baseline, do NOT use the drifted
`.venv`).

Verified by: ticket-verifier dispatch, 2026-07-10.

## Verdict (original pass)
VERIFIED-LIVE

## Evidence (original pass, 2026-06-30)
Live e2e (two cases since the 10:21Z clean-slate reset):
- `dc307411` (connexus, no provider match — partial path): 8 EVA columns populated (vrm, vehicle_model, claimant_name, claimant_telephone, date_of_loss, date_of_instruction, vat_status, mileage) + 7 `field_level_provenance` rows (source_label "From instructions").
- `ca3acf21` = Case/PO `QDOS26001` (full happy path): 6 EVA columns + 5 provenance rows, including a multiline `accidentCircumstances`.
- Orchestration `caseResolve` ran 6× with 0 failures; the parse activity ran 6/0.
- Unit test: `services/data-api/src/features/inbound/parser-eva-fields.test.ts` (6 cases).
DB reads were cross-checked against App Insights custom events.

## Follow-up verdict (2026-07-01 — QDOS triage accident circumstances)
**VERIFIED-LIVE** (parser deploy + live `/api/parse` probe). **Intake body-supplement path:** `TESTED (offline)` on follow-up narrative + deployed to `cespk-orch-dev`; Postgres re-intake proof on `QDOS26010` pending next triage email.

### Evidence — follow-up
- **Live parser** (`cespike-parser-dev`, 2026-07-01): `POST /api/parse` with follow-up triage `.eml` + `provider_hint=QDOS` returns populated `accident_circumstances` (Redbridge Flyover narrative) and `vrm=VN64WNG`.
- **Deploy:** `cespike-parser-dev` + `cespk-orch-dev` config-zip deploy succeeded after re-vendor.
- **Offline:** `services/orchestration/src/platform/supplement-parse.test.ts` (3/3) — extracts the follow-up narrative between `Accident Circumstances` and `Damage Description`.
- **Sibling engine:** alternate `between_labels` pairs + `QDOS_TRIAGE_01` fixture (pytest; LibreOffice path skips without `soffice`).
- **Drift guard:** `services/functions/parser/tests/test_engine_vendored_in_sync.py` (6/6, prior session).

### Pending / gaps (follow-up)
- **E2e intake on attachment-first path:** intake prefers the attached `.doc`; on FC1 the binary scrape still cannot reach LibreOffice. The orchestration body supplement closes this when parser returns empty — confirm on the next triage QDOS re-intake (`eva_accident_circumstances` + provenance row in Postgres for a `QDOS26010`-class case).
- **earlier `.doc` table fidelity on FC1** without re-intake: requires a future **custom-container** parser image (LibreOffice baked in) — see [changes-regression-01-07-26.md](./changes-regression-01-07-26.md) and [docs/tickets/README.md](../../../../docs/tickets/README.md) Later.

### Pending / gaps (original)
Not all 12 EVA fields fill when the source instruction lacks them — `eva_claimant_email` / `eva_inspection_address` / `eva_accident_circumstances` are NULL on `dc307411`, and `eva_vat_status` is NULL on `QDOS26001`. This is EXPECTED (field absent in source), not a regression.

## How to re-verify
**Original:** Send a multi-format instruction to a live intake mailbox, let the case mint, then query the case's EVA columns and `field_level_provenance` rows in Postgres and cross-check the `parse` / `caseResolve` custom events in App Insights. Run `parser-eva-fields.test.ts`.

**Follow-up:** Re-forward the triage QDOS sample (or equivalent) to a production intake mailbox; after mint, confirm `eva_accident_circumstances` on the new case. Offline: `POST /api/parse` with the follow-up `.eml` + `provider_hint=QDOS`; run `npm test` in `services/orchestration/`; run sibling `pytest -k QDOS`.
