# Changes — TKT-124: Photo orderer must list images only

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch), incl. a live data backfill. Root cause
found and fixed at the writer.

## Root cause (found live)
**`functions/box-webhook/data_api_client.py` hardcodes `evidenceClass: "image"` for EVERY Box
FILE.UPLOADED row** — so every PDF letter, .doc instruction, .eml message, .txt and .mp4 video
mirrored through Box landed in `evidence` with `kind_code=image` + `accepted_for_eva=true`. That is
why ".eml files showed in the photo orderer" (and why the first TKT-126 zip export picked up
PDFs/videos). Live count before the fix: **402 rows** whose kind said image but whose name+type
said otherwise (a further ~2k jpg-named Box mirrors with NULL content_type are genuine photos and
were left as images).

## What was built (three layers)
1. **Writer guard (future rows)** — `api/src/functions/internal.ts` (internal evidence persist
   route): a row claiming `evidenceClass='image'` is re-derived through the shared domain
   classifier (`describeEvidence`, extension-primary/MIME-fallback — the same table intake uses);
   an honest `image/*` MIME keeps off-table image types (e.g. .tiff). Explicit non-image classes
   are honoured as supplied. Fixes every future box-webhook row WITHOUT touching the retained
   Python Function.
2. **Data backfill (existing rows)** —
   `migration/assets/schema/deltas/2026-07-09-tkt124-rekind-box-evidence.sql`, applied live
   (csadmin; transient FW rule added+removed; **backup CSV of all re-kinded rows kept at
   `evidence/rekind-backup-2026-07-09.csv`**): 402 rows re-kinded image→instruction(233-ish)/
   email/other per the domain mapping; verify query returns **0 still-mislabelled**.
3. **SPA belt-and-braces** — `mockup-app/src/screens/CaseDetail.tsx`: the photo working set now
   filters the fetched evidence to `kind === 'image'` before it can reach the photo grid or
   `ImageOrderList` (kind/MIME-based, never filename); non-image artifacts stay in the Documents
   list (which renders every non-image/video kind). Also fixed while there: `imgState` now re-seeds
   when the fetched image set changes (the old `useState(images)` never adopted a fetch that landed
   after mount — a latent blank-photos race).

## Deploy + live proof
api republished; SPA deployed. Live on case `2e4497d7-…` (A.QDOS26035 — previously polluted): the
photo orderer lists **8 entries, zero non-image**; the .eml/.pdf/.doc/.mp4 rows now sit in the
Documents list; the re-exported EVA zip contains photos only (see TKT-126 evidence). DB verify:
0 mislabelled image-kind rows remain.

## Remainders / suggested follow-up
- The box-webhook Python Function still SENDS `evidenceClass='image'`; the API guard corrects it.
  A tidy-up ticket could fix the Python client too (cosmetic once the guard exists).
- Duplicate evidence rows (same file persisted once from the email and once from the Box mirror)
  showed up in the EVA order as repeated photos — pre-existing, out of scope here; suggest a new
  dedup ticket (sha256 exists per row).
