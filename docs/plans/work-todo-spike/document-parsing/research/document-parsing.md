# Document parsing research

## Ticket

Source stub: `docs/plans/work-todo-spike/document-parsing/document-parsing.md`

The ticket says extraction is still not fully functional, "only really getting registration", and asks for support across PDF, `.doc`, `.docx`, `.eml`, and `.msg`.

## Summary

The symptom is real, but it is not one parser bug. The automated intake path is currently wired to the wrong parser contract: orchestration posts `{ caseId }` to `/api/parse`, while the Python parser requires base64 `document` bytes plus `filename`. The parser returns `400 missing_document`, and orchestration treats any 4xx as a graceful skip. That leaves only pre-parse VRM sniffing from the email subject/body, which matches the reported "only registration" outcome.

Even if parsing succeeded, there is no evident automated path that applies parser output back to `case_.eva_*`, `vrm`, `case_ref`, or `field_level_provenance`. Manual intake does have a parser adapter, but it can mis-handle skipped or incomplete parser responses.

The parser adapter does dispatch all requested suffixes, but support is uneven:

- PDF and DOCX have real reader paths and some smoke fixtures.
- `.doc` depends on best-effort binary text scraping or external conversion tools that may not exist on Linux Functions.
- `.eml` and `.msg` readers parse headers/body and attachment names, not the attached instruction document bytes.
- Graph intake currently drops item attachments and does not make `.msg` a parse candidate.

## Primary cause: automated intake calls the wrong parser contract

The parser Function contract is explicit:

- `functions/parser/function_app.py:171-180` requires JSON body fields `document`, `filename`, and optional `provider_hint`.
- `functions/parser/function_app.py:182-196` base64-decodes `document` and calls `parser_adapter.run_parser(document_bytes, filename, provider_hint)`.
- `functions/parser/function_app.py:236-244` returns an envelope with `extraction`, top-level `vrm`, top-level `reference`, `audit`, `issues`, and `contract_version`.

The automated orchestration does not send that contract:

- `orchestration/src/functions/activities/parse.ts:17-30` accepts only `{ caseId }` and posts `JSON.stringify({ caseId: input.caseId })` to `/api/parse`.
- `orchestration/src/functions/activities/parse.ts:32-40` treats any parser 4xx as a non-retryable skip.
- `orchestration/src/lib/functions-client.ts:55-57` has the same wrong helper contract, `callParser(caseId)` -> `{ caseId }`.

This explains the ticket symptom:

- `orchestration/src/functions/activities/fetchMessage.ts:84-85` sniffs `candidateVrm` from subject/body before parsing.
- `orchestration/src/functions/activities/caseResolve.ts:34-44` passes that pre-parse `candidateVrm` into dedup/case creation.
- `api/src/functions/internal.ts:355-370` persists the case shell using `inbound.candidateVrm`.
- No other parsed fields can be populated because the parser call has skipped.

## Secondary cause: parser output is not applied to cases

Evidence persistence exists, but parser-result persistence does not:

- `orchestration/src/functions/intakeOrchestrator.ts:70-77` runs `classifyPersist`, then calls `parse`, then calls `statusEvaluate`.
- `orchestration/src/functions/activities/classifyPersist.ts:30-61` persists evidence rows via `dataApi.persistEvidence`.
- `api/src/functions/internal.ts:535-617` stores evidence rows idempotently by storage path or Box file id.
- `api/src/lib/mappers.ts:115-128` maps EVA field keys to `case_` columns, proving where parser fields must eventually land.
- `api/src/lib/mappers.ts:147-162` assembles EVA fields from `case_` plus `field_level_provenance`.
- A scan of `api/src` and `orchestration/src` found parser clients and evidence/status routes, but no internal route that applies parser `extraction` to the existing case.

Manual case creation writes fields:

- `api/src/functions/cases.ts:195-283` builds a manual case insert/update path with EVA field columns and audit.

Automated email intake currently creates a shell and evidence, but does not use parser output to fill the case fields.

## Format support and limitations

### Adapter support

- `functions/parser/parser_adapter.py:140-142` supports `.pdf`, `.docx`, `.doc`, `.eml`, and `.msg`.
- `functions/parser/parser_adapter.py:197-235` writes decoded bytes to a temp file with the original suffix, then calls `DocumentMapperService.process_document`.
- `functions/parser/cedocumentmapper_v2/readers/__init__.py:25-37` dispatches the same suffixes to PDF, DOCX, DOC, and email readers.

### PDF

- `functions/parser/cedocumentmapper_v2/readers/pdf.py` is the main PDF reader path.
- `functions/parser/README.md:152` documents that true OCR is constrained on the FC1 runtime because the Tesseract binary is not available.
- The local smoke suite has one PDF fixture: `functions/parser/tests/fixtures/instructions/ACSP SCAN 01.pdf`.

Implication: selectable-text PDFs are plausible; image-only scanned PDFs remain weak unless a separate OCR path is wired.

### DOCX

- `functions/parser/cedocumentmapper_v2/readers/docx.py:50-80` reads headers, body paragraphs, tables, textboxes, and footers.
- `functions/parser/tests/fixtures/instructions/ACSP DOCX 01.docx` and `functions/parser/tests/fixtures/instructions/ALISON WORD 01.docx` are covered by smoke goldens.

DOCX is the best-supported Word format.

### DOC

- `functions/parser/cedocumentmapper_v2/readers/doc.py:29-68` tries binary/OLE text scraping, Word COM automation, LibreOffice conversion, and antiword.
- `functions/parser/cedocumentmapper_v2/readers/doc.py:70-75` depends on `pywin32` for Word COM, which is Windows-only.
- `functions/parser/cedocumentmapper_v2/readers/doc.py:156-185` depends on `soffice`/LibreOffice or `antiword` binaries if text scraping is insufficient.
- `functions/parser/requirements.txt:28` includes Python packages, not external LibreOffice/antiword binaries.

Implication: `.doc` support is best-effort on Linux Functions unless the deployment image explicitly includes a conversion binary or the parser routes legacy DOCs to review.

### EML and MSG

- `functions/parser/cedocumentmapper_v2/readers/email.py:20-40` defines `.eml` and `.msg` readers.
- `functions/parser/cedocumentmapper_v2/readers/email.py:79-142` parses `.eml` headers/body and appends attachment names.
- `functions/parser/cedocumentmapper_v2/readers/email.py:144-248` parses `.msg` headers/body and appends attachment names.
- The reader skips actual attachment bytes; it does not recursively parse the instruction PDF/DOC/DOCX inside the email.

Implication: `.eml`/`.msg` support means "parse email text" today, not "parse the instruction documents attached to an email file." If the provider's details are inside the nested attachment, the current reader will be sparse.

## Graph and intake attachment gaps

Current Graph intake does not fetch every parseable source:

- `orchestration/src/lib/graph.ts:127-133` loads one `/attachments` page and keeps only non-inline attachments with `contentBytes`.
- That filter drops Graph item attachments, which are how attached messages can arrive.
- Microsoft Learn says Graph attachments can be `fileAttachment`, `itemAttachment`, or `referenceAttachment`, and file or item attachments can be fetched as raw contents with `/$value`: https://learn.microsoft.com/graph/api/attachment-get?view=graph-rest-1.0
- Microsoft Learn says `fileAttachment.contentBytes` is base64 file content: https://learn.microsoft.com/graph/api/resources/fileattachment?view=graph-rest-1.0
- Microsoft Learn says item message attachments fetched as `/$value` return MIME, which can be saved as `.eml`: https://learn.microsoft.com/graph/api/attachment-get?view=graph-rest-1.0

Attachment classification also blocks some requested formats:

- `packages/domain/src/domain/classification.ts:30` maps common instruction documents but does not classify `.msg` as a parseable instruction candidate.
- `.eml` is treated as email evidence, not as an instruction candidate, even though the parser can read `.eml`.

There is also a collision risk:

- `orchestration/src/functions/activities/fetchMessage.ts:70-75` stores attachments by message id and filename.
- `orchestration/src/lib/blob.ts` uses deterministic paths based on message id and filename.
- `api/src/functions/internal.ts:600-610` dedupes evidence rows by `storage_path`.

If an email has duplicate filenames, the later upload can overwrite the earlier blob and collapse to one evidence row.

## Manual intake behavior

Manual intake has a separate parser flow through the API proxy:

- `api/src/functions/proxy.ts:39-56` exposes `POST /api/parser/parse`, gated by `PDF_MAPPER_ENABLED`, then forwards the request body to the parser.
- `api/src/lib/functions-client.ts:40-48` forwards the caller's body to `/api/parse`.
- `mockup-app/src/data/parser-client.ts` maps parser output into SPA state.

But it can still hide incomplete or skipped responses:

- `api/src/functions/proxy.ts:45-55` returns HTTP 200 `{ skipped: true }` when the gate is off or the proxy catches parser failure.
- The parser intentionally returns HTTP 200 with field-level schema issues for incomplete extraction, not as a transport failure. Evidence: `functions/parser/function_app.py:220-235`.
- Manual intake should treat "unreadable/unsupported/parser unavailable" differently from "partial extraction with missing fields." Partial extraction should open review with missing fields visible.

## Tests and fixture gaps

Existing coverage:

- `functions/parser/tests/test_parse.py:1` tests the HTTP handler contract but monkeypatches `parser_adapter.run_parser`, so it does not exercise readers or extraction rules.
- `functions/parser/tests/test_engine_smoke.py:1` is the real engine smoke harness.
- `functions/parser/tests/fixtures/instructions/` contains only:
  - `ACSP SCAN 01.pdf`
  - `ACSP DOCX 01.docx`
  - `ALISON WORD 01.docx`
- `functions/parser/tests/fixtures/expected/ACSP_SCAN_01.expected.json`, `ACSP_DOCX_01.expected.json`, and `ALISON_WORD_01.expected.json` assert only three real parser goldens.
- `functions/parser/tests/test_double_encoding.py` covers base64 tolerance for PDF/DOCX/DOC magic bytes, but does not prove `.eml` or `.msg` extraction quality.
- `functions/parser/tests/test_email_classifier.py` covers email triage, not `/api/parse` document extraction.

Unused corpus:

- `test-cases-and-data/` contains many raw PDFs, DOCs, EMLs, and MSGs that are not wired into smoke goldens.
- `test-cases-and-data/e-mail-examinations/devnotes.md:24` notes a registration false-positive class: registrations may be picking up partial postcodes.
- `test-cases-and-data/e-mail-examinations/oakwood1/issues.txt:1` says registration shows as `G3` in the inbox and not in the case.

Regression coverage should be added before rewriting rules so fixes do not regress across providers.

## Live Azure read-only checks

Read-only Azure CLI checks were run on 2026-06-29:

- `az functionapp list -g rg-collisionspike-dev --query "[].{name:name,state:state,kind:kind}" -o table`
  - Found parser app `cespike-parser-dev-x7xt3d5ovhi7y` running.
  - Also found `cespk-orch-dev` and `cespk-api-dev` running.
- `az functionapp function list -g rg-collisionspike-dev -n cespike-parser-dev-x7xt3d5ovhi7y --query "[].name" -o tsv`
  - Deployed parser functions are `classify_email` and `parse`.
- `az functionapp function list -g rg-collisionspike-dev -n cespk-orch-dev --query "[].name" -o tsv`
  - Deployed orchestration includes `fetchMessage`, `classifyInbound`, `caseResolve`, `classifyPersist`, `parse`, and `statusEvaluate`.
- `az functionapp config appsettings list -g rg-collisionspike-dev -n cespk-orch-dev --query "[?contains(name, 'PARSER') || contains(name, 'PDF') || contains(name, 'EVIDENCE')].{name:name,value:value}" -o table`
  - `PDF_MAPPER_ENABLED` is `true`.
  - `PARSER_FN_URL` points to `https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net`.
  - `PARSER_FN_KEY` is Key Vault referenced.
  - Evidence blob settings are present.

Note: the short name `cespike-parser-dev` was not found directly in Azure; the live resource name includes the suffix `-x7xt3d5ovhi7y`.

## What changes would resolve it

1. Fix the automated parse activity contract.
   - Select parseable instruction evidence from the inbound envelope or evidence rows.
   - Download Blob bytes.
   - Base64 encode bytes and call `/api/parse` with `{ document, filename, provider_hint }`.
   - Treat parser `400 missing_document` as a contract bug, not a graceful skip.
   - Skip only when there is genuinely no parseable candidate, or when a specific unreadable document is safely routed to review.

2. Add a Data API internal route to apply parser output.
   - Update `case_.eva_*` fields.
   - Update empty `vrm` and `case_ref` from top-level parser identity fields when appropriate.
   - Insert or update `field_level_provenance` rows with parser source/confidence.
   - Do not overwrite reviewed staff values.
   - Audit `parser_called` and `parser_failed`.
   - Recompute status after applying fields.

3. Decide the case-resolution order.
   - Current orchestration resolves case before parse.
   - If parsed reference/provider should influence dedup, parse must happen before or during case resolution, at least for instruction attachments.
   - Otherwise, keep pre-parse shell creation but add a second pass that applies parser-confirmed identity and flags duplicate risk when parser values differ from sniffed values.

4. Improve Graph attachment handling.
   - Page through attachments.
   - Preserve attachment id/hash in blob path to avoid duplicate filename overwrites.
   - Fetch raw `/$value` for file attachments when `contentBytes` is omitted or large.
   - Use `$expand` or `/$value` for item attachments and save message item attachments as `.eml`.

5. Make format support honest and testable.
   - Keep DOCX and selectable PDF as first-class parser targets.
   - Add explicit `.doc` runtime support or route unsupported legacy DOCs to review.
   - Define whether `.eml`/`.msg` parsing means body-only extraction or recursive attachment extraction.
   - Add parse candidates for `.msg`, `message/rfc822`, and `application/vnd.ms-outlook` where appropriate.

6. Add regression fixtures.
   - Promote representative `test-cases-and-data` examples into parser goldens.
   - Add at least one real `.doc`, one `.eml`, one `.msg`, one scanned PDF, and provider-specific samples with known registration/reference values.
   - Add false-positive tests for partial postcodes and `G3`-style bad VRM candidates.
   - Add an orchestration contract test proving it sends `{ document, filename, provider_hint }`, not `{ caseId }`.

## Files affected

- `orchestration/src/functions/activities/parse.ts`
- `orchestration/src/lib/functions-client.ts`
- `orchestration/src/functions/intakeOrchestrator.ts`
- `orchestration/src/functions/activities/fetchMessage.ts`
- `orchestration/src/lib/graph.ts`
- `orchestration/src/lib/blob.ts`
- `orchestration/src/lib/data-api.ts`
- `api/src/functions/internal.ts`
- `api/src/lib/mappers.ts`
- `api/src/functions/proxy.ts`
- `api/src/lib/functions-client.ts`
- `functions/parser/function_app.py`
- `functions/parser/parser_adapter.py`
- `functions/parser/cedocumentmapper_v2/readers/pdf.py`
- `functions/parser/cedocumentmapper_v2/readers/docx.py`
- `functions/parser/cedocumentmapper_v2/readers/doc.py`
- `functions/parser/cedocumentmapper_v2/readers/email.py`
- `functions/parser/cedocumentmapper_v2/rules/engine.py`
- `functions/parser/tests/test_parse.py`
- `functions/parser/tests/test_engine_smoke.py`
- `functions/parser/tests/fixtures/**`
- `packages/domain/src/domain/classification.ts`
- `migration/assets/schema/050_case.sql`
- `migration/assets/schema/070_field_level_provenance.sql`

