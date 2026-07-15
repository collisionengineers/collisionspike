-- =============================================================================
-- 2026-07-10-tkt141-re-retire-merged.sql
-- TKT-141 (REOPENED) -- re-retire the merge-retired cases the status recompute
-- un-retired -- DATA ONLY (the durable fix, the retired-lock in
-- packages/domain/src/contracts/case-status.ts statusForReviewCase, deploys
-- BEFORE this delta runs so churn cannot un-retire the rows again).
-- -----------------------------------------------------------------------------
-- Background: the 2026-07-09 TKT-092 merges (delta 2026-07-09-intake-wave-data-
-- fixes.sql) retired PCH26018 (cd9092ce-...), PCH26020 (19b96214-...) and the
-- YH13ZSN duplicate (d1d862bd-...) into linked_to_instruction (100000006) with a
-- duplicate_keys.mergedInto survivor marker. `linked_to_instruction` is a
-- NON-terminal branch state and the pre-lock statusForReviewCase recomputed it
-- from fields/images with no knowledge of the marker, so intake churn flipped
-- all three back to needs_review (the 2026-07-10 verifier FAILED verdict: the
-- PK20FWT twin badge read 3, expected 1).
--
-- This delta re-retires the WHOLE un-retired population dynamically: every
-- non-terminal case_ row whose duplicate_keys is valid JSON carrying a
-- non-blank `mergedInto` (the exact predicate api/src/lib/mappers.ts
-- mergedIntoFrom applies) with status_code <> 100000006. Terminal rows
-- (eva_submitted/box_synced/error/removed/done) are LEFT ALONE -- the domain
-- retired-lock respects terminals, so must the data fix (none expected; the
-- pre-pass Q3 would surface any).
--
-- BACKUP-FIRST + AUDITED + IDEMPOTENT + TRANSACTIONAL:
--   * affected case_ rows snapshot into backup_20260710_tkt141_reretire
--     (full row as jsonb, ON CONFLICT DO NOTHING) -- plus the runner \copy's a
--     pre-state CSV of the mutated columns into the ticket evidence folder;
--   * ONE audit_event per re-retired case (status_changed 100000013, actor
--     'delta:2026-07-10-tkt141-re-retire-merged', before/after status codes);
--   * WHERE guards make every statement a no-op on re-run (the population is
--     empty once status_code = 100000006).
--
-- ROLLBACK: restore status_code/on_hold from backup_20260710_tkt141_reretire
-- (snapshot holds the full pre-mutation row as jsonb).
-- Apply as the table owner (SET ROLE csadmin) -- RLS tables.
-- =============================================================================

BEGIN;

-- 0. Backup table (idempotent).
CREATE TABLE IF NOT EXISTS backup_20260710_tkt141_reretire (
  source     text NOT NULL,          -- 'case_'
  row_id     uuid NOT NULL,
  snapshot   jsonb NOT NULL,
  backed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, row_id)
);

-- 1. Snapshot the un-retired merge-marked population (full rows) BEFORE mutation.
INSERT INTO backup_20260710_tkt141_reretire (source, row_id, snapshot)
SELECT 'case_', c.id, to_jsonb(c)
  FROM case_ c
 CROSS JOIN LATERAL (
   SELECT CASE
            WHEN pg_input_is_valid(c.duplicate_keys, 'jsonb')
              THEN c.duplicate_keys::jsonb
          END AS duplicate_json
 ) parsed
 WHERE jsonb_typeof(parsed.duplicate_json -> 'mergedInto') = 'string'
   AND NULLIF(btrim(parsed.duplicate_json ->> 'mergedInto'), '') IS NOT NULL
   AND c.status_code <> 100000006
ON CONFLICT (source, row_id) DO NOTHING;

-- 2. Re-retire the population (status -> linked_to_instruction 100000006,
--    on_hold false -- the same shape the mergeCases route and the 2026-07-09
--    merge delta write) and audit each row on itself. Terminals excluded.
WITH pop AS (
  SELECT c.id, c.status_code AS before_code
    FROM case_ c
   CROSS JOIN LATERAL (
     SELECT CASE
              WHEN pg_input_is_valid(c.duplicate_keys, 'jsonb')
                THEN c.duplicate_keys::jsonb
            END AS duplicate_json
   ) parsed
   WHERE jsonb_typeof(parsed.duplicate_json -> 'mergedInto') = 'string'
     AND NULLIF(btrim(parsed.duplicate_json ->> 'mergedInto'), '') IS NOT NULL
     AND c.status_code <> 100000006
     AND c.status_code NOT IN (100000008, 100000009, 100000010, 100000011, 100000012)  -- terminals
),
upd AS (
  UPDATE case_ c
     SET status_code = 100000006,
         on_hold = false,
         updated_at = now()
    FROM pop
   WHERE c.id = pop.id
  RETURNING c.id, pop.before_code
)
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT 'Re-retired merge-retired duplicate: status restored to linked_to_instruction (TKT-141 -- un-retired by a pre-retired-lock status recompute)',
       upd.id,
       'delta:2026-07-10-tkt141-re-retire-merged',
       100000013,  -- status_changed
       100000000,  -- info
       json_build_object('statusCode', upd.before_code)::text,
       json_build_object('statusCode', 100000006, 'reason', 'tkt141_re_retire',
                         'lock', 'statusForReviewCase retired-lock deployed 2026-07-10')::text,
       now()
  FROM upd;

COMMIT;

-- POST-CHECK (expected):
--   * un-retired population empty:
--       WITH parsed AS (
--         SELECT c.*,
--                CASE WHEN pg_input_is_valid(c.duplicate_keys,'jsonb')
--                     THEN c.duplicate_keys::jsonb END AS duplicate_json
--           FROM case_ c)
--       SELECT count(*) FROM parsed
--        WHERE jsonb_typeof(duplicate_json->'mergedInto') = 'string'
--          AND NULLIF(btrim(duplicate_json->>'mergedInto'),'') IS NOT NULL
--          AND status_code <> 100000006;                                   -- 0
--   * openVrmTwins parity (TWIN_TERMINAL = 100000008/9/11/12; retired-merged
--     excluded like the terminal set):
--       WITH parsed AS (
--         SELECT c.*,
--                CASE WHEN pg_input_is_valid(c.duplicate_keys,'jsonb')
--                     THEN c.duplicate_keys::jsonb END AS duplicate_json
--           FROM case_ c)
--       SELECT count(*) FROM parsed
--        WHERE regexp_replace(upper(vrm),'[^A-Z0-9]','','g') = 'PK20FWT'
--          AND status_code NOT IN (100000008,100000009,100000011,100000012)
--          AND NOT (status_code = 100000006
--                   AND jsonb_typeof(duplicate_json->'mergedInto') = 'string'
--                   AND NULLIF(btrim(duplicate_json->>'mergedInto'),'') IS NOT NULL);  -- 1
--     (repeat for YH13ZSN -- 1)
--   * audits: SELECT count(*) FROM audit_event
--       WHERE actor = 'delta:2026-07-10-tkt141-re-retire-merged';          -- = rows re-retired
--   * backups: SELECT count(*) FROM backup_20260710_tkt141_reretire;
