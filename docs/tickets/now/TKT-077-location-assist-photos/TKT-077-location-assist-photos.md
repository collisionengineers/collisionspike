---
id: TKT-077
title: Location assist can't see the case photos — real photo bytes + signage business lookup
status: now
priority: P1
area: ai
tickets-it-relates-to: [TKT-048, TKT-062, TKT-076, TKT-078]
research-link: docs/tickets/now/TKT-077-location-assist-photos/evidence/operator-note.md
---

# Location assist can't see the case photos — real photo bytes + signage business lookup

## Problem

The "Suggest location" assist is deployed and gated ON (Function `cespkloc-fn-a7tzj2`,
`LOCATION_ASSIST_ENABLED`/`AZURE_MAPS_ENABLED` true, Maps + Vision provisioned) — but it runs
on **text clues only**, because it can't actually fetch a photo:

- `functions/location-suggest/photo_source.py` ships a `StubPhotoSource` (returns no live
  bytes) and a `BoxPhotoSource` that **deliberately raises** — so Vision OCR never sees an
  image.
- Even when OCR runs, `functions/location-suggest/maps_client.py` does **address search
  only** — an OCR'd **business name** from signage ("Halfords Autocentre") doesn't geocode, so
  the strongest photo clue is discarded.

Net: for the common hard case (photos of a repairer's yard, no address in the text), the assist
returns nothing useful.

## Evidence

- `evidence/operator-note.md` — plan Phase C + root cause 4 (2026-07-06 investigation).
- `functions/location-suggest/photo_source.py` — stub + raising Box source.
- `functions/location-suggest/maps_client.py` — address-only search.
- Byte-path prior art: `GET /api/evidence/{id}/content` (TKT-048) already resolves blob-first /
  Box-fallback bytes; the box-webhook Function holds the Box content-read pattern.
- Invocation path: `mockup-app/src/screens/CaseDetail.tsx` → API proxy
  (`api/src/functions/proxy.ts`) → the Function.

## Proposed change

PROPOSED (not built) — suggestion-generation only, ADR-0013 intact (auto-*suggest*, never
auto-apply; a human always confirms):

- **Real photo sources**: implement `BlobPhotoSource` (evidence bytes from Blob
  `cespkevidstdev01` via `evidence.storage_path`) with `BoxPhotoSource` (Box content read,
  box-webhook pattern) as the fallback for blob-purged rows. The API proxy enriches
  `photo_refs` with `storage_path`/`box_file_id` so the SPA contract is unchanged.
- **Signage lookup**: add Azure Maps fuzzy/POI search for OCR'd business names in
  `maps_client.py`; when a POI hit lands near a provider corpus site, surface that site as a
  `corpus_match` candidate.
- **Redeploy** `cespkloc-fn-a7tzj2`; wire any new app settings (documented in gated.md if
  operator-held).
- **UI**: auto-**run** the assist once when the corpus shortlist is empty and the case has
  photos (auto-suggest, never auto-apply); the button stays available whenever the gate is on.
  A short ADR note records that auto-suggest on corpus miss stays within ADR-0013 (Phase F /
  TKT-080 docs work).

## Acceptance

- [ ] For a case with blob-backed photos, the assist OCRs real image bytes (telemetry shows a
      non-stub photo source and a Vision call with image input).
- [ ] For a box-only-evidence case, the Box fallback supplies the bytes.
- [ ] An OCR'd business name yields Maps POI candidates; a POI near a provider corpus site is
      returned as a `corpus_match` candidate.
- [ ] The SPA contract is unchanged (same request/response shape through the proxy) and the
      assist auto-runs once on corpus-miss + photos, without auto-applying anything.
- [ ] All candidates remain suggestions requiring human confirmation; "Image Based Assessment"
      still requires a reason (ADR-0013).

## Verification requirements (proof standard)

1. **Offline tests** — Python unit tests for both photo sources (mocked blob/Box clients),
   the POI search parsing, and the corpus_match proximity rule; existing text-clue tests stay
   green.
2. **Gate** — `node verify-all.mjs` green; Function redeploy + any app settings recorded in
   [changes.md](./changes.md).
3. **Live E2E probe (photo path)** — run the assist on a real photo case and capture: the
   Function telemetry showing bytes fetched (source: blob or Box) + Vision OCR output, and the
   returned candidates in the SPA. Record in [verification.md](./verification.md).
4. **Live E2E probe (signage path)** — one case whose photos carry a legible business name:
   show the POI-derived candidate (and `corpus_match` if applicable) in the response.
5. **Auto-run proof** — a corpus-miss photo case shows the assist ran once automatically
   (telemetry + UI state), and nothing was auto-applied to the case record (Postgres check).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Phase C); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

## Reopened follow-up — 2026-07-14

Independent PLAN-005 verification found that the deployed byte/Vision/Maps path works, but the explicit
provider-corpus proximity branch was never implemented and Azure Maps dependency telemetry records a
subscription key in the request URL.

### Acceptance

- Trusted provider sites enter the backend request and a nearby provider-site result is emitted as
  `corpus_match`; the value is produced by backend code, not only declared in UI types/docs.
- Non-sensitive telemetry distinguishes Blob and Archive byte sources without recording case, file,
  credential or content identifiers.
- Maps dependency logging never records credentials or secret-bearing query strings; the exposed Maps key
  is rotated and all consumers use the replacement through the approved secret path.
- Focused tests cover provider-site proximity, `corpus_match`, source labels and telemetry redaction.
- After deployment, one legitimate Blob-backed case and one Archive-only case prove the path through the
  signed-in SPA; no address is auto-applied, and Image Based Assessment still requires a reason.

Evidence: [PLAN-005 reopen follow-up](./evidence/reopen-followup-2026-07-14.md).
- [Operator note (excerpt)](./evidence/operator-note.md)
