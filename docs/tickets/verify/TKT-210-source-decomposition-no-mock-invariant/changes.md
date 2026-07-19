# Changes — TKT-210: Decompose source by feature and enforce the production-data boundary

## Status
verify — the final A2 gap (oversized ratcheted modules) is closed. On 2026-07-19 all eleven
previously-ratcheted files were decomposed below the 800-nonblank-line limit behaviour-preservingly on
branch `plan006/tkt-210-source-decomposition`; the source-size ratchet set is now empty (`{}`).

## Commits
- b224c54b — establish the monorepo runtime roots before feature-level content changes (2026-07-15).
- e80aae68 — split the orchestration data-api adapter into cohesive sub-clients.
- 18de812e — decompose merge-routes(.ts / .test.ts).
- 000f1f9e — decompose retro-routes(.ts / .test.ts).
- 9a5d34a7 — decompose intakeOrchestrator.ts.
- 51c2cb03 — decompose retro-activities.ts.
- cb4263db — decompose retro-case.ts.
- 8088103d — decompose box_operations.py.
- c2fa6b6f — decompose capture(.ts / .test.ts).

## Files touched
Prior structural move (2026-07-15): apps/web, services/data-api, services/orchestration,
services/functions, package and service READMEs, package.json, verify-all.mjs, ci.yml, and the
check-production-dependencies + check-source-size gates.

2026-07-19 decomposition — cohesive sibling modules extracted, no behaviour change:
- `services/orchestration/src/adapters/data-api.ts` (984→605) → `data-api-{archive-holding,evidence,retro}.ts`
- `services/data-api/src/features/cases/merge-routes.ts` (934→400) → `merge-{evidence,capture,archive-holding,file-request,intake-ownership}.ts`; `merge-routes.test.ts` (989→694) → `merge-routes.harness.ts`
- `services/data-api/src/features/inbound/retro-routes.ts` (928→436) → `retro-{case-lookup,create}.ts`; `retro-routes.test.ts` (839→592) → `retro-create.test.ts`
- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` (811→768) → `parser-eva-fields.ts`
- `services/orchestration/src/workflows/retro/retro-activities.ts` (963→394) → `retro-{box-activities,parse-map,provider-corroboration,related-activities}.ts`
- `services/orchestration/src/workflows/retro/retro-case.ts` (1290→565) → `retro-reconstruct.ts`
- `services/functions/box-webhook/box_operations.py` (862→463) → `box_{rest_helpers,upload_operations}.py`
- `services/data-api/src/features/cases/capture.ts` (1689→91, now a pure route registrar) → `capture-{http,observations,session-store,staff,access,upload,submit}.ts`; `capture.test.ts` (1993→308) → `capture.harness.ts` + split test files
- `scripts/checks/source-size-budget.json` — all eleven ratchets removed (now `{}`).

## Summary
The A2 decomposition is complete. Every previously-oversized module is split into cohesive,
single-responsibility siblings; each registrar/composition root keeps its public export surface and route
registrations intact, so the runtime-contract snapshot is byte-identical (191 routes / 56 DTOs / 65
Postgres tables / 22 numeric code tables) before and after every commit. No pass-through wrappers and no
duplicated business rules were introduced (verified by an 8-reviewer adversarial pass, 0 high/medium
findings). The production-dependency boundary still holds (9 entrypoint graphs, 506 modules, 2315 edges,
zero mock/fixture/evaluation imports on any production path). The web app still starts from the honest
empty REST-backed data source.
