# TKT-001 follow-up — 2026-07-01 QDOS triage accident circumstances (QDOS26010 / VN64WNG)

## Trigger
Follow-up sample in `followup/`: QDOS triage letter (`.doc` attachment + email body) extracted VRM and
identity fields but left `accident_circumstances` empty on case **QDOS26010** (VRM **VN64WNG**).

## Root cause A — QDOS provider rule mismatch (triage vs audit template)
QDOS `accident_circumstances` used `between_labels` **Damage Area → TP Vehicle** (audit letters).
Triage letters use **Accident Circumstances → Damage Description** instead. The narrative was present
in the email body but the rule never matched.

### Fix
- `cedocumentmapper_v2.0/providers.json` — QDOS rule config now carries both pairs (`;`-separated).
- `config/migration.py` — `parse_alternate_two_label_configs()` + `label_pairs` on migrated rules.
- `rules/engine.py` — `_extract_between_labels` tries each pair; `clean_val` strips leading table `|`.

## Root cause B — earlier `.doc` binary scrape drops table-cell text
The DOC reader's embedded-text scrape returned early with PNG garbage (`IHDR`/`IDAT`) and **no narrative**
between the labels (table content is not in the binary streams). LibreOffice conversion extracts the full
table row correctly when available.

### Fix
- `readers/doc.py` — `_scrape_text_is_incomplete()` rejects polluted/empty-label scrapes and falls through
  to LibreOffice / antiword / Word COM.

## Root cause C — intake parses the `.doc` attachment, not the email body (FC1 constraint)
`parse.ts` prefers the attached `.doc` over the `.eml`. On **Flex Consumption** the parser worker cannot
install LibreOffice without a custom container, so table-heavy `.doc` files still fail attachment parse on
live FC1 even after the scrape gate.

### Fix (live path)
- `services/orchestration/src/platform/supplement-parse.ts` — when parser returns empty `accident_circumstances`, extract
  from `inbound.body` using the same label window.
- `intakeOrchestrator.ts` — wires the supplement into `parserEvaFields`.

### Fix (parser seed cache)
- `application/service.py` — pinned-seed mode (parser Function) always migrates from vendored
  `providers.json` so stale app-data caches cannot hide seed updates between deploys.

## FC1 platform note (not implemented here)
Parser FC1 cannot install system packages (LibreOffice/antiword) without a **custom container** migration.
Until then, triage `.doc` cases rely on the email-body supplement; full `.doc` table fidelity needs a
future container image with `libreoffice-writer-nogui` baked in.
See [Microsoft Q&A — Flex Consumption system packages](https://learn.microsoft.com/en-ca/answers/questions/5911523/unable-to-use-linux-packages-in-flexi-function-app).

## Files touched
- Sibling: `cedocumentmapper_v2.0` — `providers.json`, `rules/engine.py`, `config/migration.py`,
  `readers/doc.py`, `application/service.py`, `tests/test_rules.py`, `tests/test_extraction_targeted.py`,
  and its `QDOS_TRIAGE_01` instruction/expected-result fixtures.
- Vendored: `services/functions/parser/cedocumentmapper_v2/` — same engine modules + `providers.json`
- Orchestration: `services/orchestration/src/platform/supplement-parse.ts`,
  `services/orchestration/src/platform/supplement-parse.test.ts`,
  `services/orchestration/src/workflows/intake/intakeOrchestrator.ts`, `vitest.config.ts`, `package.json`

## Status
Deployed 2026-07-01 (`cespike-parser-dev` + `cespk-orch-dev`). Live `/api/parse` probe on follow-up `.eml`
confirms `accident_circumstances` + `VN64WNG`. Intake e2e Postgres proof on triage `.doc` path pending
re-forward (see `verification.md`).
