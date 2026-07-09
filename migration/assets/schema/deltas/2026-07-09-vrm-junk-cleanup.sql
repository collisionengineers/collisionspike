-- =============================================================================
-- 2026-07-09-vrm-junk-cleanup.sql
-- PLAN-003 (TKT-071 / TKT-085 / TKT-100) -- audited VRM junk cleanup (DATA ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. Clear registration values the pre-PLAN-003 sniffs captured wrongly. A
-- wrong VRM poisons dedup/twin matching (VRM is the primary correlation key,
-- ADR-0002) and flows into EVA fields. Three junk families, mirroring the engine
-- guards the same wave ships (engine-v2.10 + the TS vrm-filter):
--   A. MONTH / DAY-OF-WEEK words (TKT-085 -- the live A.PCH26003 "OCTOBER").
--      Every real UK mark carries a digit; an all-alpha date word is never a mark.
--   B. FUNCTION-WORD loose heads (TKT-100 -- the QDOS "AND2" from "Offices 1 and
--      2, 1A King Street"): AND2 / THE4 style prose fragments.
--   C. POSTCODE-AREA-HEADED loose shapes (TKT-071 -- the "HD4110" job ref):
--      1-2 letters that are a UK postcode AREA + 1-4 digits (HD4110, LS8, B8) --
--      the shape of a postcode fragment / provider job ref, captured by the old
--      document-wide-anchor sniff. A STRICT DVLA shape (current/prefix/suffix)
--      is NEVER touched (defensive re-check below), so no genuine mark can match.
--
-- Targets BOTH persisted homes: case_.vrm and inbound_email.body_vrm.
--
-- BACKUP-FIRST + AUDITED + IDEMPOTENT + TRANSACTIONAL:
--   * every affected row is copied into backup_20260709_vrm_junk BEFORE the
--     update (CREATE IF NOT EXISTS + ON CONFLICT DO NOTHING -- re-running adds
--     nothing and re-clears nothing, because cleared rows no longer match);
--   * every case_ clear writes an audit_event row carrying the before/after
--     values (action_code 100000013 status_changed -- the same
--     nearest-fit generic-case-mutation code the API's own updateCase writes and
--     the 2026-07-06 un-hold delta used; no dedicated field-correction code
--     exists). inbound_email clears are recorded in the backup table (the
--     audit_event shape is case-scoped).
--
-- PRE-CHECK (run first; SAVE THE OUTPUT into the TKT-071 evidence folder -- the
-- acceptance requires each cleared value recorded):
--   SELECT 'case_' AS source, id, case_po, vrm AS value FROM case_
--    WHERE vrm IS NOT NULL AND vrm <> '' AND (
--          upper(vrm) IN ('JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST',
--                         'SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER','MONDAY','TUESDAY',
--                         'WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')
--       OR upper(vrm) ~ '^(AND|THE|FOR|NOT|BUT|ARE|WAS|OUR|YOU|ALL|ANY|HAS|HAD|PER|VIA)[0-9]{1,4}$'
--       OR ( upper(vrm) ~ '^[A-Z]{1,2}[0-9]{1,4}$'
--            AND substring(upper(vrm) from '^[A-Z]{1,2}') IN (
--              'AB','AL','B','BA','BB','BD','BH','BL','BN','BR','BS','BT','CA','CB','CF','CH',
--              'CM','CO','CR','CT','CV','CW','DA','DD','DE','DG','DH','DL','DN','DT','DY','E',
--              'EC','EH','EN','EX','FK','FY','G','GL','GU','GY','HA','HD','HG','HP','HR','HS',
--              'HU','HX','IG','IM','IP','IV','JE','KA','KT','KW','KY','L','LA','LD','LE','LL',
--              'LN','LS','LU','M','ME','MK','ML','N','NE','NG','NN','NP','NR','NW','OL','OX',
--              'PA','PE','PH','PL','PO','PR','RG','RH','RM','S','SA','SE','SG','SK','SL','SM',
--              'SN','SO','SP','SR','SS','ST','SW','SY','TA','TD','TF','TN','TQ','TR','TS','TW',
--              'UB','W','WA','WC','WD','WF','WN','WR','WS','WV','YO','ZE') )
--    )
--   UNION ALL
--   SELECT 'inbound_email', id, NULL, body_vrm FROM inbound_email
--    WHERE body_vrm IS NOT NULL AND body_vrm <> '' AND ( /* same three families over body_vrm */
--          upper(body_vrm) IN ('JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST',
--                         'SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER','MONDAY','TUESDAY',
--                         'WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')
--       OR upper(body_vrm) ~ '^(AND|THE|FOR|NOT|BUT|ARE|WAS|OUR|YOU|ALL|ANY|HAS|HAD|PER|VIA)[0-9]{1,4}$'
--       OR ( upper(body_vrm) ~ '^[A-Z]{1,2}[0-9]{1,4}$'
--            AND substring(upper(body_vrm) from '^[A-Z]{1,2}') IN (
--              'AB','AL','B','BA','BB','BD','BH','BL','BN','BR','BS','BT','CA','CB','CF','CH',
--              'CM','CO','CR','CT','CV','CW','DA','DD','DE','DG','DH','DL','DN','DT','DY','E',
--              'EC','EH','EN','EX','FK','FY','G','GL','GU','GY','HA','HD','HG','HP','HR','HS',
--              'HU','HX','IG','IM','IP','IV','JE','KA','KT','KW','KY','L','LA','LD','LE','LL',
--              'LN','LS','LU','M','ME','MK','ML','N','NE','NG','NN','NP','NR','NW','OL','OX',
--              'PA','PE','PH','PL','PO','PR','RG','RH','RM','S','SA','SE','SG','SK','SL','SM',
--              'SN','SO','SP','SR','SS','ST','SW','SY','TA','TD','TF','TN','TQ','TR','TS','TW',
--              'UB','W','WA','WC','WD','WF','WN','WR','WS','WV','YO','ZE') )
--    );
--
-- ROLLBACK: restore from backup_20260709_vrm_junk (UPDATE ... FROM backup WHERE
-- source/row match). The backup table is retained until the operator drops it.
-- Apply as the table owner (SET ROLE csadmin) -- case_/inbound_email carry RLS.
-- =============================================================================

BEGIN;

-- 0. Backup table (idempotent).
CREATE TABLE IF NOT EXISTS backup_20260709_vrm_junk (
  source     text NOT NULL,          -- 'case_' | 'inbound_email'
  row_id     uuid NOT NULL,
  old_value  text NOT NULL,
  backed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, row_id)
);

-- Junk predicate as a reusable CTE seed: the three families, minus any STRICT
-- DVLA shape (defensive -- none of the families can be one, but belt-and-braces).
-- Strict shapes: current AA00AAA / prefix A0AAA..A000AAA / suffix AAA0A..AAA000A.

-- 1. case_.vrm -----------------------------------------------------------------
WITH junk AS (
  SELECT id, case_po, upper(vrm) AS bad
    FROM case_
   WHERE vrm IS NOT NULL AND vrm <> ''
     AND upper(vrm) !~ '^([A-Z]{2}[0-9]{2}[A-Z]{3}|[A-Z][0-9]{1,3}[A-Z]{3}|[A-Z]{3}[0-9]{1,3}[A-Z])$'
     AND (
           upper(vrm) IN ('JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST',
                          'SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER','MONDAY','TUESDAY',
                          'WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')
        OR upper(vrm) ~ '^(AND|THE|FOR|NOT|BUT|ARE|WAS|OUR|YOU|ALL|ANY|HAS|HAD|PER|VIA)[0-9]{1,4}$'
        OR ( upper(vrm) ~ '^[A-Z]{1,2}[0-9]{1,4}$'
             AND substring(upper(vrm) from '^[A-Z]{1,2}') IN (
               'AB','AL','B','BA','BB','BD','BH','BL','BN','BR','BS','BT','CA','CB','CF','CH',
               'CM','CO','CR','CT','CV','CW','DA','DD','DE','DG','DH','DL','DN','DT','DY','E',
               'EC','EH','EN','EX','FK','FY','G','GL','GU','GY','HA','HD','HG','HP','HR','HS',
               'HU','HX','IG','IM','IP','IV','JE','KA','KT','KW','KY','L','LA','LD','LE','LL',
               'LN','LS','LU','M','ME','MK','ML','N','NE','NG','NN','NP','NR','NW','OL','OX',
               'PA','PE','PH','PL','PO','PR','RG','RH','RM','S','SA','SE','SG','SK','SL','SM',
               'SN','SO','SP','SR','SS','ST','SW','SY','TA','TD','TF','TN','TQ','TR','TS','TW',
               'UB','W','WA','WC','WD','WF','WN','WR','WS','WV','YO','ZE') )
     )
),
backed AS (
  INSERT INTO backup_20260709_vrm_junk (source, row_id, old_value)
  SELECT 'case_', id, bad FROM junk
  ON CONFLICT (source, row_id) DO NOTHING
  RETURNING row_id
),
cleared AS (
  UPDATE case_ c SET vrm = NULL, updated_at = now()
    FROM junk j WHERE c.id = j.id
  RETURNING c.id, j.bad, j.case_po
)
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT left('Registration cleared (captured wrongly from the message text): ' || cl.bad, 400),
       cl.id,
       'delta:2026-07-09-vrm-junk-cleanup',
       100000013,   -- status_changed (nearest-fit generic case-mutation code; no field-correction code exists)
       100000000,   -- info
       json_build_object('vrm', cl.bad)::text,
       json_build_object('vrm', NULL)::text,
       now()
  FROM cleared cl;

-- 2. inbound_email.body_vrm ------------------------------------------------------
WITH junk AS (
  SELECT id, upper(body_vrm) AS bad
    FROM inbound_email
   WHERE body_vrm IS NOT NULL AND body_vrm <> ''
     AND upper(body_vrm) !~ '^([A-Z]{2}[0-9]{2}[A-Z]{3}|[A-Z][0-9]{1,3}[A-Z]{3}|[A-Z]{3}[0-9]{1,3}[A-Z])$'
     AND (
           upper(body_vrm) IN ('JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST',
                          'SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER','MONDAY','TUESDAY',
                          'WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')
        OR upper(body_vrm) ~ '^(AND|THE|FOR|NOT|BUT|ARE|WAS|OUR|YOU|ALL|ANY|HAS|HAD|PER|VIA)[0-9]{1,4}$'
        OR ( upper(body_vrm) ~ '^[A-Z]{1,2}[0-9]{1,4}$'
             AND substring(upper(body_vrm) from '^[A-Z]{1,2}') IN (
               'AB','AL','B','BA','BB','BD','BH','BL','BN','BR','BS','BT','CA','CB','CF','CH',
               'CM','CO','CR','CT','CV','CW','DA','DD','DE','DG','DH','DL','DN','DT','DY','E',
               'EC','EH','EN','EX','FK','FY','G','GL','GU','GY','HA','HD','HG','HP','HR','HS',
               'HU','HX','IG','IM','IP','IV','JE','KA','KT','KW','KY','L','LA','LD','LE','LL',
               'LN','LS','LU','M','ME','MK','ML','N','NE','NG','NN','NP','NR','NW','OL','OX',
               'PA','PE','PH','PL','PO','PR','RG','RH','RM','S','SA','SE','SG','SK','SL','SM',
               'SN','SO','SP','SR','SS','ST','SW','SY','TA','TD','TF','TN','TQ','TR','TS','TW',
               'UB','W','WA','WC','WD','WF','WN','WR','WS','WV','YO','ZE') )
     )
),
backed AS (
  INSERT INTO backup_20260709_vrm_junk (source, row_id, old_value)
  SELECT 'inbound_email', id, bad FROM junk
  ON CONFLICT (source, row_id) DO NOTHING
  RETURNING row_id
)
UPDATE inbound_email e SET body_vrm = NULL, updated_at = now()
  FROM junk j WHERE e.id = j.id;

COMMIT;

-- POST-CHECK (expect 0 remaining in each family):
--   re-run the PRE-CHECK SELECT -- both halves must return zero rows.
--   SELECT source, count(*) FROM backup_20260709_vrm_junk GROUP BY source;  -- the cleared totals
