\set ON_ERROR_STOP on

SET ROLE csadmin;

SELECT current_database() AS database,
       current_user AS role,
       version() LIKE 'PostgreSQL 16%' AS postgres_16;

SELECT name, present
FROM (VALUES
  ('inbound_email', to_regclass('public.inbound_email') IS NOT NULL),
  ('archive_mirror_outbox', to_regclass('public.archive_mirror_outbox') IS NOT NULL),
  ('box_file_request_outbox', to_regclass('public.box_file_request_outbox') IS NOT NULL),
  ('chaser', to_regclass('public.chaser') IS NOT NULL),
  ('case_', to_regclass('public.case_') IS NOT NULL)
) AS checks(name, present)
ORDER BY name;

WITH wanted(table_name, column_name) AS (VALUES
  ('inbound_email', 'evidence_backfill_requested_generation'),
  ('inbound_email', 'evidence_backfill_enqueued_generation'),
  ('inbound_email', 'evidence_backfill_report_outcome'),
  ('inbound_email', 'evidence_backfill_completed_generation'),
  ('inbound_email', 'evidence_backfill_completed_result'),
  ('inbound_email', 'evidence_backfill_reported_generation'),
  ('case_', 'status_recompute_requested_generation'),
  ('case_', 'status_recompute_completed_generation'),
  ('evidence', 'image_role_source'),
  ('evidence', 'exclusion_decision_source'),
  ('evidence', 'box_classify_attempt_count'),
  ('evidence', 'archive_mirror_claim_token'),
  ('chaser', 'suggested')
)
SELECT wanted.table_name || '.' || wanted.column_name AS field,
       columns.column_name IS NOT NULL AS present
FROM wanted
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = wanted.table_name
 AND columns.column_name = wanted.column_name
ORDER BY field;

SELECT count(*) AS case_po_floor_rows FROM case_po_floor;

SELECT count(*) FILTER (
         WHERE status_code = 100000006
           AND duplicate_keys LIKE '%mergedInto%'
       ) AS retired_merged_rows,
       count(*) FILTER (
         WHERE status_code <> 100000006
           AND duplicate_keys LIKE '%mergedInto%'
       ) AS reopened_merged_rows
FROM case_;

RESET ROLE;
