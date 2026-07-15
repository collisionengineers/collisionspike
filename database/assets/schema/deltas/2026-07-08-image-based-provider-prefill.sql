-- =============================================================================
-- 2026-07-08-image-based-provider-prefill.sql
-- TKT-109 / TKT-129 / TKT-130 — seed the always_image_based provider policy,
-- pre-fill the inspection field on their existing active cases, then re-evaluate
-- every active case's status (DATA ONLY, idempotent, backup-first, one txn).
-- -----------------------------------------------------------------------------
-- CONTEXT. The 2026-07-08 operator direction ("auto populate the image based
-- providers based on the spreadsheet evidence already obtained") supersedes the
-- no-auto-populate reading of ADR-0013 for always_image_based providers (dated
-- amendment recorded in the ADR). Evidence: the TKT-075 corpus run report —
-- QDOS 99.9% / PCH 99.6% / AX 99.2% / SBL 99.5% image-based. No provider was
-- designated always_image_based live before this delta.
--
-- WHAT IT DOES (mirrors the deployed Data API seam, api/src/lib/inspection-prefill.ts):
--   0. Backups (backup-first): the 4 providers' policy rows, the prefill-eligible
--      case rows, and EVERY active case's pre-re-eval status.
--   1. work_provider.inspection_location_policy_code := 100000000 (always_image_based)
--      for QDOS / PCH / AX / SBL.
--   2. For their ACTIVE cases with an EMPTY inspection address and NO recorded
--      decision: eva_inspection_address := 'Image Based Assessment',
--      inspection_decision_code := 100000002 (image_based) — fill-if-empty, plus
--      one inspection_override audit row per case carrying the policy reason
--      ("Provider policy: image-based assessment") and one reviewed corpus
--      provenance row (insert-if-absent). Never a terminal case.
--   3. Re-evaluate status_code for ALL active cases with the EXACT
--      statusForReviewCase tree (packages/domain/src/contracts/case-status.ts:199-222
--      — the same SQL reproduction shape as the recorded 2026-07-06 reverify pass),
--      persisting + auditing (status_changed) only where it changes.
--
-- REPLAY-SAFETY: every write is guarded (policy IS DISTINCT FROM, fill-if-empty,
-- status <> next) and the case scans are bounded on created_at < the day after
-- apply — a re-run no-ops; cases created later are handled by the DEPLOYED API
-- seam, not by re-running this delta.
--
-- PRE-CHECKS (read before apply):
--   SELECT principal_code, inspection_location_policy_code FROM work_provider
--    WHERE upper(principal_code) IN ('QDOS','PCH','AX','SBL');   -- expect 100000001 (prefer_address)
--   SELECT count(*) FROM case_ c JOIN work_provider w ON w.id = c.work_provider_id
--    WHERE upper(w.principal_code) IN ('QDOS','PCH','AX','SBL')
--      AND c.status_code NOT IN (100000008,100000009,100000010,100000011)
--      AND COALESCE(c.eva_inspection_address,'') = ''
--      AND (c.inspection_decision_code IS NULL OR c.inspection_decision_code = 100000003);
-- =============================================================================

\set apply_cutoff '2026-07-09 00:00:00+00'

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. BACKUPS (backup-first; IF NOT EXISTS => a re-run keeps the ORIGINAL state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tkt129_backup_wp_policy_2026_07_08 AS
  SELECT id, principal_code, inspection_location_policy_code, now() AS backed_up_at
    FROM work_provider
   WHERE upper(principal_code) IN ('QDOS','PCH','AX','SBL');

CREATE TABLE IF NOT EXISTS tkt129_backup_case_prefill_2026_07_08 AS
  SELECT c.id, c.eva_inspection_address, c.inspection_decision_code, c.status_code,
         c.updated_at, now() AS backed_up_at
    FROM case_ c
    JOIN work_provider w ON w.id = c.work_provider_id
   WHERE upper(w.principal_code) IN ('QDOS','PCH','AX','SBL')
     AND c.status_code NOT IN (100000008,100000009,100000010,100000011)  -- non-terminal
     AND COALESCE(c.eva_inspection_address, '') = ''
     AND (c.inspection_decision_code IS NULL OR c.inspection_decision_code = 100000003);

CREATE TABLE IF NOT EXISTS tkt130_backup_case_status_2026_07_08 AS
  SELECT id, status_code, now() AS backed_up_at
    FROM case_
   WHERE status_code NOT IN (100000008,100000009,100000010,100000011);

-- ---------------------------------------------------------------------------
-- 1. SEED the always_image_based policy for the 4 evidenced providers.
--    (choice_inspection_location_policy: 100000000 = always_image_based.)
-- ---------------------------------------------------------------------------
WITH seeded AS (
  UPDATE work_provider
     SET inspection_location_policy_code = 100000000
   WHERE upper(principal_code) IN ('QDOS','PCH','AX','SBL')
     AND inspection_location_policy_code IS DISTINCT FROM 100000000
  RETURNING id, principal_code
)
SELECT count(*) AS providers_flagged_always_image_based FROM seeded;

-- ---------------------------------------------------------------------------
-- 2. PRE-FILL the inspection field on their active, empty-and-undecided cases.
--    Fill-if-empty (identical guard to the deployed prefillImageBasedInspection);
--    audit (inspection_override 100000018) + provenance (corpus, reviewed) per fill.
-- ---------------------------------------------------------------------------
WITH filled AS (
  UPDATE case_ c
     SET eva_inspection_address   = 'Image Based Assessment',
         inspection_decision_code = 100000002,   -- image_based
         updated_at               = now()
    FROM work_provider w
   WHERE w.id = c.work_provider_id
     AND w.inspection_location_policy_code = 100000000
     AND c.status_code NOT IN (100000008,100000009,100000010,100000011)
     AND COALESCE(c.eva_inspection_address, '') = ''
     AND (c.inspection_decision_code IS NULL OR c.inspection_decision_code = 100000003)
     AND c.created_at < TIMESTAMPTZ :'apply_cutoff'    -- replay-safety (see header)
  RETURNING c.id
),
audited AS (
  INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
  SELECT 'Inspection recorded as Image Based Assessment (provider policy)',
         f.id,
         'delta:2026-07-08-image-based-provider-prefill',
         100000018,   -- inspection_override
         100000000,   -- info
         json_build_object('inspectionAddress', '', 'decisionMode', 'unknown')::text,
         json_build_object('inspectionAddress', 'Image Based Assessment',
                           'decisionMode', 'image_based',
                           'reason', 'Provider policy: image-based assessment',
                           'source', 'provider_policy')::text,
         now()
    FROM filled f
  RETURNING case_id
),
provenanced AS (
  INSERT INTO field_level_provenance
      (name, case_id, field_name, value, source_type_code, source_label, review_state_code)
  SELECT f.id || ':inspectionAddress',
         f.id,
         'inspectionAddress',
         'Image Based Assessment',
         100000003,   -- corpus
         'Provider policy (image-based)',
         100000002    -- reviewed (operator-designated policy, not an extraction)
    FROM filled f
   WHERE NOT EXISTS (
           SELECT 1 FROM field_level_provenance p
            WHERE p.case_id = f.id AND p.field_name = 'inspectionAddress'
         )
  RETURNING id
)
SELECT (SELECT count(*) FROM filled)      AS cases_prefilled,
       (SELECT count(*) FROM provenanced) AS provenance_rows_written;

-- ---------------------------------------------------------------------------
-- 3. RE-EVALUATE every active case's status (exact statusForReviewCase tree).
--    fieldsValid = the 7 required EVA fields non-empty (workProvider, vehicleModel,
--    claimantName, dateOfLoss, dateOfInstruction, accidentCircumstances,
--    inspectionAddress — EVA_FIELD_ORDER required:true set).
--    imagesValid = >=2 accepted images (kind image, accepted_for_eva, not excluded)
--    AND >=1 overview with registration_visible AND >=1 damage_closeup.
--    hasIdentity = vrm OR provider principal OR claimant name (internal.ts:162-165).
-- ---------------------------------------------------------------------------
WITH ev AS (
  SELECT e.case_id,
         count(*) FILTER (WHERE e.kind_code = 100000000
                            AND e.accepted_for_eva
                            AND COALESCE(e.excluded, false) = false)                    AS accepted_ct,
         bool_or(e.kind_code = 100000000 AND e.accepted_for_eva
                 AND COALESCE(e.excluded, false) = false
                 AND e.image_role_code = 100000000
                 AND e.registration_visible IS TRUE)                                    AS has_overview,
         bool_or(e.kind_code = 100000000 AND e.accepted_for_eva
                 AND COALESCE(e.excluded, false) = false
                 AND e.image_role_code = 100000001)                                     AS has_closeup,
         count(*) FILTER (WHERE e.kind_code = 100000002)                                AS instruction_ct
    FROM evidence e
   GROUP BY e.case_id
),
evaluated AS (
  SELECT c.id,
         c.status_code AS old_status,
         CASE
           -- terminal-lock is the WHERE below (terminals never enter this scan)
           WHEN fields_valid AND images_valid THEN 100000007                     -- ready_for_eva
           WHEN fields_valid AND NOT images_valid THEN 100000004                 -- missing_images
           WHEN NOT fields_valid AND images_valid THEN 100000003                 -- missing_required_fields
           WHEN accepted_ct = 0 AND instruction_ct = 0 THEN 100000002            -- needs_review (nothing usable yet)
           WHEN has_identity THEN 100000002                                      -- needs_review
           ELSE 100000010                                                        -- error
         END AS next_status
    FROM (
      SELECT c.id, c.status_code,
             (COALESCE(btrim(c.eva_work_provider), '')          <> '' AND
              COALESCE(btrim(c.eva_vehicle_model), '')          <> '' AND
              COALESCE(btrim(c.eva_claimant_name), '')          <> '' AND
              COALESCE(btrim(c.eva_date_of_loss), '')           <> '' AND
              COALESCE(btrim(c.eva_date_of_instruction), '')    <> '' AND
              COALESCE(btrim(c.eva_accident_circumstances), '') <> '' AND
              COALESCE(btrim(c.eva_inspection_address), '')     <> '')                  AS fields_valid,
             (COALESCE(ev.accepted_ct, 0) >= 2
              AND COALESCE(ev.has_overview, false)
              AND COALESCE(ev.has_closeup, false))                                      AS images_valid,
             COALESCE(ev.accepted_ct, 0)     AS accepted_ct,
             COALESCE(ev.instruction_ct, 0)  AS instruction_ct,
             (COALESCE(btrim(c.vrm), '') <> ''
              OR COALESCE(btrim(w.principal_code), '') <> ''
              OR COALESCE(btrim(c.eva_claimant_name), '') <> '')                        AS has_identity
        FROM case_ c
        LEFT JOIN ev ON ev.case_id = c.id
        LEFT JOIN work_provider w ON w.id = c.work_provider_id
       WHERE c.status_code NOT IN (100000008,100000009,100000010,100000011)  -- non-terminal only
         AND c.created_at < TIMESTAMPTZ :'apply_cutoff'                      -- replay-safety
    ) c
),
moved AS (
  UPDATE case_ c
     SET status_code = e.next_status,
         updated_at  = now()
    FROM evaluated e
   WHERE c.id = e.id
     AND e.next_status <> e.old_status
  RETURNING c.id, e.old_status, e.next_status
),
move_audit AS (
  INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
  SELECT left('Status ' || co.name || ' -> ' || cn.name || ' (TKT-129/130 re-evaluate)', 400),
         m.id,
         'delta:2026-07-08-image-based-provider-prefill',
         100000013,   -- status_changed
         100000000,   -- info
         json_build_object('status', co.name)::text,
         json_build_object('status', cn.name)::text,
         now()
    FROM moved m
    JOIN choice_case_status co ON co.code = m.old_status
    JOIN choice_case_status cn ON cn.code = m.next_status
  RETURNING case_id
)
-- MOVEMENT SUMMARY (capture this output in the ticket evidence: how many cases
-- left each status and where they went — the TKT-130 acceptance line).
SELECT co.name AS from_status, cn.name AS to_status, count(*) AS moved
  FROM moved m
  JOIN choice_case_status co ON co.code = m.old_status
  JOIN choice_case_status cn ON cn.code = m.next_status
 GROUP BY co.name, cn.name
 ORDER BY moved DESC;

COMMIT;

-- POST-CHECKS:
--   -- the 4 providers now always_image_based:
--   SELECT principal_code, inspection_location_policy_code FROM work_provider
--    WHERE upper(principal_code) IN ('QDOS','PCH','AX','SBL');            -- expect 4x 100000000
--   -- no active case of an always_image_based provider still empty-and-undecided:
--   SELECT count(*) FROM case_ c JOIN work_provider w ON w.id = c.work_provider_id
--    WHERE w.inspection_location_policy_code = 100000000
--      AND c.status_code NOT IN (100000008,100000009,100000010,100000011)
--      AND COALESCE(c.eva_inspection_address,'') = ''
--      AND (c.inspection_decision_code IS NULL OR c.inspection_decision_code = 100000003); -- expect 0
--   -- the live status distribution after the pass:
--   SELECT s.name, count(*) FROM case_ c JOIN choice_case_status s ON s.code = c.status_code
--    GROUP BY s.name ORDER BY count(*) DESC;
