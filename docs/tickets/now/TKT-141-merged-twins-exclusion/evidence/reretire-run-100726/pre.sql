-- TKT-141 reopen data pass — PRE queries (verifier-queued Q1/Q2/Q3 + backup CSV).
-- Run as: psql … -c 'SET ROLE csadmin' then this file, ONE session, BEFORE the
-- delta 2026-07-10-tkt141-re-retire-merged.sql. Outputs saved to this folder.
SET ROLE csadmin;
\pset pager off

\echo ===== Q1: the five merge-party rows (current state) =====
SELECT id, case_po, case_ref, vrm, status_code, on_hold,
       to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at, duplicate_keys
  FROM case_
 WHERE id IN ('68442a2a-998c-4a16-89ba-8fe226303734',   -- PCH26009 survivor (PK20FWT)
              'cd9092ce-1956-4df3-80d3-6cc77ee31d9f',   -- PCH26018 retired
              '19b96214-4770-4ea7-ac56-c63741a4f430',   -- PCH26020 retired
              'be1a0a11-8a22-4fef-a0e6-878090360f0c',   -- YH13ZSN survivor
              'd1d862bd-1ae4-4028-b81e-392ff6a75029')   -- YH13ZSN retired
 ORDER BY vrm, case_po NULLS LAST;

\echo ===== Q2: append-only audit trail since 2026-07-09 for the three retired rows (what re-opened them) =====
SELECT to_char(occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at,
       case_id, actor, action_code, name, before, after
  FROM audit_event
 WHERE case_id IN ('cd9092ce-1956-4df3-80d3-6cc77ee31d9f',
                   '19b96214-4770-4ea7-ac56-c63741a4f430',
                   'd1d862bd-1ae4-4028-b81e-392ff6a75029')
   AND occurred_at >= '2026-07-09'
 ORDER BY occurred_at;

\echo ===== Q3 (strict, = mergedIntoFrom semantics): ALL rows carrying a mergedInto marker with status <> 100000006 =====
SELECT id, case_po, case_ref, vrm, status_code, on_hold,
       to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at, duplicate_keys
  FROM case_
 WHERE pg_input_is_valid(duplicate_keys, 'jsonb')
   AND COALESCE(trim(duplicate_keys::jsonb ->> 'mergedInto'), '') <> ''
   AND status_code <> 100000006
 ORDER BY updated_at;

\echo ===== Q3 (loose LIKE variant, drift check vs strict) =====
SELECT count(*) AS loose_count
  FROM case_
 WHERE duplicate_keys LIKE '%mergedInto%'
   AND status_code <> 100000006;

\echo ===== Whole marker population (any status) for the record =====
SELECT status_code, count(*)
  FROM case_
 WHERE pg_input_is_valid(duplicate_keys, 'jsonb')
   AND COALESCE(trim(duplicate_keys::jsonb ->> 'mergedInto'), '') <> ''
 GROUP BY status_code ORDER BY status_code;

\echo ===== Backup CSV (pre-state of every column the delta mutates, whole marker population) =====
\copy (SELECT id, case_po, case_ref, vrm, status_code, on_hold, duplicate_keys, updated_at FROM case_ WHERE pg_input_is_valid(duplicate_keys, 'jsonb') AND COALESCE(trim(duplicate_keys::jsonb ->> 'mergedInto'), '') <> '' ORDER BY vrm, case_po NULLS LAST) TO '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-141-merged-twins-exclusion/evidence/reretire-run-100726/backup-prestate-100726.csv' WITH CSV HEADER
\echo backup CSV written
