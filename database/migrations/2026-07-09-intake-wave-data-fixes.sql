-- =============================================================================
-- 2026-07-09-intake-wave-data-fixes.sql
-- PLAN-003 intake-correctness wave (TKT-099 / TKT-092 / TKT-101) -- DATA ONLY
-- -----------------------------------------------------------------------------
-- Four audited fixes, each traced in the 2026-07-09 investigation (evidence in
-- the tickets' folders; row ids verified live before authoring):
--
--  A. TKT-099 -- seed complexreports.com into QCL's known_email_domains
--     (operator-confirmed 2026-07-08: "This email sender is always for QCL at
--     present"). Root cause of "QCL cases with no Case/PO": the sender never
--     provider-matched, so every complexreports intake landed Held/new-client
--     with NO Case/PO and NO Box folder; the parser content-match later filled
--     work_provider_id (making it LOOK like a QCL case) but a post-create fill
--     never mints. With the domain seeded, the NEXT intake mints QCL26NNN at
--     case-create and the Box folder follows.
--
--  B. TKT-092 -- merge the PCH duplicate triple PK20FWT / ref 00035591/JEFFP:
--     PCH26018 (cd9092ce-...) + PCH26020 (19b96214-...) -> survivor PCH26009
--     (68442a2a-...). Vector (data-traced): the SAME instruction re-sent as
--     "FW:" with fresh Internet-Message-Ids on 2026-07-03; the then-deployed
--     build's ladder missed the repeat (the rung-1 key/ref wiring fixed this
--     wave). All three carry provider PCH -- no provider is lost (TKT-052).
--
--  C. TKT-092 -- merge the QCL duplicate pair YH13ZSN / ref 226070.TA:
--     d1d862bd-... (created 15:59) -> survivor be1a0a11-... (created 15:28).
--     Both carry provider QCL. (Held new-client rows, no Case/PO consumed.)
--
--  D. TKT-101 -- split the QDOS wrong-link: detach inbound email
--     86b0dc6d-... ("46671/1 - Michael McCarthy") from case QDOS26056
--     (8c7cbc8e-..., created from "46533/1 - Barry Pavlou"). Vector: both
--     emails sniffed the junk VRM AND2 (engine v2.7; fixed in v2.10 + the
--     2026-07-09 vrm-junk cleanup) and linkReply's VRM arm auto-linked the
--     second ref onto the first's case. The detached email returns to triage
--     'new'; the retro drain then rebuilds its own case (live step, recorded in
--     the ticket). The linkReply VRM arm now refuses a conflicting-reference
--     link (this wave's code fix).
--
-- BACKUP-FIRST + AUDITED + IDEMPOTENT + TRANSACTIONAL:
--   * affected case_/inbound_email/work_provider rows snapshot into
--     backup_20260709_intake_wave BEFORE mutation (ON CONFLICT DO NOTHING);
--   * every merge/detach writes audit_event rows (case_attached 100000004 on
--     the survivor; inbound_detached 100000037 on the split case);
--   * WHERE guards make every statement a no-op on re-run.
--
-- PRE-CHECK (save output into the tickets' evidence folders):
--   SELECT id, case_po, case_ref, vrm, status_code FROM case_ WHERE id IN
--     ('68442a2a-998c-4a16-89ba-8fe226303734','cd9092ce-1956-4df3-80d3-6cc77ee31d9f',
--      '19b96214-4770-4ea7-ac56-c63741a4f430','be1a0a11-8a22-4fef-a0e6-878090360f0c',
--      'd1d862bd-1ae4-4028-b81e-392ff6a75029','8c7cbc8e-e33c-4241-a920-8f3970cb81ff');
--   SELECT id, case_id, subject FROM inbound_email WHERE id = '86b0dc6d-724a-44b8-ba01-99f31bc5b5ee';
--   SELECT known_email_domains FROM work_provider WHERE principal_code = 'QCL';
--
-- ROLLBACK: restore from backup_20260709_intake_wave (snapshot column holds the
-- full row as jsonb). Apply as the table owner (SET ROLE csadmin) -- RLS tables.
-- =============================================================================

BEGIN;

-- 0. Backup table (idempotent).
CREATE TABLE IF NOT EXISTS backup_20260709_intake_wave (
  source     text NOT NULL,          -- 'case_' | 'inbound_email' | 'work_provider' | 'evidence'
  row_id     uuid NOT NULL,
  snapshot   jsonb NOT NULL,
  backed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, row_id)
);

INSERT INTO backup_20260709_intake_wave (source, row_id, snapshot)
SELECT 'case_', c.id, to_jsonb(c) FROM case_ c WHERE c.id IN (
  '68442a2a-998c-4a16-89ba-8fe226303734','cd9092ce-1956-4df3-80d3-6cc77ee31d9f',
  '19b96214-4770-4ea7-ac56-c63741a4f430','be1a0a11-8a22-4fef-a0e6-878090360f0c',
  'd1d862bd-1ae4-4028-b81e-392ff6a75029','8c7cbc8e-e33c-4241-a920-8f3970cb81ff')
ON CONFLICT (source, row_id) DO NOTHING;

INSERT INTO backup_20260709_intake_wave (source, row_id, snapshot)
SELECT 'inbound_email', ie.id, to_jsonb(ie) FROM inbound_email ie
 WHERE ie.id = '86b0dc6d-724a-44b8-ba01-99f31bc5b5ee'
    OR ie.case_id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f','19b96214-4770-4ea7-ac56-c63741a4f430',
                      'd1d862bd-1ae4-4028-b81e-392ff6a75029')
ON CONFLICT (source, row_id) DO NOTHING;

INSERT INTO backup_20260709_intake_wave (source, row_id, snapshot)
SELECT 'evidence', e.id, to_jsonb(e) FROM evidence e
 WHERE e.case_id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f','19b96214-4770-4ea7-ac56-c63741a4f430',
                     'd1d862bd-1ae4-4028-b81e-392ff6a75029')
ON CONFLICT (source, row_id) DO NOTHING;

INSERT INTO backup_20260709_intake_wave (source, row_id, snapshot)
SELECT 'work_provider', wp.id, to_jsonb(wp) FROM work_provider wp WHERE wp.principal_code = 'QCL'
ON CONFLICT (source, row_id) DO NOTHING;

-- A. TKT-099 -- QCL learns complexreports.com (idempotent append; newline-separated
--    list, the same shape parseDomains reads).
UPDATE work_provider
   SET known_email_domains = COALESCE(NULLIF(known_email_domains, ''), '') ||
                             CASE WHEN COALESCE(known_email_domains, '') = '' THEN '' ELSE E'\n' END ||
                             'complexreports.com',
       updated_at = now()
 WHERE principal_code = 'QCL'
   AND active = true
   AND COALESCE(known_email_domains, '') NOT ILIKE '%complexreports.com%';

-- B + C. The two merges (survivor <- sources). Idempotent: every UPDATE keys on the
--    source case still being un-retired / rows still pointing at the source.

-- B1. PCH evidence + emails -> survivor.
UPDATE evidence SET case_id = '68442a2a-998c-4a16-89ba-8fe226303734', updated_at = now()
 WHERE case_id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f','19b96214-4770-4ea7-ac56-c63741a4f430');
UPDATE inbound_email SET case_id = '68442a2a-998c-4a16-89ba-8fe226303734', updated_at = now()
 WHERE case_id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f','19b96214-4770-4ea7-ac56-c63741a4f430');

-- B2. Retire the two PCH duplicates (linked_to_instruction 100000006 + survivor marker).
--     Their minted POs (PCH26018/PCH26020) stay on the retired rows -- numbers are
--     consumed, never reused (uq_case_case_po).
UPDATE case_
   SET status_code = 100000006,
       duplicate_keys = json_build_object('mergedInto', '68442a2a-998c-4a16-89ba-8fe226303734',
                                          'mergedBy', 'delta:2026-07-09-intake-wave-data-fixes')::text,
       on_hold = false,
       updated_at = now()
 WHERE id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f','19b96214-4770-4ea7-ac56-c63741a4f430')
   AND status_code <> 100000006;

-- B3. Audit on the survivor (once per source; idempotent via the name guard).
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT 'Merged duplicate ' || src.case_po || ' into PCH26009 (same instruction re-sent as FW:; ref 00035591/JEFFP, reg PK20FWT)',
       '68442a2a-998c-4a16-89ba-8fe226303734',
       'delta:2026-07-09-intake-wave-data-fixes',
       100000004, 100000000,
       json_build_object('sourceCaseId', src.id, 'sourceCasePo', src.case_po)::text,
       json_build_object('targetCaseId', '68442a2a-998c-4a16-89ba-8fe226303734', 'providerPreserved', true)::text,
       now()
  FROM case_ src
 WHERE src.id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f','19b96214-4770-4ea7-ac56-c63741a4f430')
   AND NOT EXISTS (
     SELECT 1 FROM audit_event ae
      WHERE ae.case_id = '68442a2a-998c-4a16-89ba-8fe226303734'
        AND ae.actor = 'delta:2026-07-09-intake-wave-data-fixes'
        AND ae.before LIKE '%' || src.id || '%');

-- C1. QCL pair -> survivor.
UPDATE evidence SET case_id = 'be1a0a11-8a22-4fef-a0e6-878090360f0c', updated_at = now()
 WHERE case_id = 'd1d862bd-1ae4-4028-b81e-392ff6a75029';
UPDATE inbound_email SET case_id = 'be1a0a11-8a22-4fef-a0e6-878090360f0c', updated_at = now()
 WHERE case_id = 'd1d862bd-1ae4-4028-b81e-392ff6a75029';
UPDATE case_
   SET status_code = 100000006,
       duplicate_keys = json_build_object('mergedInto', 'be1a0a11-8a22-4fef-a0e6-878090360f0c',
                                          'mergedBy', 'delta:2026-07-09-intake-wave-data-fixes')::text,
       on_hold = false,
       updated_at = now()
 WHERE id = 'd1d862bd-1ae4-4028-b81e-392ff6a75029'
   AND status_code <> 100000006;

INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT 'Merged duplicate case into this one (same QCL instruction, ref 226070.TA, reg YH13ZSN)',
       'be1a0a11-8a22-4fef-a0e6-878090360f0c',
       'delta:2026-07-09-intake-wave-data-fixes',
       100000004, 100000000,
       json_build_object('sourceCaseId', 'd1d862bd-1ae4-4028-b81e-392ff6a75029')::text,
       json_build_object('targetCaseId', 'be1a0a11-8a22-4fef-a0e6-878090360f0c', 'providerPreserved', true)::text,
       now()
 WHERE NOT EXISTS (
   SELECT 1 FROM audit_event ae
    WHERE ae.case_id = 'be1a0a11-8a22-4fef-a0e6-878090360f0c'
      AND ae.actor = 'delta:2026-07-09-intake-wave-data-fixes');

-- D. TKT-101 -- detach 46671/1 from QDOS26056 (back to triage; the retro drain
--    rebuilds its own case as the recorded live step).
UPDATE inbound_email
   SET case_id = NULL, triage_state = 'new', updated_at = now()
 WHERE id = '86b0dc6d-724a-44b8-ba01-99f31bc5b5ee'
   AND case_id = '8c7cbc8e-e33c-4241-a920-8f3970cb81ff';

INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT 'Unlinked "46671/1 - Michael McCarthy" — a different matter wrongly linked here by a shared junk registration (AND2)',
       '8c7cbc8e-e33c-4241-a920-8f3970cb81ff',
       'delta:2026-07-09-intake-wave-data-fixes',
       100000037, 100000001,
       json_build_object('inboundEmailId', '86b0dc6d-724a-44b8-ba01-99f31bc5b5ee',
                         'caseId', '8c7cbc8e-e33c-4241-a920-8f3970cb81ff')::text,
       json_build_object('caseId', NULL, 'reason', 'vrm_ref_conflict_split')::text,
       now()
 WHERE NOT EXISTS (
   SELECT 1 FROM audit_event ae
    WHERE ae.case_id = '8c7cbc8e-e33c-4241-a920-8f3970cb81ff'
      AND ae.action_code = 100000037
      AND ae.actor = 'delta:2026-07-09-intake-wave-data-fixes');

COMMIT;

-- POST-CHECK (expected):
--   * QCL row: known_email_domains contains complexreports.com;
--   * duplicate groups gone:
--       SELECT vrm, count(*) FROM case_ WHERE vrm='PK20FWT' AND status_code <> 100000006 GROUP BY 1;  -- 1
--       SELECT case_ref, count(*) FROM case_ WHERE case_ref='226070.TA' AND status_code <> 100000006 GROUP BY 1;  -- 1
--   * split: SELECT case_id FROM inbound_email WHERE id='86b0dc6d-724a-44b8-ba01-99f31bc5b5ee';  -- NULL
--   * backups: SELECT source, count(*) FROM backup_20260709_intake_wave GROUP BY source;
