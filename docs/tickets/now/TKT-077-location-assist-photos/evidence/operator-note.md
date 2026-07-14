# Operator plan excerpt — Phase C: Make tier 3 actually see photos + find businesses

> From `PLAN-inspection-address-repair.md` (investigation/planning session 2026-07-06). The full
> plan is preserved at
> [TKT-075 evidence](../../../done/TKT-075-inspection-corpus-pipeline/evidence/operator-note.md).

Root cause this phase closes (verified): **Tier 3 can't actually read photos.**
`functions/location-suggest/photo_source.py` ships `StubPhotoSource` (no live bytes) and a
`BoxPhotoSource` that deliberately raises. So the live assist runs on **text clues only**. Also
`functions/location-suggest/maps_client.py` does address search only — OCR'd **business names**
(signage) don't geocode; and there is no AI reasoning tier for hard clues.

(Context: Function `cespkloc-fn-a7tzj2` is deployed and gated ON — 03/07:
`LOCATION_ASSIST_ENABLED`/`AZURE_MAPS_ENABLED`=true, Maps `cespkmaps-dev` + Vision
`cespkvision-dev` provisioned — invoked via the "Suggest location" button in
`mockup-app/src/screens/CaseDetail.tsx` through the API proxy `api/src/functions/proxy.ts`.)

Plan:

- **Photo source:** implement `BlobPhotoSource` (evidence bytes in Blob `cespkevidstdev01` via
  `evidence.storage_path`) with `BoxPhotoSource` (CCG content read, box-webhook pattern) as
  fallback for blob-purged rows; the API proxy enriches `photo_refs` with
  `storage_path`/`box_file_id` so the SPA contract is unchanged.
- **Signage lookup:** add Azure Maps fuzzy/POI search for OCR'd business names in
  `maps_client.py`; pass the provider's corpus sites as `corpus_match` candidates when a hit
  lands near one.
- Redeploy `cespkloc-fn-a7tzj2`; wire any new app settings.
- **UI:** auto-*run* the assist once when the corpus shortlist is empty and the case has photos
  (auto-suggest, never auto-apply); keep the button always available when gated on.

ADR-0013 stays intact: suggestion-generation only; a human always confirms.
