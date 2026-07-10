-- TKT-144 read window — enumeration + backups (READ-ONLY; \copy exports client-side)
\set ON_ERROR_STOP on
SET ROLE csadmin;
SELECT current_user AS effective_role, session_user;

-- ============ A. Landscape counts ============
SELECT count(*) FILTER (WHERE sha256 IS NULL) AS blob_null_sha,
       count(*) FILTER (WHERE sha256 IS NOT NULL) AS blob_has_sha,
       count(*) AS blob_total
  FROM evidence WHERE storage_path IS NOT NULL;

SELECT e.kind_code, k.name AS kind, e.excluded, count(*)
  FROM evidence e JOIN choice_evidence_kind k ON k.code = e.kind_code
 WHERE e.storage_path IS NOT NULL AND e.sha256 IS NULL
 GROUP BY 1,2,3 ORDER BY 1,3;

SELECT count(*) AS worklist_n, sum(size_bytes) AS total_bytes, max(size_bytes) AS max_bytes,
       count(*) FILTER (WHERE size_bytes IS NULL) AS null_size,
       count(*) FILTER (WHERE size_bytes > 104857600) AS over_100mib
  FROM evidence WHERE storage_path IS NOT NULL AND sha256 IS NULL;

-- ============ B. Same-name active blob groups (two candidate definitions) ============
WITH b AS (SELECT id, case_id, file_name FROM evidence WHERE storage_path IS NOT NULL AND excluded = false),
     g AS (SELECT case_id, file_name, count(*) AS n FROM b GROUP BY 1,2 HAVING count(*) >= 2)
SELECT 'defA_anykind' AS def,
       (SELECT coalesce(sum(n),0) FROM g) AS rows_in_groups,
       (SELECT count(*) FROM g)           AS groups,
       (SELECT coalesce(sum(n*(n-1)/2),0) FROM g) AS pairs;

WITH b AS (SELECT id, case_id, file_name FROM evidence WHERE storage_path IS NOT NULL AND excluded = false AND kind_code = 100000000),
     g AS (SELECT case_id, file_name, count(*) AS n FROM b GROUP BY 1,2 HAVING count(*) >= 2)
SELECT 'defB_imageonly' AS def,
       (SELECT coalesce(sum(n),0) FROM g) AS rows_in_groups,
       (SELECT count(*) FROM g)           AS groups,
       (SELECT coalesce(sum(n*(n-1)/2),0) FROM g) AS pairs;

WITH b AS (SELECT id, case_id, file_name FROM evidence WHERE storage_path IS NOT NULL AND excluded = false),
     g AS (SELECT case_id, file_name, count(*) AS n FROM b GROUP BY 1,2 HAVING count(*) >= 2)
SELECT n AS group_size, count(*) AS groups FROM g GROUP BY n ORDER BY n;

WITH b AS (SELECT case_id, file_name FROM evidence WHERE storage_path IS NOT NULL AND excluded = false),
     g AS (SELECT DISTINCT case_id FROM (SELECT case_id FROM b GROUP BY case_id, file_name HAVING count(*) >= 2) x)
SELECT s.name AS case_status, count(*) AS cases
  FROM g JOIN case_ c ON c.id = g.case_id JOIN choice_case_status s ON s.code = c.status_code
 GROUP BY 1 ORDER BY 2 DESC;

-- ============ C. Template shapes from TKT-133's live run ============
SELECT occurred_at, actor, name, left(coalesce(before,''),160) AS before_s, left(coalesce(after,''),240) AS after_s
  FROM audit_event WHERE action_code = 100000005 ORDER BY occurred_at DESC LIMIT 4;

SELECT left(exclusion_reason,120) AS exclusion_reason, count(*)
  FROM evidence WHERE exclusion_reason ILIKE '%duplicate%' GROUP BY 1 ORDER BY 2 DESC LIMIT 8;

SELECT occurred_at, actor, name FROM audit_event WHERE action_code = 100000013 ORDER BY occurred_at DESC LIMIT 4;

-- ============ D. Hash self-test candidates (rows that ALREADY carry sha256) ============
SELECT id, storage_path, sha256, size_bytes FROM evidence
 WHERE storage_path IS NOT NULL AND sha256 IS NOT NULL ORDER BY created_at DESC LIMIT 3;

-- ============ E. Non-internal triggers on evidence ============
SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'evidence' AND NOT t.tgisinternal;

-- ============ F. Exports ============
-- F1 full-row backup of every row this ticket may touch:
--    (all blob rows lacking sha256) UNION (active blob rows in same-name groups)
\copy (WITH stamp_targets AS (SELECT e.* FROM evidence e WHERE e.storage_path IS NOT NULL AND e.sha256 IS NULL), pairs AS (SELECT e.* FROM evidence e JOIN (SELECT case_id, file_name FROM evidence WHERE storage_path IS NOT NULL AND excluded = false GROUP BY case_id, file_name HAVING count(*) >= 2) g ON g.case_id = e.case_id AND g.file_name = e.file_name WHERE e.storage_path IS NOT NULL AND e.excluded = false) SELECT * FROM stamp_targets UNION SELECT * FROM pairs ORDER BY case_id, file_name, created_at) TO '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/backup-before.csv' CSV HEADER

-- F2 hash worklist (scratch): every blob row lacking sha256 (active + excluded)
\copy (SELECT e.id, e.case_id, c.case_po, e.file_name, e.kind_code, e.excluded, e.size_bytes, e.storage_path FROM evidence e LEFT JOIN case_ c ON c.id = e.case_id WHERE e.storage_path IS NOT NULL AND e.sha256 IS NULL ORDER BY e.case_id, e.created_at) TO '/mnt/c/Users/Alex/AppData/Local/Temp/claude/C--Users-Alex-Documents-GitHub-collisionsuite-active-collisionspike/da201efb-1edd-46a8-96bb-934171b9929d/scratchpad/hash-worklist.csv' CSV HEADER

-- F3 pair-set detail (scratch): the active same-name blob group rows + case status
\copy (SELECT e.id, e.case_id, c.case_po, s.name AS case_status, e.file_name, e.kind_code, e.image_role_code, e.accepted_for_eva, e.registration_visible, e.person_reflection, e.sha256, e.size_bytes, e.storage_path, e.box_file_id, e.box_file_url, e.source_message_id, e.created_at FROM evidence e JOIN (SELECT case_id, file_name FROM evidence WHERE storage_path IS NOT NULL AND excluded = false GROUP BY case_id, file_name HAVING count(*) >= 2) g ON g.case_id = e.case_id AND g.file_name = e.file_name JOIN case_ c ON c.id = e.case_id JOIN choice_case_status s ON s.code = c.status_code WHERE e.storage_path IS NOT NULL AND e.excluded = false ORDER BY e.case_id, e.file_name, e.created_at) TO '/mnt/c/Users/Alex/AppData/Local/Temp/claude/C--Users-Alex-Documents-GitHub-collisionsuite-active-collisionspike/da201efb-1edd-46a8-96bb-934171b9929d/scratchpad/pair-rows.csv' CSV HEADER

-- F4 case-status snapshot backup (all non-terminal; terminals incl. done excluded)
\copy (SELECT c.id, c.case_po, c.status_code, s.name AS status, now() AS backed_up_at FROM case_ c JOIN choice_case_status s ON s.code = c.status_code WHERE c.status_code NOT IN (100000008,100000009,100000010,100000011,100000012)) TO '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/backup-case-status-before.csv' CSV HEADER

SELECT 'read window complete' AS done;
