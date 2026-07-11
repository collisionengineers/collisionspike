-- =============================================================================
-- TKT-144 write window — sha256 backfill stamp + same-name byte-twin collapse +
-- per-case duplicate_dropped audits + statusForReviewCase SQL-parity re-eval.
-- ONE transaction; every write guarded + restricted to rows in the committed
-- backup (backup-first). Template: TKT-133 collapse pattern + the recorded
-- 2026-07-08 delta re-eval shape (terminals INCL. done excluded).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE csadmin;
SELECT current_user AS effective_role, session_user;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Load the hash-run log + the committed backup (the only touchable rows)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE stage_hash (
  id uuid PRIMARY KEY, storage_path text, outcome text, sha256 text, bytes bigint, note text
) ON COMMIT DROP;
\copy stage_hash FROM '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/hash-run-log.csv' CSV HEADER

CREATE TEMP TABLE stage_backup (LIKE evidence) ON COMMIT DROP;
\copy stage_backup FROM '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/backup-before.csv' CSV HEADER

SELECT outcome, count(*) FROM stage_hash GROUP BY 1 ORDER BY 1;
SELECT count(*) AS backup_rows_loaded FROM stage_backup;

-- Abort guards: malformed hashes, or a computed hash disagreeing with a value
-- some live path stamped between the windows (must never overwrite).
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM stage_hash WHERE outcome = 'hashed' AND lower(sha256) !~ '^[0-9a-f]{64}$';
  IF bad > 0 THEN RAISE EXCEPTION 'TKT-144 abort: % hashed rows with malformed sha256', bad; END IF;
  SELECT count(*) INTO bad FROM stage_hash s JOIN evidence e ON e.id = s.id
   WHERE s.outcome = 'hashed' AND e.sha256 IS NOT NULL AND e.sha256 <> lower(s.sha256);
  IF bad > 0 THEN RAISE EXCEPTION 'TKT-144 abort: % rows where the computed sha256 disagrees with an existing evidence.sha256', bad; END IF;
END $$;

-- Rows that gained an (equal) sha256 between windows — stamp will skip them.
SELECT count(*) AS already_stamped_between_windows
  FROM stage_hash s JOIN evidence e ON e.id = s.id
 WHERE s.outcome = 'hashed' AND e.sha256 IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. STAMP: guarded, idempotent, never overwrites (sha256 IS NULL), only
--    backed-up rows, lowercase hex (the api SHA256_HEX_RE shape).
-- ---------------------------------------------------------------------------
WITH s AS (
  SELECT h.id, lower(h.sha256) AS sha256
    FROM stage_hash h
    JOIN stage_backup b ON b.id = h.id
   WHERE h.outcome = 'hashed'
),
upd AS (
  UPDATE evidence e
     SET sha256 = s.sha256, updated_at = now()
    FROM s
   WHERE e.id = s.id AND e.sha256 IS NULL
  RETURNING e.id
)
SELECT count(*) AS rows_stamped FROM upd;

SELECT count(*) AS blob_null_sha_remaining
  FROM evidence WHERE storage_path IS NOT NULL AND sha256 IS NULL;

-- ---------------------------------------------------------------------------
-- 3. The dedup class AT WRITE TIME, restricted to backed-up rows:
--    active (excluded=false) image-kind blob-lane rows sharing (case_id,
--    file_name) with >=2 such rows. Post-enumeration arrivals are counted and
--    left untouched.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE dedup_groups ON COMMIT DROP AS
WITH p AS (
  SELECT e.id, e.case_id, e.file_name, e.sha256, e.created_at
    FROM evidence e
    JOIN stage_backup b ON b.id = e.id
   WHERE e.storage_path IS NOT NULL AND e.excluded = false AND e.kind_code = 100000000
),
g AS (SELECT case_id, file_name FROM p GROUP BY 1, 2 HAVING count(*) >= 2)
SELECT p.* FROM p JOIN g ON g.case_id = p.case_id AND g.file_name = p.file_name;

SELECT count(*) AS class_rows_at_write_time,
       count(DISTINCT (case_id, file_name)) AS groups,
       count(*) FILTER (WHERE sha256 IS NULL) AS rows_unhashed
  FROM dedup_groups;

-- live-class rows NOT in the backup (post-enumeration arrivals; untouched)
SELECT count(*) AS live_class_rows_not_in_backup
  FROM (SELECT e.id
          FROM evidence e
          JOIN (SELECT case_id, file_name FROM evidence
                 WHERE storage_path IS NOT NULL AND excluded = false AND kind_code = 100000000
                 GROUP BY 1, 2 HAVING count(*) >= 2) g
            ON g.case_id = e.case_id AND g.file_name = e.file_name
         WHERE e.storage_path IS NOT NULL AND e.excluded = false AND e.kind_code = 100000000
           AND NOT EXISTS (SELECT 1 FROM stage_backup b WHERE b.id = e.id)) x;

-- ---------------------------------------------------------------------------
-- 4. COLLAPSE PLAN: byte-hash equality ONLY. Within (case_id, file_name,
--    sha256) buckets of >=2 hashed rows: survivor = earliest created_at
--    (tie: id). Different hashes = genuinely distinct = untouched.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE collapse_plan ON COMMIT DROP AS
SELECT case_id, file_name, sha256,
       (array_agg(id ORDER BY created_at, id))[1] AS survivor_id,
       (array_agg(id ORDER BY created_at, id))[2:] AS twin_ids,
       count(*) AS n
  FROM dedup_groups
 WHERE sha256 IS NOT NULL
 GROUP BY case_id, file_name, sha256
HAVING count(*) >= 2;

CREATE TEMP TABLE twins ON COMMIT DROP AS
SELECT cp.case_id, cp.file_name, cp.survivor_id, t.twin_id
  FROM collapse_plan cp, unnest(cp.twin_ids) AS t(twin_id);

SELECT count(*) AS collapse_buckets, coalesce(sum(n) - count(*), 0) AS twins_planned FROM collapse_plan;

-- ---------------------------------------------------------------------------
-- 5. Soft-merge the twins (TKT-133 pattern): excluded + not accepted + a
--    plain-language reason naming the survivor. Schema CHECK satisfied.
-- ---------------------------------------------------------------------------
WITH upd AS (
  UPDATE evidence e
     SET excluded = true,
         accepted_for_eva = false,
         exclusion_reason = left('Duplicate of this case''s copy of the same photo (byte-identical; kept once as ' || t.survivor_id || ') — TKT-144 sha256 backfill', 400),
         updated_at = now()
    FROM twins t
   WHERE e.id = t.twin_id AND e.excluded = false
  RETURNING e.id, e.case_id
)
SELECT count(*) AS twins_excluded, count(DISTINCT case_id) AS cases_affected FROM upd;

-- ---------------------------------------------------------------------------
-- 6. Absorb provenance onto survivors where absent (guarded fills only).
-- ---------------------------------------------------------------------------
WITH candidate AS (
  SELECT DISTINCT ON (t.survivor_id) t.survivor_id, e.box_file_id, e.box_file_url
    FROM twins t JOIN evidence e ON e.id = t.twin_id
   WHERE e.box_file_id IS NOT NULL
   ORDER BY t.survivor_id, e.created_at
),
upd AS (
  UPDATE evidence s
     SET box_file_id = c.box_file_id,
         box_file_url = COALESCE(s.box_file_url, c.box_file_url),
         updated_at = now()
    FROM candidate c
   WHERE s.id = c.survivor_id AND s.box_file_id IS NULL
  RETURNING s.id
)
SELECT count(*) AS survivors_gained_box_provenance FROM upd;

WITH candidate AS (
  SELECT DISTINCT ON (t.survivor_id) t.survivor_id, e.registration_visible
    FROM twins t JOIN evidence e ON e.id = t.twin_id
   WHERE e.registration_visible IS NOT NULL
   ORDER BY t.survivor_id, e.created_at
),
upd AS (
  UPDATE evidence s
     SET registration_visible = c.registration_visible, updated_at = now()
    FROM candidate c
   WHERE s.id = c.survivor_id AND s.registration_visible IS NULL
  RETURNING s.id
)
SELECT count(*) AS survivors_gained_registration_visible FROM upd;

WITH candidate AS (
  SELECT DISTINCT ON (t.survivor_id) t.survivor_id, e.image_role_code
    FROM twins t JOIN evidence e ON e.id = t.twin_id
   WHERE e.image_role_code <> 100000003
   ORDER BY t.survivor_id, e.created_at
),
upd AS (
  UPDATE evidence s
     SET image_role_code = c.image_role_code, updated_at = now()
    FROM candidate c
   WHERE s.id = c.survivor_id AND s.image_role_code = 100000003
  RETURNING s.id
)
SELECT count(*) AS survivors_gained_role FROM upd;

-- ---------------------------------------------------------------------------
-- 7. One duplicate_dropped audit_event per affected case (TKT-133 shape).
-- ---------------------------------------------------------------------------
WITH per_case AS (SELECT case_id, count(*) AS n FROM twins GROUP BY case_id),
ins AS (
  INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
  SELECT left('Duplicate photos merged (' || n || ') — the same photo was attached more than once by email; each is now kept once', 400),
         case_id,
         'tkt144-blob-sha256-backfill',
         100000005,   -- duplicate_dropped
         100000000,   -- info
         json_build_object('duplicate_rows', n)::text,
         json_build_object('merged', true)::text,
         now()
    FROM per_case
  RETURNING case_id
)
SELECT count(*) AS duplicate_dropped_audits FROM ins;

-- ---------------------------------------------------------------------------
-- 8. Status re-evaluation of AFFECTED cases — the exact recorded
--    statusForReviewCase SQL parity tree: terminals are excluded, then a valid
--    nonblank string mergedInto marker locks the row as linked_to_instruction.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE pre_eval ON COMMIT DROP AS
WITH affected AS (SELECT DISTINCT case_id FROM twins),
ev AS (
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
    JOIN affected a ON a.case_id = e.case_id
   GROUP BY e.case_id
)
SELECT c.id,
       c.status_code AS old_status,
       CASE
         WHEN merged_into IS NOT NULL THEN 100000006                        -- linked_to_instruction (merge-retired lock)
         WHEN fields_valid AND images_valid THEN 100000007                     -- ready_for_eva
         WHEN fields_valid AND NOT images_valid THEN 100000004                 -- missing_images
         WHEN NOT fields_valid AND images_valid THEN 100000003                 -- missing_required_fields
         WHEN accepted_ct = 0 AND instruction_ct = 0 THEN 100000002            -- needs_review
         WHEN has_identity THEN 100000002                                      -- needs_review
         ELSE 100000010                                                        -- error
       END AS next_status
  FROM (
    SELECT c.id, c.status_code,
           CASE
             WHEN jsonb_typeof(parsed.duplicate_json -> 'mergedInto') = 'string'
               THEN NULLIF(btrim(parsed.duplicate_json ->> 'mergedInto'), '')
           END AS merged_into,
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
      JOIN (SELECT DISTINCT case_id FROM twins) a ON a.case_id = c.id
      LEFT JOIN ev ON ev.case_id = c.id
      LEFT JOIN work_provider w ON w.id = c.work_provider_id
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN pg_input_is_valid(c.duplicate_keys, 'jsonb')
                   THEN c.duplicate_keys::jsonb
               END AS duplicate_json
      ) parsed
     WHERE c.status_code NOT IN (100000008, 100000009, 100000010, 100000011, 100000012)
  ) c;

WITH moved AS (
  UPDATE case_ c
     SET status_code = e.next_status, updated_at = now()
    FROM pre_eval e
   WHERE c.id = e.id AND e.next_status <> e.old_status
  RETURNING c.id, e.old_status, e.next_status
),
move_audit AS (
  INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
  SELECT left('Status ' || co.name || ' -> ' || cn.name || ' (TKT-144 post-dedup re-evaluate)', 400),
         m.id,
         'tkt144-blob-sha256-backfill',
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
SELECT co.name AS from_status, cn.name AS to_status, count(*) AS moved
  FROM moved m
  JOIN choice_case_status co ON co.code = m.old_status
  JOIN choice_case_status cn ON cn.code = m.next_status
 GROUP BY 1, 2 ORDER BY 3 DESC;

-- ---------------------------------------------------------------------------
-- 9. Exports (post-write state, inside the txn).
-- ---------------------------------------------------------------------------
\copy (WITH g AS (SELECT case_id, file_name, count(*) AS n_rows, count(*) FILTER (WHERE sha256 IS NOT NULL) AS n_hashed, count(DISTINCT sha256) FILTER (WHERE sha256 IS NOT NULL) AS n_distinct_hashes FROM dedup_groups GROUP BY 1, 2), t AS (SELECT case_id, file_name, count(*) AS twins_excluded, min(survivor_id::text) AS survivor_id FROM twins GROUP BY 1, 2) SELECT ca.case_po, g.case_id, g.file_name, g.n_rows, g.n_hashed, g.n_rows - g.n_hashed AS n_unhashed, g.n_distinct_hashes, COALESCE(t.twins_excluded, 0) AS twins_excluded, t.survivor_id, CASE WHEN t.twins_excluded IS NOT NULL AND g.n_rows - t.twins_excluded = 1 THEN 'collapsed_same_hash' WHEN t.twins_excluded IS NOT NULL THEN 'collapsed_plus_remainder' WHEN g.n_hashed < g.n_rows THEN 'unhashable_skip' ELSE 'distinct_different_hash' END AS outcome FROM g JOIN case_ ca ON ca.id = g.case_id LEFT JOIN t ON t.case_id = g.case_id AND t.file_name = g.file_name ORDER BY ca.case_po, g.file_name) TO '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/pair-outcomes.csv' CSV HEADER

\copy (SELECT m.id AS case_id, c.case_po, co.name AS from_status, cn.name AS to_status FROM pre_eval m JOIN case_ c ON c.id = m.id JOIN choice_case_status co ON co.code = m.old_status JOIN choice_case_status cn ON cn.code = m.next_status WHERE m.next_status <> m.old_status ORDER BY c.case_po) TO '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/status-moves.csv' CSV HEADER

\copy (WITH affected AS (SELECT DISTINCT case_id FROM twins), agg AS (SELECT c.id, c.case_po, s.name AS status, count(e.id) FILTER (WHERE e.kind_code = 100000000 AND e.accepted_for_eva AND NOT e.excluded) AS accepted_ct, count(e.id) FILTER (WHERE e.kind_code = 100000000 AND e.accepted_for_eva AND NOT e.excluded AND e.image_role_code = 100000000) AS overview_ct, count(e.id) FILTER (WHERE e.kind_code = 100000000 AND NOT e.excluded AND e.image_role_code = 100000003 AND e.registration_visible IS NULL) AS unclassified_ct, EXISTS (SELECT 1 FROM chaser ch WHERE ch.case_id = c.id AND (ch.template_used = 'Overview photo request' OR ch.status_code IN (100000000, 100000001, 100000003))) AS chaser_guard_blocks FROM case_ c JOIN affected a ON a.case_id = c.id JOIN choice_case_status s ON s.code = c.status_code LEFT JOIN evidence e ON e.case_id = c.id GROUP BY c.id, c.case_po, s.name) SELECT *, (status NOT IN ('eva_submitted', 'box_synced', 'error', 'removed', 'done', 'linked_to_instruction') AND accepted_ct >= 5 AND overview_ct = 0 AND unclassified_ct = 0 AND NOT chaser_guard_blocks) AS would_newly_qualify FROM agg ORDER BY case_po) TO '/mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/tkt148-observations.csv' CSV HEADER

-- ---------------------------------------------------------------------------
-- 10. Final counters + discoveries (report-only).
-- ---------------------------------------------------------------------------
SELECT count(*) AS blob_null_sha_after
  FROM evidence WHERE storage_path IS NOT NULL AND sha256 IS NULL;

-- assert: no active same-case same-name same-hash blob image pair remains
SELECT count(*) AS same_name_same_hash_active_remaining
  FROM (SELECT case_id, file_name, sha256 FROM evidence
         WHERE storage_path IS NOT NULL AND excluded = false AND kind_code = 100000000 AND sha256 IS NOT NULL
         GROUP BY 1, 2, 3 HAVING count(*) >= 2) x;

-- the class as it remains live (distinct photos + unhashable + post-enum arrivals)
SELECT count(*) AS same_name_active_rows_remaining,
       count(DISTINCT (case_id, file_name)) AS groups_remaining
  FROM (SELECT e.id, e.case_id, e.file_name
          FROM evidence e
          JOIN (SELECT case_id, file_name FROM evidence
                 WHERE storage_path IS NOT NULL AND excluded = false AND kind_code = 100000000
                 GROUP BY 1, 2 HAVING count(*) >= 2) g
            ON g.case_id = e.case_id AND g.file_name = e.file_name
         WHERE e.storage_path IS NOT NULL AND e.excluded = false AND e.kind_code = 100000000) x;

-- discovery (untouched): same-case same-hash ACTIVE pairs under DIFFERENT names
SELECT count(*) AS diff_name_same_hash_active_buckets
  FROM (SELECT case_id, sha256 FROM evidence
         WHERE excluded = false AND sha256 IS NOT NULL
         GROUP BY 1, 2 HAVING count(*) >= 2 AND count(DISTINCT file_name) > 1) x;

-- observation for TKT-133: post-2026-07-09 arrivals never duplicated a (case, sha)
SELECT count(*) AS post_0709_same_case_same_sha_dupes
  FROM (SELECT case_id, sha256 FROM evidence
         WHERE sha256 IS NOT NULL AND created_at > '2026-07-09 12:00:00+00'
         GROUP BY 1, 2 HAVING count(*) >= 2) x;

COMMIT;

SELECT 'write window complete' AS done;
