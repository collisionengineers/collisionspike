# Changes — TKT-077: photo-aware location assist

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
The Data API proxy (`proxy.ts`) resolves the case's evidence bytes inline via the shared `services/data-api/src/features/evidence/bytes.ts` (blob→Box-facade, capped) and passes `image_base64` on `photo_refs`; a new Python `InlinePhotoSource` decodes them — the live assist now reads real photos without a Box grant. `maps_client.search_poi` (fuzzy) resolves signage business names; CaseDetail auto-runs the assist once on a corpus miss (suggest-only). Deployed: location fn (Oryx) + api + SPA.
