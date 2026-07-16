# TKT-016 — offline acceptance evidence (build-dark, G5 repo-data, no network)

The staged image-analysis producer is proven OFFLINE against a sample image set. No live deploy, no
gate flip, no DDL apply, no live model call — all deferred to the operator flip.

## What proves it

1. **Unit suite** — `services/data-api/src/features/assistant/image-analysis.test.ts` (10 tests, all green). Run:
   ```
   npm --prefix services/data-api test -- image-analysis
   ```
   It injects fake stage adapters + a sample set (the TKT-040 photo filenames; ev-4 carries the
   partially-cropped plate) and asserts the full staged sequence, graceful degradation per stage,
   the reg tri-state (F3), the "detected VRM ≠ case identity" boundary, and the VLM response
   contracts (strict json_schema + parse).

2. **Run transcript** — `evidence/run-transcript.mjs` runs the SHIPPED pure pipeline
   (`services/data-api/dist/features/assistant/image-analysis.js`) over the sample set with scripted fakes. Captured output:
   [`offline-run.txt`](./offline-run.txt).

## The staged sequence returns observations + a ranked address suggestion, all as *pending* suggestions

For the 4-photo sample set (ev-4 = the plated photo) the pipeline emits **9 drafts**, each of which
the route persists as an `ai_suggestion` with `review_state` DEFAULT `pending` (never auto-confirmed):

| Stage | suggestion_type | count | note |
|---|---|---|---|
| 1 vehicle present | `vehicle_present` | 4 (per image) | + person-reflection flag |
| 2 same vehicle | `same_vehicle` | 1 (set) | outliers listed, never merged |
| 3+4 registration | `registration` | 1 (plated image) | visibility tri-state + **fast-alpr** read (reader of record); VLM plate = cross-check only; `matchesCaseVrm` flag |
| 5 background text | `background_text` | 1 | signs / phones / signage |
| 6 location hint | `location_hint` | 1 (set) | landmark / signage clues |
| 7+8 address | `address_suggestion` | 1 (set) | ranked best-first from location-assist (corpus + provider history); `autoApplied:false` |

## Every stage degrades gracefully (never a crash, never an auto-write)

| Scenario | drafts | outcome |
|---|---|---|
| VLM scene down (`analyzeScene → null`) | 1 (address only) | vehicle `degraded`, reg/bg/loc/same `empty`/`skipped`, address `ok` |
| fast-alpr down (`readPlate` throws) | 9 | reg `degraded` — the VLM **visibility_unreadable** observation (F3) is still emitted |
| location-assist off (`suggestAddress → null`) | 8 | address `degraded`, everything else `ok` |
| no images | 0 | all stages `skipped` |

No scenario threw. The pipeline is a pure function returning `ImageAnalysisDraft[]`; it has **no
capability** to write `evidence.image_role_code` / `registration_visible` / `excluded`, `case_.vrm`,
or any inspection-address column — the route only ever `INSERT`s `ai_suggestion` rows.

## Non-collision invariant (auditable)

- The route (`services/data-api/src/features/assistant/image-analysis-routes.ts`) contains exactly **one** table write path:
  `INSERT INTO ai_suggestion ...` (in `persistDraft`, NOT-EXISTS-guarded for idempotent re-runs).
- It does **not** touch `services/orchestration/src/platform/image-classify.ts` or the intake write path.
- Promotion into evidence/case columns remains the EXISTING human-accept path only
  (`POST /api/ai-suggestions/{id}/review` → `promoteAcceptedSuggestion`, fill-if-empty), unmodified.

## Deferred to the operator flip (NOT done here)

- `IMAGE_ANALYSIS_ENABLED` stays absent/off; no live model call.
- `database/migrations/2026-07-08-image-analysis-suggestion-types.sql` NOT applied live.
- Live DB reads / a live deploy / a browser click-through — deferred; the acceptance is
  offline-provable and is proven above.
