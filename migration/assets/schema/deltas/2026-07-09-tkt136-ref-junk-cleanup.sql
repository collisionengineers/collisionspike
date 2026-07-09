-- =============================================================================
-- 2026-07-09-tkt136-ref-junk-cleanup.sql
-- TKT-136 -- clear/repair junk-shaped case_ref rows (data backfill, idempotent)
-- -----------------------------------------------------------------------------
-- ROOT CAUSE. The /parse _fallback_reference had no money/fragment guards (fixed
-- sibling-first at engine tag engine-v2.12 -- see TKT-136 changes.md): prose and
-- spec fragments were minted as case_ref ("RIGERANT R1234YF" et al), and one
-- label tier glued the LABEL onto the value ("Our Reference: 128194.001/LG/LG").
-- The engine fix stops NEW junk; this delta repairs the EXISTING rows,
-- enumerated live 2026-07-09 (13 candidates; the full candidate export is in
-- TKT-136's evidence).
--
-- ACTIONS (mirrors the 2026-07-09-vrm-junk-cleanup precedent: backup table +
-- per-row audit_event with action_code 100000013 status_changed, the recorded
-- nearest-fit generic case-mutation code):
--   1. NULL 4 clear prose/fragment refs (no recoverable reference present):
--        A.PCH26003    'RIGERANT R1234YF'      (the marker case)
--        ABRAHAMS26001 '77 - 79 Hoylake Road'  (address fragment)
--        PCH26005      'Excess waived'         (prose)
--        SWAN26001     'Repairs Authorised?'   (prose)
--   2. STRIP the glued 'Our Reference:' label prefix on 8 RJS rows, KEEPING the
--      real reference value (e.g. 'Our Reference: 128194.001/LG/LG' ->
--      '128194.001/LG/LG').
--   3. WLS26001 'AS.94185.PREM NAZEER' is DELIBERATELY LEFT: it contains a
--      plausible real reference (AS.94185.PREM) with a name appended -- an
--      operator judgement, not a mechanical fix.
--
-- Idempotent: every UPDATE keys on (id, exact current case_ref); a re-run
-- matches zero rows. Case_ref is NOT one of the 7 required EVA fields, so no
-- status re-evaluation is needed for the NULLs.
--
-- -----------------------------------------------------------------------------
-- !! RE-RUN GUARD (the `clear` rows) !! This delta ALREADY RAN LIVE 2026-07-09.
-- The backup/clear guard for the four `clear` targets keys on the BROAD shape
-- `case_ref NOT LIKE 'Our Reference:%'` (encoded as
-- `(t.action='strip-label') = (c.case_ref LIKE 'Our Reference:%')`), NOT on the
-- exact junk strings. That was safe on the ONE audited snapshot it ran against,
-- but a blind re-run would back up + NULL whatever those four ids hold NOW --
-- INCLUDING a legitimate manual correction someone may have applied in the
-- meantime. Before ANY re-run, tighten the `clear` match to the EXACT expected
-- junk values enumerated above:
--   'RIGERANT R1234YF' / '77 - 79 Hoylake Road' / 'Excess waived' / 'Repairs Authorised?'
-- so a `clear` row that no longer holds its original junk is left untouched.
-- -----------------------------------------------------------------------------
--
-- APPLY RUNBOOK: docs/azure/postgres.md (transient firewall rule -> Entra token
-- -> psql as csadmin -> delete rule). BACKUP-FIRST via the backup table below.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS backup_20260709_tkt136_ref_junk (
  id       uuid PRIMARY KEY,
  case_po  text,
  old_ref  text,
  action   text,
  saved_at timestamptz NOT NULL DEFAULT now()
);

WITH targets(id, action) AS (
  VALUES
    ('d6b13fa7-ae8b-40a5-b092-2a37300996eb'::uuid, 'clear'),
    ('aed3fe30-4a11-463c-9670-1015fe1a6254'::uuid, 'clear'),
    ('c1fa8869-1661-41bf-8dd0-cb64c8dd3148'::uuid, 'clear'),
    ('ef65c0ee-c01b-4ecc-b6ad-ccc57f1c6f01'::uuid, 'clear'),
    ('993c3194-83b6-4a36-96a8-3605e55c974a'::uuid, 'strip-label'),
    ('c107e9a8-6faf-4032-9b8c-46d910896cfd'::uuid, 'strip-label'),
    ('1435d13a-d03e-44ef-9001-8eabb74fa9ea'::uuid, 'strip-label'),
    ('920551cb-29f8-446a-b163-c929f456a6bc'::uuid, 'strip-label'),
    ('9a2ddb73-83d5-4a5f-97f4-79dae4206fad'::uuid, 'strip-label'),
    ('fa28e5fc-0d82-4053-ae77-15a9f3376dbf'::uuid, 'strip-label'),
    ('983d114c-e242-45fd-9fe1-f853a3183046'::uuid, 'strip-label'),
    ('b37dd650-3c0c-4b7c-b9c7-8bac0d4e911d'::uuid, 'strip-label')
)
INSERT INTO backup_20260709_tkt136_ref_junk (id, case_po, old_ref, action)
SELECT c.id, c.case_po, c.case_ref, t.action
  FROM case_ c JOIN targets t ON t.id = c.id
 WHERE c.case_ref IS NOT NULL
   -- !! RE-RUN (see header): for `clear` rows this is a BROAD "not a label-prefixed
   -- value" test, NOT the exact junk strings -- a manual correction applied before
   -- this delta would still be captured here and then cleared below. On any re-run,
   -- AND this with an explicit list of the four expected junk values (see header).
   AND (t.action = 'strip-label') = (c.case_ref LIKE 'Our Reference:%')
ON CONFLICT (id) DO NOTHING;

-- 1. clear the prose/fragment junk
WITH cleared AS (
  UPDATE case_ c
     SET case_ref = NULL, updated_at = now()
    FROM backup_20260709_tkt136_ref_junk b
   WHERE c.id = b.id AND b.action = 'clear' AND c.case_ref = b.old_ref
  RETURNING c.id, b.old_ref
)
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT left('Reference cleared (captured wrongly from the document text): ' || cl.old_ref, 400),
       cl.id, 'delta:2026-07-09-tkt136-ref-junk-cleanup',
       100000013, 100000000,
       json_build_object('reference', cl.old_ref)::text,
       json_build_object('reference', NULL)::text,
       now()
  FROM cleared cl;

-- 2. strip the glued label, keep the real reference
WITH stripped AS (
  UPDATE case_ c
     SET case_ref = btrim(regexp_replace(c.case_ref, '^Our Reference:\s*', '')),
         updated_at = now()
    FROM backup_20260709_tkt136_ref_junk b
   WHERE c.id = b.id AND b.action = 'strip-label' AND c.case_ref = b.old_ref
  RETURNING c.id, b.old_ref, c.case_ref AS new_ref
)
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT left('Reference tidied (a label was stuck to it): now ' || st.new_ref, 400),
       st.id, 'delta:2026-07-09-tkt136-ref-junk-cleanup',
       100000013, 100000000,
       json_build_object('reference', st.old_ref)::text,
       json_build_object('reference', st.new_ref)::text,
       now()
  FROM stripped st;

COMMIT;

-- Verify:
--   SELECT case_po, case_ref FROM case_ WHERE id IN (SELECT id FROM backup_20260709_tkt136_ref_junk);
--   -- expect: 4 NULL refs, 7 label-free refs
--   SELECT count(*) FROM case_ WHERE case_ref ~* 'RIGERANT' OR case_ref LIKE 'Our Reference:%';  -- 0
