-- =============================================================================
-- 2026-07-09-tkt089-evidence-cleanup.sql
-- TKT-089 DATA FIX -- exclude non-vehicle letterhead/signature image evidence
-- -----------------------------------------------------------------------------
-- PURPOSE. The 2026-07-09 TKT-089 audit (lane-split sweep of image evidence
-- created after the TKT-047 email-lane floor deploy, 2026-07-02T13:14Z) found
-- ~165 letterhead/logo/signature-furniture crops that passed the engine's
-- 200x200 area floor (large-ish letterhead art, recurring per provider:
-- LtrtoEngineerIn__*_img_1_1.png @10.7KB, InspectionRequest_*_img_1_1.png
-- @19.5KB, Engineer Instruction - SBL-* @6.8KB, etc.) still sitting live in the
-- evidence view + the Box mirror. The FORWARD fix is engine-v2.11's banner
-- aspect heuristic + the orch email-lane mirror (same wave); THIS delta is the
-- audited BACKFILL: mark the audited residue excluded so it leaves the evidence
-- view + EVA flow. Box files are NOT touched (ADR-0012/0017 one-way mirror --
-- removal is evidence-row-only; the operator note records this decision).
--
-- SCOPE (deliberately conservative -- no row above 25KB is touched):
--   rung 1: document-extraction crops (`_img_` names) < 25KB that the image
--           classifier ALREADY rejected for EVA (accepted_for_eva = false);
--   rung 2: email-lane classic signature names (image<NNN...>.png/jpg/gif)
--           < 25KB, already EVA-rejected;
--   rung 3: sub-1.5KB `_img_` crops regardless of acceptance (909-byte
--           "letter of instruction" furniture etc. -- never a photo).
-- Window: created_at > 2026-07-02T13:14Z (the audit window). Already-excluded
-- rows untouched (idempotent).
--
-- BACKUP-FIRST + IDEMPOTENT + AUDITED. Affected rows are copied to
-- backup_20260709_tkt089_evidence before the UPDATE; re-running no-ops
-- (WHERE NOT excluded); one audit_event row per affected case.
--
-- APPLY RUNBOOK: docs/operations/database.md (transient firewall rule -> AAD token ->
-- psql -> SET ROLE csadmin -> \i this file -> delete rule).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. The audited selection, materialised once.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _tkt089_targets ON COMMIT DROP AS
SELECT e.id, e.case_id, e.file_name, e.size_bytes
FROM evidence e
WHERE e.kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image')
  AND NOT e.excluded
  AND e.created_at > timestamptz '2026-07-02T13:14:00Z'
  AND (
        (e.size_bytes IS NOT NULL AND e.size_bytes < 25000
         AND e.accepted_for_eva = false
         AND e.file_name ~ '_img_')                                   -- rung 1
     OR (e.size_bytes IS NOT NULL AND e.size_bytes < 25000
         AND e.accepted_for_eva = false
         AND e.file_name ~* '^image[0-9]+\.(png|jpe?g|gif)$')          -- rung 2
     OR (e.size_bytes IS NOT NULL AND e.size_bytes < 1500
         AND e.file_name ~ '_img_')                                    -- rung 3
  );

-- ---------------------------------------------------------------------------
-- 1. Backup (idempotent append; survives COMMIT).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_20260709_tkt089_evidence
  AS SELECT * FROM evidence WHERE false;
INSERT INTO backup_20260709_tkt089_evidence
SELECT e.* FROM evidence e
WHERE e.id IN (SELECT id FROM _tkt089_targets)
  AND NOT EXISTS (SELECT 1 FROM backup_20260709_tkt089_evidence b WHERE b.id = e.id);

-- ---------------------------------------------------------------------------
-- 2. The exclusion (evidence-row-only; Box files untouched by design).
-- ---------------------------------------------------------------------------
UPDATE evidence e
SET excluded = true,
    exclusion_reason = 'Non-vehicle image (letterhead/signature furniture) — TKT-089 audit cleanup 2026-07-09',
    accepted_for_eva = false,
    updated_at = now()
WHERE e.id IN (SELECT id FROM _tkt089_targets);

-- ---------------------------------------------------------------------------
-- 3. Audit -- one append-only row per affected case (action 100000002
--    attachment_classified; the closest controlled action for an attachment
--    re-classification; actor identifies the wave).
-- ---------------------------------------------------------------------------
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, after, occurred_at)
SELECT
  'TKT-089 audit cleanup: ' || count(*) || ' non-vehicle image(s) excluded (letterhead/signature furniture)',
  t.case_id,
  'agent:PLAN-003-lifecycle-wave-2026-07-09',
  100000002,  -- attachment_classified
  100000000,  -- info
  jsonb_build_object('excluded_files', jsonb_agg(t.file_name), 'ticket', 'TKT-089'),
  now()
FROM _tkt089_targets t
GROUP BY t.case_id;

COMMIT;

-- VERIFY (read-only):
--   SELECT count(*) FROM backup_20260709_tkt089_evidence;              -- == rows excluded (cumulative)
--   SELECT count(*) FROM evidence WHERE exclusion_reason LIKE 'Non-vehicle image%TKT-089%';
--   SELECT count(*) FROM evidence e                                     -- residual suspects: expect 0
--     WHERE e.kind_code=(SELECT code FROM choice_evidence_kind WHERE name='image')
--       AND NOT e.excluded AND e.created_at > timestamptz '2026-07-02T13:14:00Z'
--       AND e.size_bytes < 25000 AND e.accepted_for_eva=false
--       AND (e.file_name ~ '_img_' OR e.file_name ~* '^image[0-9]+\.');
