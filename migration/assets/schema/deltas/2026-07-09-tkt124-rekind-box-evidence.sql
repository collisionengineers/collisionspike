-- =============================================================================
-- 2026-07-09-tkt124-rekind-box-evidence.sql
-- TKT-124 -- re-kind mislabelled image-kind evidence rows (data backfill, idempotent)
-- -----------------------------------------------------------------------------
-- ROOT CAUSE. The box-webhook Function hardcodes evidenceClass='image' for EVERY
-- Box FILE.UPLOADED row (functions/box-webhook/data_api_client.py, "the API
-- derives kind_code from evidenceClass='image'"), so PDFs, .doc instructions,
-- .eml messages and .mp4 videos landed in `evidence` with kind_code=image and
-- accepted_for_eva=true -- which is exactly why the operator saw ".eml files in
-- the photo orderer", and why the TKT-126 EVA-export zip picked up PDFs/videos.
-- The 2026-07-09 api deploy fixes the WRITER (the internal evidence route now
-- re-derives an 'image'-claimed row through the shared domain classifier); this
-- delta fixes the EXISTING rows.
--
-- MAPPING (mirrors @cs/domain classifyAttachment: extension PRIMARY, MIME
-- fallback -- packages/domain/src/domain/classification.ts):
--   .jpg/.jpeg/.png                  -> image       (100000000)  [unchanged]
--   .pdf/.docx/.doc                  -> instruction (100000002)
--   .eml                             -> email       (100000003)
--   no/unknown extension + image/*   -> image       (100000000)  [unchanged]
--   no/unknown extension + pdf MIME  -> instruction (100000002)
--   no/unknown extension + rfc822    -> email       (100000003)
--   everything else                  -> other       (100000006)
-- Rows whose content_type is image/* KEEP image even with an off-table extension
-- (e.g. .tiff/.heic scans) -- an honest MIME beats a missing table entry.
--
-- Scope: ONLY rows currently kind_code=image whose derived class is NOT image.
-- Idempotent: a re-run matches zero rows. accepted_for_eva / excluded are left
-- untouched (the photo orderer + EVA order key on kind, not those flags).
--
-- BACKUP-FIRST (run + keep the output BEFORE applying):
--   SELECT count(*) FROM evidence WHERE kind_code = 100000000;
--   SELECT id, file_name, content_type FROM evidence
--    WHERE kind_code = 100000000
--      AND NOT (lower(file_name) ~ '\.(jpe?g|png)$' OR coalesce(content_type,'') LIKE 'image/%');
--
-- APPLY RUNBOOK: docs/azure/postgres.md (transient firewall rule -> AAD token ->
-- psql -> delete rule), run as csadmin; verify with the queries at the foot.
-- =============================================================================
BEGIN;

WITH derived AS (
  SELECT id,
    CASE
      WHEN lower(file_name) ~ '\.(jpe?g|png)$'                    THEN 100000000 -- image
      WHEN coalesce(content_type, '') LIKE 'image/%'              THEN 100000000 -- image (honest MIME)
      WHEN lower(file_name) ~ '\.(pdf|docx?)$'                    THEN 100000002 -- instruction
      WHEN lower(file_name) ~ '\.eml$'                            THEN 100000003 -- email
      WHEN content_type = 'application/pdf'                       THEN 100000002
      WHEN content_type IN ('application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                                                                  THEN 100000002
      WHEN content_type = 'message/rfc822'                        THEN 100000003
      ELSE 100000006                                              -- other
    END AS new_kind
  FROM evidence
  WHERE kind_code = 100000000
)
UPDATE evidence e
   SET kind_code = d.new_kind, updated_at = now()
  FROM derived d
 WHERE e.id = d.id
   AND d.new_kind <> 100000000;

COMMIT;

-- Verify:
--   SELECT count(*) AS still_mislabelled FROM evidence
--    WHERE kind_code = 100000000
--      AND NOT (lower(file_name) ~ '\.(jpe?g|png)$' OR coalesce(content_type,'') LIKE 'image/%');
--   -- expect 0
--   SELECT kind_code, count(*) FROM evidence GROUP BY kind_code ORDER BY kind_code;
