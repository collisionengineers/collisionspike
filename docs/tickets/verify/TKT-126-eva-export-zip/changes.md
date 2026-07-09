# Changes — TKT-126: "Export for EVA" downloads one .zip (JSON + all included images)

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch).

## What was built

**New — `mockup-app/src/screens/eva-export-zip.ts`** (pure, unit-tested): the zip MANIFEST layer —
`buildEvaZipImageSpecs` names each member `NNN-<original name>` so a plain filename sort reproduces
the EVA photo order; `orderEntriesByKeys` re-applies the reviewer's drag order from the on-screen
photo orderer (stale/partial captures can never DROP a photo — uncovered entries append in seed
order); `evaExportBaseName` (EVA-<Case/PO>). The ORDER itself is `buildEvaImageOrder`
(ImageOrderList.tsx): 2 previews first — overview-with-registration then main-damage closeup — then
ALL accepted photos in sequence INCLUDING those two again; excluded images never ship.
**New — `eva-export-zip.test.ts`**: pins the preview-repeat rule, the sortable numeric naming, the
excluded/not-accepted absence, name sanitisation, and the drag-order re-application.

**Edited — `mockup-app/src/screens/CaseDetail.tsx`**:
- "Export for EVA" now builds ONE `.zip`: the canonical 12-field EVA JSON (`buildEvaJson`,
  byte-identical to the submit flow) + every included image fetched through the authenticated seam
  (new `evidenceContentBlob` on `DataAccessExt` — the content route's bytes as a Blob; fetching a
  `blob:` URL would need `connect-src blob:`, which the CSP does not grant), packed client-side
  with **fflate** (bundled npm dep — no CDN, CSP-safe; `zipSync` level 0, photos are already
  compressed). Duplicate preview slots reuse one fetch. Button shows Exporting…/spinner.
- **Honest failure**: if ANY photo's bytes are unavailable the export cancels with a toast naming
  the files — never a silently-partial zip (EVA needs the complete set).
- `ImageOrderList` is now wired with `onOrderChange`, so a reviewer's drag order feeds the zip.
- **Recorded choice**: the separate JSON-only download is REPLACED — the JSON travels inside the
  zip (one artifact, per the operator ask). No caller depended on the bare .json.

**Seam** — `mockup-app/src/data/rest-client.ts` (+ mock-source): `evidenceContentBlob(id)`.

## Deploy + live proof
SPA deployed. Live export on `A.QDOS26035` (ready_for_eva): one zip,
`EVA-A.QDOS26035.zip` = `EVA-A.QDOS26035.json` + photos `001-…` → `008-…` in EVA order (previews
first, repeated in the full sequence), zero non-image members. NOTE: the FIRST live export exposed
PDFs/.doc/.mp4 riding in as "images" — root-caused and fixed under TKT-124 (box-webhook kind
hardcode; re-kind delta + API guard), after which the re-export was clean. Listing of both zips:
`evidence/live-zip-contents-2026-07-09.txt`.

## Remainders
- Duplicate photo rows (email original + Box mirror of the same file) duplicate in the sequence —
  pre-existing data issue flagged under TKT-124's remainders (suggest a dedup ticket).
- Very large cases fetch sequentially (simple + gentle on the API); parallelise later if exports
  feel slow.
