# Inspection Address System — Investigation and Repair Plan

> Saved from the investigation/planning session of 2026-07-06. Working checklist at the bottom.

## How the system is designed (3 tiers, ADR-0013 binding throughout)

- **Tier 1 — corpus suggestions.** Offline-mined sites from EVA history live in Postgres `inspection_address` as `suggested:*` + confirmed rows (counts in the registry [live-environment.md](docs/architecture/live-environment.md)). Served by `GET /api/cases/{id}/inspection-suggestions` ([api/src/functions/inspection.ts](api/src/functions/inspection.ts)) as a ranked shortlist (TKT-062, live 05/07) + a "Search all locations" corpus search.
- **Tier 2 — proximity ordering** (accident/claimant postcode distance): designed in ADR-0016 #2b, **never built**.
- **Tier 3 — location assist** (photos + text clues → Vision OCR + Maps geocode → candidates): Function `cespkloc-fn-a7tzj2` is **deployed and gated ON** (03/07: `LOCATION_ASSIST_ENABLED`/`AZURE_MAPS_ENABLED`=true, Maps `cespkmaps-dev` + Vision `cespkvision-dev` provisioned), invoked via the "Suggest location" button in [mockup-app/src/screens/CaseDetail.tsx](mockup-app/src/screens/CaseDetail.tsx) through the API proxy ([api/src/functions/proxy.ts](api/src/functions/proxy.ts)).

ADR-0013 stays intact: every improvement below is suggestion-generation or **ordering only**; a human always confirms; "Image Based Assessment" always needs a recorded reason (DB CHECK constraint enforces it).

## Why it isn't "true" today (verified root causes)

1. **Provider scoping is a silent no-op.** The API filters on `s.providerCode`, parsed from a `provider=` token in `source_note` — but the seed ([migration/assets/schema/seed/910_seed_corpus.sql](migration/assets/schema/seed/910_seed_corpus.sql)) never writes `source_note`, and the filter keeps rows with **no** providerCode (`!s.providerCode || …`). Net: every case sees the same global top-8, interleaved across all providers.
2. **The corpus was built from a bad provider parse.** The (not-in-repo) preprocessor took the leading alpha of `Case ID`, so `a.qdos…` → provider "A" (~3,064 rows), `ap.qdos…` → "AP" (~1,590): QDOS/PCH sites are mis-attributed. Also: postcode variants (`B5 6JX` vs `B56JX`) split one site into duplicates; `InspLocName` site names are dropped; ~112 usable name+postcode-only rows excluded; the `"Image Based Asessment"` typo defeats the image-based drop (~97 junk rows). The API-side marker strip (`^(AP|A|D)\.`) is already in `inspection.ts`, but the **data** is still wrong.
3. **The pipeline isn't reproducible in-repo** — the old `dataverse/.build` preprocessor/CSV are gone. Source export confirmed at `docs/reference/fullevaexportinspectionaddresses.xlsx` (user-confirmed; ~17,737 rows; git-ignored — keep it out of history).
4. **Tier 3 can't actually read photos.** [functions/location-suggest/photo_source.py](functions/location-suggest/photo_source.py) ships `StubPhotoSource` (no live bytes) and a `BoxPhotoSource` that deliberately raises. So the live assist runs on **text clues only**. Also [functions/location-suggest/maps_client.py](functions/location-suggest/maps_client.py) does address search only — OCR'd **business names** (signage) don't geocode; and there is no AI reasoning tier for hard clues.
5. **TKT-062 residuals:** the empty-provider fallback still silently serves global rows (unlabelled), and no case-postcode/proximity signal exists in ranking.
6. **Minor:** the decision save upserts on `UNIQUE(label)`, so two cases confirming the same address share one row (per-case trace only via `source_note` + audit) — acceptable, but worth a note; provider `inspectionLocationPolicy` (always_image_based etc.) is in the corpus + mapper but not surfaced in the CaseDetail confirm path.

## Precondition (blocker)

**All terminal commands are currently blocked** — the `.cursor/hooks/cursor-box-scope-guard.mjs` hook times out (60s) and fails closed, rejecting every Shell call. Fix or disable that hook before implementation (nothing can build/test/deploy until then).

## Phase A — Rebuild the corpus pipeline (in-repo, reproducible)

New `scripts/inspection-corpus/` (Python, stdlib xlsx parsing) reading `docs/reference/fullevaexportinspectionaddresses.xlsx`:

- Marker-aware provider parse (`ap.qdos25448` → `QDOS`), VRM-shaped-ID exclusion, junk-ID drop.
- Deterministic postcode normalisation before dedup; dedup per (provider, normalised site); recompute frequency/last-seen/rank per provider.
- Carry site name into suggestion lines; keep name+postcode-only sites; typo-tolerant image-based/no-site drop.
- Emit a committed, PII-free CSV (no insured names/VRMs/claim numbers) + a per-provider run report (operator input for `always_image_based` policy designation — stats never auto-set policy, ADR-0016).
- Separate `geocode_sites.py` network step: postcodes.io bulk lookup → lat/lon per site.
- Additive DDL delta: `provider_code varchar(16)`, `latitude`/`longitude` on [migration/assets/schema/040_inspection_address.sql](migration/assets/schema/040_inspection_address.sql) + a dated delta file.
- New idempotent `920_replace_suggested_addresses.sql`: backup-first, replace only `source_label LIKE 'suggested%'`, write `provider_code` + lat/lon + a proper `source_note`, preserve confirmed rows.

## Phase B — Fix provider scoping + ranking in the Data API

In [api/src/functions/inspection.ts](api/src/functions/inspection.ts) + [api/src/lib/mappers.ts](api/src/lib/mappers.ts):

- Read the new `provider_code` column (fallback: note token/label prefix for legacy rows); scope server-side with `WHERE`.
- Kill the silent firehose/global fallback: unknown provider → small **labelled** global top-N, never unlabelled corpus rows (closes the TKT-062 residual).
- **Tier 2 proximity (ordering only):** extract a postcode from the case's `eva_accident_circumstances` / `eva_claimant_address` (deterministic regex, same shape as [functions/location-suggest/clue_extraction.py](functions/location-suggest/clue_extraction.py)), resolve centroid via postcodes.io (cached), blend distance into ordering + return a `distanceMiles` hint.
- Unit tests: scoping, marker parse, proximity blend, empty-provider behaviour, honest-empty preserved.

## Phase C — Make tier 3 actually see photos + find businesses

- **Photo source:** implement `BlobPhotoSource` (evidence bytes in Blob `cespkevidstdev01` via `evidence.storage_path`) with `BoxPhotoSource` (CCG content read, box-webhook pattern) as fallback for blob-purged rows; the API proxy enriches `photo_refs` with `storage_path`/`box_file_id` so the SPA contract is unchanged.
- **Signage lookup:** add Azure Maps fuzzy/POI search for OCR'd business names in [functions/location-suggest/maps_client.py](functions/location-suggest/maps_client.py); pass the provider's corpus sites as `corpus_match` candidates when a hit lands near one.
- Redeploy `cespkloc-fn-a7tzj2`; wire any new app settings.
- **UI:** auto-*run* the assist once when the corpus shortlist is empty and the case has photos (auto-suggest, never auto-apply); keep the button always available when gated on.

## Phase D — AI vision-reasoning escalation (tier 3b)

Per [docs/plans/phase-4-address-and-chaser/gpt4o-reasoning-escalation.md](docs/plans/phase-4-address-and-chaser/gpt4o-reasoning-escalation.md), as an escalation branch in the same Function:

- Reuse the deployed AOAI (`digital-3339-resource`, `gpt-5` already live per the registry); structured outputs, temperature 0, ≤3–4 photos, "only report what is visibly evidenced".
- Own gate `LOCATION_ASSIST_AI_ENABLED` + per-case/per-day caps + spend telemetry; candidates re-geocoded via Maps with `ai_reasoning` provenance.
- UI: reviewer-pressed "Try a deeper photo-based suggestion" when the deterministic tier is weak.
- Operator: production AI sign-off per docs/gated.md E2.

## Phase E — UI polish + provider policy

- Plumb the provider's real `inspectionLocationPolicy` into the CaseDetail address flow: an "Image Based Assessment (provider default)" chip for operator-designated `always_image_based` providers (surfaced, never auto-applied); `required_address` keeps the audited-override semantics.
- Suggestion rows: distance hint, provider chip, capped list with "show more".

## Phase F — Reseed live, deploy, verify, document

- Backup live `inspection_address` → apply DDL delta → run replace seed → verify per-provider counts + confirmed rows preserved → deploy API + SPA + Function → smoke-test one case per major provider (QDOS, PCH, QCL, FW) + one assist run on a photo case.
- Update [docs/architecture/inspection-address-corpus.md](docs/architecture/inspection-address-corpus.md) (new in-repo pipeline + marker rule), ADR-0016 note, `LIVE_FACTS.json` + live-environment mirror, docs/gated.md; short ADR note that auto-*suggest* on corpus miss stays within ADR-0013; close/annotate TKT-062 residuals.
- `node verify-all.mjs` green.

## Checklist

- [ ] Unblock the environment: fix/disable the failing `cursor-box-scope-guard` hook so terminal commands run
- [ ] Phase A: in-repo preprocessor (marker-aware provider parse, postcode normalisation, site names, typo-tolerant filters, dedup+rank, PII-free CSV + report)
- [ ] Phase A: geocode corpus sites via postcodes.io bulk; lat/lon into the seed CSV
- [ ] Phase A: additive DDL (provider_code, lat, lon) + 920 replace-suggestions seed preserving confirmed rows
- [ ] Phase B: server-side provider scoping via provider_code, labelled fallback (no firehose), tests
- [ ] Phase B: accident/claimant postcode extraction + centroid cache + distance-blended ordering + distanceMiles hint
- [ ] Phase C: BlobPhotoSource + BoxPhotoSource; proxy enriches photo_refs with storage_path/box_file_id
- [ ] Phase C: Azure Maps fuzzy/POI search for signage business names + corpus_match candidates; redeploy fn
- [ ] Phase C: auto-run assist on corpus miss (auto-suggest only); keep button visible
- [ ] Phase D: AI vision-reasoning escalation branch (AOAI gpt-5, structured outputs, gate + caps + telemetry)
- [ ] Phase E: provider inspectionLocationPolicy plumb + suggestion-row hints (distance, provider, show-more)
- [ ] Phase F: backup, apply DDL + reseed live, deploy API/SPA/Function, per-provider smoke tests
- [ ] Phase F: update corpus doc, ADR-0016 note, LIVE_FACTS + mirror, gated.md, TKT-062 residuals, verify-all green
