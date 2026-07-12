\set ON_ERROR_STOP on

SELECT
  count(*) FILTER (
    WHERE category_code = 100000000
      AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'))
  ) AS receiving_work,
  count(*) FILTER (
    WHERE category_code = 100000001
      AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'))
  ) AS query,
  count(*) FILTER (
    WHERE category_code = 100000002
      AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'))
  ) AS other,
  count(*) FILTER (
    WHERE coalesce(triage_state, 'new') = 'new'
      AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'))
  ) AS untriaged
FROM inbound_email;
