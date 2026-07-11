-- TKT-144 confirmation window — READ-ONLY (temp table only) post-run verification.
\set ON_ERROR_STOP on
SET ROLE csadmin;
SELECT current_user AS effective_role;

-- 1. Every hash-run row now carries EXACTLY the computed hash (477 expected)
CREATE TEMP TABLE stage_hash (
  id uuid PRIMARY KEY, storage_path text, outcome text, sha256 text, bytes bigint, note text
);
\copy stage_hash FROM '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/hash-run-log.csv' CSV HEADER
SELECT count(*) FILTER (WHERE e.sha256 = lower(s.sha256)) AS worklist_rows_carrying_computed_hash,
       count(*) FILTER (WHERE e.sha256 IS DISTINCT FROM lower(s.sha256)) AS mismatches,
       count(*) AS log_rows
  FROM stage_hash s LEFT JOIN evidence e ON e.id = s.id;

-- 2. Exact stamped-in-window split via the single-txn timestamp T
--    (blob rows updated at T = stamped + 108 twins + 1 role-absorb survivor)
WITH t AS (SELECT occurred_at AS ts FROM audit_event
            WHERE actor = 'tkt144-blob-sha256-backfill' AND action_code = 100000005 LIMIT 1)
SELECT (SELECT ts FROM t) AS txn_time,
       count(*) AS blob_rows_updated_at_T,
       count(*) - 109 AS rows_stamped_in_window,
       477 - (count(*) - 109) AS equal_stamped_between_windows
  FROM evidence e, t
 WHERE e.storage_path IS NOT NULL AND e.updated_at = t.ts;

-- 3. Blob-lane sha coverage, clean print (read-window print was clobbered)
SELECT count(*) FILTER (WHERE sha256 IS NULL) AS blob_null_sha,
       count(*) FILTER (WHERE sha256 IS NOT NULL) AS blob_has_sha,
       count(*) AS blob_total
  FROM evidence WHERE storage_path IS NOT NULL;

-- 4. The audits this run wrote
SELECT a.occurred_at, a.case_id, c.case_po, a.name, a.before, a.after
  FROM audit_event a LEFT JOIN case_ c ON c.id = a.case_id
 WHERE a.actor = 'tkt144-blob-sha256-backfill'
 ORDER BY a.action_code, c.case_po;
SELECT action_code, count(*) FROM audit_event
 WHERE actor = 'tkt144-blob-sha256-backfill' GROUP BY 1;

-- 5. Sample collapsed pair state (the first spot-checked group)
SELECT id, excluded, accepted_for_eva, left(coalesce(exclusion_reason, ''), 160) AS reason, image_role_code
  FROM evidence
 WHERE case_id = '68442a2a-998c-4a16-89ba-8fe226303734' AND file_name = '575617__RJS_UnknownVRM_img_10_50.jpeg'
 ORDER BY excluded, created_at;

-- 6. The no-PO affected case be1a0a11 — explain accepted_ct=0
SELECT c.id, c.case_po, c.vrm, s.name AS status,
       count(e.id) FILTER (WHERE e.kind_code = 100000000)                                        AS image_rows,
       count(e.id) FILTER (WHERE e.kind_code = 100000000 AND e.excluded)                          AS image_excluded,
       count(e.id) FILTER (WHERE e.kind_code = 100000000 AND NOT e.excluded AND NOT e.accepted_for_eva) AS image_active_not_accepted,
       count(e.id) FILTER (WHERE e.kind_code = 100000000 AND NOT e.excluded AND e.accepted_for_eva)     AS image_accepted
  FROM case_ c JOIN choice_case_status s ON s.code = c.status_code
  LEFT JOIN evidence e ON e.case_id = c.id
 WHERE c.id = 'be1a0a11-8a22-4fef-a0e6-878090360f0c'
 GROUP BY c.id, c.case_po, c.vrm, s.name;

-- 7. Discovery refinements (report-only)
-- 7a. different-name same-hash ACTIVE buckets restricted to blob-lane rows
SELECT count(*) AS diff_name_same_hash_blob_only_buckets
  FROM (SELECT case_id, sha256 FROM evidence
         WHERE excluded = false AND sha256 IS NOT NULL AND storage_path IS NOT NULL
         GROUP BY 1, 2 HAVING count(*) >= 2 AND count(DISTINCT file_name) > 1) x;
-- 7b. same-case same-hash ACTIVE buckets (any name), post-2026-07-09 rows only
SELECT count(*) AS post_0709_active_same_sha_buckets
  FROM (SELECT case_id, sha256 FROM evidence
         WHERE excluded = false AND sha256 IS NOT NULL AND created_at > '2026-07-09 12:00:00+00'
         GROUP BY 1, 2 HAVING count(*) >= 2) x;
-- 7c. of those, buckets whose rows ALL arrived today (2026-07-10, the api-dedup-live era)
SELECT count(*) AS post_0710_active_same_sha_buckets
  FROM (SELECT case_id, sha256 FROM evidence
         WHERE excluded = false AND sha256 IS NOT NULL AND created_at > '2026-07-10 00:00:00+00'
         GROUP BY 1, 2 HAVING count(*) >= 2) x;
-- 7d. shape sample for the follow-up ticket
\copy (SELECT c.case_po, x.case_id, x.sha256, x.n, x.names, x.min_created, x.max_created FROM (SELECT case_id, sha256, count(*) AS n, count(DISTINCT file_name) AS names, min(created_at) AS min_created, max(created_at) AS max_created FROM evidence WHERE excluded = false AND sha256 IS NOT NULL AND created_at > '2026-07-09 12:00:00+00' GROUP BY 1, 2 HAVING count(*) >= 2) x LEFT JOIN case_ c ON c.id = x.case_id ORDER BY x.max_created DESC LIMIT 40) TO '/mnt/c/Users/Alex/AppData/Local/Temp/claude/C--Users-Alex-Documents-GitHub-collisionsuite-active-collisionspike/da201efb-1edd-46a8-96bb-934171b9929d/scratchpad/post0709-buckets-sample.csv' CSV HEADER

SELECT 'confirmation window complete' AS done;
