# PDF image extraction research

## Ticket

`../pdf-image-extraction.md` asks the intake pipeline to extract vehicle images embedded in emailed PDFs and to identify unsuitable image sets, especially the supplied PDF where none of the images show a visible registration.

The sample folder contains the ticket stub plus real-looking source fixtures:

- `IMAGES - CVD.pdf`
- `Instruct Engineer - ALS.DOC`
- `New Inspection Instruction.eml`

## Current state

The project already contains a local image-extraction helper in the vendored parser engine. `DocumentMapperService.extract_images()` reads PDF bytes, uses PyMuPDF first (`page.get_images()` and `doc.extract_image()`), falls back to `pypdf`, and also supports DOCX/DOC media extraction. Evidence: `functions/parser/cedocumentmapper_v2/application/service.py:343-419`.

That helper is not exposed by the live parser Function. The live parser app exposes only `parse` and `classify_email`; read-only Azure check:

```text
az functionapp function list -g rg-collisionspike-dev -n cespike-parser-dev-x7xt3d5ovhi7y ...
cespike-parser-dev-x7xt3d5ovhi7y/classify_email
cespike-parser-dev-x7xt3d5ovhi7y/parse
```

The helper also writes extracted files to a local output folder (`create_output_subfolder_from_fields()`), not to the evidence Blob container or Postgres. That is useful for desktop tooling but not yet an intake pipeline.

The live orchestration path lands Graph file attachments to Blob, then persists evidence rows:

- `fetchMessage` fetches message attachments and writes each file to Blob with a deterministic `{messageId}/{filename}` path: `orchestration/src/functions/activities/fetchMessage.ts:63-75`, `orchestration/src/lib/blob.ts:70-86`.
- `classifyPersist` classifies only the original email attachments by filename/MIME and persists rows through the Data API: `orchestration/src/functions/activities/classifyPersist.ts:26-62`.
- Attachment classification treats `.pdf/.docx/.doc` as `instruction`, not image: `packages/domain/src/domain/classification.ts:29-38`.
- The Data API evidence insert only stores filename, kind, content type, size, storage path, and source label for email/orchestration rows: `api/src/functions/internal.ts:535-617`.

The live OCR Function already has the plate-reading route needed for the visible-registration check. Read-only Azure check:

```text
az functionapp function list -g rg-collisionspike-dev -n cespkocr-fn-dev-glju3v ...
cespkocr-fn-dev-glju3v/ocr_pdf
cespkocr-fn-dev-glju3v/plate_ocr
```

The `plate_ocr` route is documented as returning `plate_text`, `registration_visible`, and `vrm_match`: `ocr/function_app.py:16-24`. Its tests cover plate found, mismatch, no plate, bad input, and double-base64 handling: `ocr/tests/test_ocr.py:232-443`.

## Why the gap happens

1. PDF attachments are currently persisted as instruction evidence. No step expands embedded PDF images into separate image evidence rows.
2. The parser has extraction code, but only as a local service helper. It is not a Function route and does not return bytes/metadata to orchestration.
3. `classifyPersist` receives only the original attachment list. There is no child artifact contract such as `derivedFromEvidenceId`, `parentBlobPath`, `page`, or `imageIndex`.
4. `internalCasesEvidence` cannot currently persist extracted-image metadata such as `image_role_code`, `registration_visible`, `accepted_for_eva`, `excluded`, `exclusion_reason`, `sha256`, or `sequence_index` for email/orchestration rows.
5. The UI can display and locally edit image role/exclusion state, but there is no API route in `api/src/functions/cases.ts` for persisting those image edits. The only public image route is read-only `GET /api/cases/{id}/images`: `api/src/functions/cases.ts:430-443`.

## Domain constraints

The stub says the sample PDF contains unsuitable images because none show a registration. That should be handled as an image-set readiness problem, not as blanket rejection of every extracted image.

The canonical image rules require:

- at least two accepted images,
- at least one overview image with the registration visible,
- at least one damage close-up.

Evidence: `packages/domain/src/contracts/image-rules.ts:8-16`, `packages/domain/src/contracts/image-rules.ts:78-107`. A damage close-up can be valid even when the registration is not visible; the case is still not EVA-ready until one accepted overview has a visible registration.

The evidence schema already has most of the target fields:

- `image_role_code`
- `registration_visible`
- `accepted_for_eva`
- `excluded`
- `exclusion_reason`
- `sequence_index`
- `sha256`
- `source_label`

Evidence: `migration/assets/schema/060_evidence.sql:9-32`.

The current frontend maps those fields into `Evidence`: `api/src/lib/mappers.ts:243-256`. Case detail uses them for role badges, registration visibility, accepted image counts, and exclusions: `mockup-app/src/screens/CaseDetail.tsx:426-468`, `mockup-app/src/screens/CaseDetail.tsx:984-986`.

## Microsoft Learn / Graph facts

Microsoft Learn confirms a Graph `fileAttachment` is a message/event/post attachment with `name`, `contentType`, `size`, `isInline`, and base64 `contentBytes`. Source: https://learn.microsoft.com/graph/api/resources/fileattachment?view=graph-rest-1.0

This matches the current `getMessageWithAttachments()` implementation, which keeps only non-inline file attachments with `contentBytes`: `orchestration/src/lib/graph.ts:127-134`. The extraction should therefore sit after `fetchMessage` has landed the original PDF bytes, not in the Graph webhook.

## Recommended resolution

1. Add an extraction step after case resolution and before/inside evidence persistence for instruction PDFs.
   - Input: original PDF blob path, filename, content type, case id, source message id, case VRM.
   - Output: original evidence row plus zero or more extracted image descriptors.

2. Expose image extraction through a stable server-side boundary.
   - Either add a parser Function route such as `/extract-images`, or add an orchestration-side helper that calls the parser engine code where it can access the PDF bytes.
   - Return image bytes plus metadata, not local file paths. Minimum metadata: parent filename/blob path, page number, image index, extension/content type, byte size, sha256.

3. Persist each extracted image as image evidence.
   - Store extracted bytes in Blob under a deterministic child path, for example `{messageId}/{pdfBaseName}/page-{n}-image-{m}.{ext}`.
   - Insert evidence rows with `kind=image`, `source_label` like `extracted from {pdf filename}, page {n}`, `sha256`, `storage_path`, and default `image_role=unknown`.
   - Keep the original PDF as instruction evidence.
   - Add a schema column or side table for parent-child provenance if the file path/source label is not enough for later audit.

4. Run visible-registration detection on extracted images.
   - Call the existing OCR `plate_ocr` route with the case VRM when available.
   - Persist `registration_visible=true` only when the route finds the case registration; if it sees a different plate, keep the image reviewable and record the mismatch in an audit/improvement signal rather than silently accepting it.
   - Leave role tagging manual in the first pass, matching ADR-0009: OCR-for-registration first, overview/damage role classification later. Evidence: `docs/adr/0009-image-ai-ocr-m1-classification-m2.md:9-15`.

5. Mark unsuitable image sets at case level.
   - Do not reject all extracted images just because no registration is visible.
   - Let the image rules report the missing overview-with-registration condition.
   - Add plain handler-facing copy such as "A photo showing the registration is still needed" rather than implementation terms.

6. Add an API write path for image review edits if not already hidden elsewhere.
   - Persist image role, accepted-for-EVA, exclusion, exclusion reason, and sequence order.
   - Re-run status readiness after image metadata changes.

## Tests to add

1. Parser/unit tests for `extract_images()` with `IMAGES - CVD.pdf`, asserting extracted count, filenames/extensions, and stable page/image metadata.
2. Orchestration unit tests for a PDF attachment that yields child image rows while keeping the parent PDF instruction row.
3. API tests that `internalCasesEvidence` can persist extracted image metadata and dedupe by child storage path or sha256.
4. OCR integration tests that extracted bytes are sent to `plate_ocr` and `registration_visible` is persisted.
5. Domain/readiness tests for the sample condition: extracted images exist, none have visible registration, and the case fails only `missing_overview` until a registration-visible overview is added.
6. UI tests for saving handler edits to image role/exclusion/order once an API write route exists.

## Live-state notes

Read-only Azure checks used in this research:

- Azure MCP `functionapp_get` confirmed `cespk-orch-dev` is running in `rg-collisionspike-dev`.
- Azure MCP `functionapp_get` confirmed `cespike-parser-dev-x7xt3d5ovhi7y` is running in `rg-collisionspike-dev`.
- Azure CLI function listing confirmed the parser has no image-extraction route.
- Azure CLI function listing confirmed the OCR app exposes `ocr_pdf` and `plate_ocr`.
- Azure CLI app-setting-name listing for `cespk-orch-dev` showed no `OCR` or `PLATE` gate names on orchestration at the time of research.

Six read-only worker agents were started for this folder, but all remained running without producing final findings and were interrupted after timeout. The conclusions above are based on direct repo inspection, Microsoft Learn, Azure MCP, and read-only Azure CLI output.
