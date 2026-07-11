-- TKT-141 reopen data pass — POST checks. Run in the SAME window, AFTER the
-- delta 2026-07-10-tkt141-re-retire-merged.sql. Outputs saved to this folder.
SET ROLE csadmin;
\pset pager off

\echo ===== POST Q3 re-run: un-retired marker population (expected 0 rows) =====
SELECT id, case_po, vrm, status_code
  FROM case_
 WHERE pg_input_is_valid(duplicate_keys, 'jsonb')
   AND COALESCE(trim(duplicate_keys::jsonb ->> 'mergedInto'), '') <> ''
   AND status_code <> 100000006;

\echo ===== POST Q1 re-run: the five merge-party rows =====
SELECT id, case_po, case_ref, vrm, status_code, on_hold,
       to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
  FROM case_
 WHERE id IN ('68442a2a-998c-4a16-89ba-8fe226303734',
              'cd9092ce-1956-4df3-80d3-6cc77ee31d9f',
              '19b96214-4770-4ea7-ac56-c63741a4f430',
              'be1a0a11-8a22-4fef-a0e6-878090360f0c',
              'd1d862bd-1ae4-4028-b81e-392ff6a75029')
 ORDER BY vrm, case_po NULLS LAST;

\echo ===== openVrmTwins SQL parity: PK20FWT open twins (expected 1 = survivor PCH26009) =====
-- TWIN_TERMINAL (api/src/lib/mappers.ts) = eva_submitted 100000008, box_synced
-- 100000009, removed 100000011, done 100000012 (error stays an open twin);
-- retired-merged (linked_to_instruction + marker) excluded exactly like the
-- terminal set (cases.ts openVrmTwins + isRetiredMerged).
SELECT count(*) AS pk20fwt_open_twins
  FROM case_
 WHERE regexp_replace(upper(vrm), '[^A-Z0-9]', '', 'g') = 'PK20FWT'
   AND status_code NOT IN (100000008, 100000009, 100000011, 100000012)
   AND NOT (status_code = 100000006
            AND pg_input_is_valid(duplicate_keys, 'jsonb')
            AND COALESCE(trim(duplicate_keys::jsonb ->> 'mergedInto'), '') <> '');

\echo ===== openVrmTwins SQL parity: YH13ZSN open twins (expected 1 = survivor be1a0a11) =====
SELECT count(*) AS yh13zsn_open_twins
  FROM case_
 WHERE regexp_replace(upper(vrm), '[^A-Z0-9]', '', 'g') = 'YH13ZSN'
   AND status_code NOT IN (100000008, 100000009, 100000011, 100000012)
   AND NOT (status_code = 100000006
            AND pg_input_is_valid(duplicate_keys, 'jsonb')
            AND COALESCE(trim(duplicate_keys::jsonb ->> 'mergedInto'), '') <> '');

\echo ===== audit rows written by this delta (expected = re-retired row count) =====
SELECT to_char(occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at, case_id, name, before, after
  FROM audit_event
 WHERE actor = 'delta:2026-07-10-tkt141-re-retire-merged'
 ORDER BY occurred_at;

\echo ===== backup table contents =====
SELECT source, row_id, backed_at FROM backup_20260710_tkt141_reretire ORDER BY row_id;
