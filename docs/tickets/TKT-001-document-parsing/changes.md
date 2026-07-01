# Changes — TKT-001: Fix multi-format document extraction regression

## Status
done — multi-format extraction + the field-drop fix are implemented and verified live.

## Commits
- `c87430d` — fix(intake): parse.ts→parser contract, Box folder at intake, Case/PO mint → restored the parser contract so extraction returns the full field set, not just the registration.
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → core multi-format extraction + classification path.
- `20b114f` — fix(intake): persist full parser EVA extraction on email-minted cases → maps the parser output into the EVA columns + `field_level_provenance` so the extracted fields actually land on the case.

## Files touched
- `api/src/lib/parser-eva-fields.ts` (+ `parser-eva-fields.test.ts`)
- `api/src/functions/internal.ts`
- `orchestration/src/lib/data-api.ts`
- `orchestration/src/functions/activities/caseResolve.ts`
- `orchestration/src/functions/intakeOrchestrator.ts`

## Summary
The regression was that the parser output was not being persisted into the case's EVA columns, so only the registration survived. The fix re-establishes the parse.ts→parser contract and maps each extracted field into its EVA column plus a provenance row. Extraction now spans PDF/.doc/.docx/.eml/.msg via the vendored cedocumentmapper engine. Live cases confirm multiple EVA fields and provenance rows populating from real instructions.

## Follow-up (2026-07-01)
QDOS triage letter class (`QDOS26010` / VN64WNG): `accident_circumstances` empty despite narrative in email body.
See [changes-regression-01-07-26.md](./changes-regression-01-07-26.md) — alternate QDOS label pairs, DOC scrape
quality gate, email-body supplement on intake, re-vendor + deploy parser + orchestration.
