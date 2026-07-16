-- ============================================================================
-- TKT-140 dry-run — backlog key enumeration (READ-ONLY; one connection window)
-- Run: psql (WSL) as Entra admin digital@collisionengineers.co.uk -> SET ROLE csadmin
--      (owner read bypasses RLS so counts are unfiltered truth; NO writes issued —
--      SELECT-only; \copy/\o capture is client-side file output).
--
-- Key semantics mirror the live retro ladder (do-not-invent rule):
--   * decideRetro (packages/domain/src/domain/retro-case.ts):
--       - eligible trigger categories: billing / case_update / cancellation / query,
--         PLUS non_actionable ONLY with subtype 'acknowledgement' (TKT-119).
--       - keys: body_caseref -> casePo when it full-matches CASE_PO_SHAPE_RE
--         (after normalizeCasePo), else externalRef; body_jobref fills externalRef
--         when still empty; body_vrm (upper, whitespace-collapsed) -> vrm.
--         (candidateRef/candidateVrm are envelope sniffs re-derived at drain time —
--          not persisted; the persisted body_* columns are the enumeration proxy.)
--   * CASE_PO_SHAPE_RE: ^((AP|A|D)\.[ ]?)?([A-Z]{2}\d{5}|[A-Z]{3,5}\d{5,6})$  (case-insens.)
--   * Rung-1 resolve-existing (services/data-api/src/features/inbound/retro-routes.ts findExistingCases):
--       ref keys probe upper(case_po)=key OR upper(case_ref)=key; vrm probes
--       case_.vrm = key (exact). r1_match_loose adds a whitespace/case-insensitive
--       VRM compare (conservative: a loose match is treated as "already cased").
-- ============================================================================

\timing on
SET ROLE csadmin;

\echo '=== context: inbound_email totals ==='
SELECT count(*) AS inbound_total,
       count(*) FILTER (WHERE case_id IS NULL) AS inbound_uncased
  FROM inbound_email;

\echo '=== context: category/subtype distribution of un-linked rows (chosen, else suggested) ==='
SELECT coalesce(cc.name, '(unclassified)') AS category,
       coalesce(cs.name, '-')              AS subtype,
       count(*)                            AS rows
  FROM inbound_email ie
  LEFT JOIN choice_inbound_category cc ON cc.code = coalesce(ie.category_code, ie.suggested_category_code)
  LEFT JOIN choice_inbound_subtype  cs ON cs.code = coalesce(ie.subtype_code,  ie.suggested_subtype_code)
 WHERE ie.case_id IS NULL
 GROUP BY 1, 2
 ORDER BY 3 DESC;

\echo '=== context: attention_reason on un-linked rows (prior Unable-to-locate stamps) ==='
SELECT coalesce(attention_reason, '(null)') AS attention_reason, count(*) AS rows
  FROM inbound_email
 WHERE case_id IS NULL
 GROUP BY 1
 ORDER BY 2 DESC;

-- ---------------------------------------------------------------------------
-- Output 1 — ROW grain: retro-eligible un-linked rows with their derived keys.
-- ---------------------------------------------------------------------------
\pset format csv
\o /mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-140-retro-backlog-drain/evidence/enum-backlog-rows.csv
WITH eligible AS (
  SELECT ie.id, ie.source_message_id, ie.source_mailbox, ie.subject, ie.received_on,
         coalesce(cc.name, '(unclassified)') AS category,
         coalesce(cs.name, '-')              AS subtype,
         ie.triage_state, ie.attention_reason,
         nullif(regexp_replace(upper(btrim(coalesce(ie.body_caseref, ''))), '^((AP|A|D)\.)\s+', '\1'), '') AS ref_token,
         nullif(upper(btrim(coalesce(ie.body_jobref, ''))), '')                                            AS jobref_token,
         nullif(upper(regexp_replace(coalesce(ie.body_vrm, ''), '\s+', '', 'g')), '')                      AS vrm_token
    FROM inbound_email ie
    LEFT JOIN choice_inbound_category cc ON cc.code = coalesce(ie.category_code, ie.suggested_category_code)
    LEFT JOIN choice_inbound_subtype  cs ON cs.code = coalesce(ie.subtype_code,  ie.suggested_subtype_code)
   WHERE ie.case_id IS NULL
     AND ( cc.name IN ('billing', 'case_update', 'cancellation', 'query')
           OR (cc.name = 'non_actionable' AND cs.name = 'acknowledgement') )
),
keyed AS (
  SELECT e.*,
         CASE WHEN e.ref_token ~ '^((AP|A|D)\.[ ]?)?([A-Z]{2}[0-9]{5}|[A-Z]{3,5}[0-9]{5,6})$'
              THEN e.ref_token END AS key_case_po,
         CASE WHEN e.ref_token IS NOT NULL
               AND NOT (e.ref_token ~ '^((AP|A|D)\.[ ]?)?([A-Z]{2}[0-9]{5}|[A-Z]{3,5}[0-9]{5,6})$')
              THEN e.ref_token
              ELSE e.jobref_token END AS key_external_ref,
         e.vrm_token AS key_vrm
    FROM eligible e
)
SELECT id, source_message_id, source_mailbox, received_on, category, subtype,
       triage_state, attention_reason, key_case_po, key_external_ref, key_vrm, subject
  FROM keyed
 WHERE key_case_po IS NOT NULL OR key_external_ref IS NOT NULL OR key_vrm IS NOT NULL
 ORDER BY received_on;
\o

-- ---------------------------------------------------------------------------
-- Output 2 — KEY grain: distinct keys with rung-1 existence flags + aggregates.
--   r1_match_exact  = code-parity findExistingCases probe
--   r1_match_loose  = adds whitespace/case-insensitive VRM compare (conservative)
--   Keys with r1_match_loose = false are the un-cased backlog fed to the probe.
-- ---------------------------------------------------------------------------
\o /mnt/c/Users/Alex/Documents/GitHub/collisionsuite/active/collisionspike/docs/tickets/now/TKT-140-retro-backlog-drain/evidence/enum-backlog-keys.csv
WITH eligible AS (
  SELECT ie.id, ie.source_message_id, ie.source_mailbox, ie.subject, ie.received_on,
         coalesce(cc.name, '(unclassified)') AS category,
         coalesce(cs.name, '-')              AS subtype,
         nullif(regexp_replace(upper(btrim(coalesce(ie.body_caseref, ''))), '^((AP|A|D)\.)\s+', '\1'), '') AS ref_token,
         nullif(upper(btrim(coalesce(ie.body_jobref, ''))), '')                                            AS jobref_token,
         nullif(upper(regexp_replace(coalesce(ie.body_vrm, ''), '\s+', '', 'g')), '')                      AS vrm_token
    FROM inbound_email ie
    LEFT JOIN choice_inbound_category cc ON cc.code = coalesce(ie.category_code, ie.suggested_category_code)
    LEFT JOIN choice_inbound_subtype  cs ON cs.code = coalesce(ie.subtype_code,  ie.suggested_subtype_code)
   WHERE ie.case_id IS NULL
     AND ( cc.name IN ('billing', 'case_update', 'cancellation', 'query')
           OR (cc.name = 'non_actionable' AND cs.name = 'acknowledgement') )
),
keyed AS (
  SELECT e.*,
         CASE WHEN e.ref_token ~ '^((AP|A|D)\.[ ]?)?([A-Z]{2}[0-9]{5}|[A-Z]{3,5}[0-9]{5,6})$'
              THEN e.ref_token END AS key_case_po,
         CASE WHEN e.ref_token IS NOT NULL
               AND NOT (e.ref_token ~ '^((AP|A|D)\.[ ]?)?([A-Z]{2}[0-9]{5}|[A-Z]{3,5}[0-9]{5,6})$')
              THEN e.ref_token
              ELSE e.jobref_token END AS key_external_ref,
         e.vrm_token AS key_vrm
    FROM eligible e
),
k AS (
  SELECT key_case_po      AS key, 'case_po'      AS kind, id, source_mailbox, category, subtype, received_on, subject FROM keyed WHERE key_case_po IS NOT NULL
  UNION ALL
  SELECT key_external_ref AS key, 'external_ref' AS kind, id, source_mailbox, category, subtype, received_on, subject FROM keyed WHERE key_external_ref IS NOT NULL
  UNION ALL
  SELECT key_vrm          AS key, 'vrm'          AS kind, id, source_mailbox, category, subtype, received_on, subject FROM keyed WHERE key_vrm IS NOT NULL
),
agg AS (
  SELECT key, kind,
         count(*)                                            AS row_count,
         string_agg(DISTINCT category || '/' || subtype, '; ') AS categories,
         string_agg(DISTINCT source_mailbox, '; ')           AS mailboxes_observed,
         min(received_on)                                    AS earliest_received,
         max(received_on)                                    AS latest_received,
         (array_agg(subject ORDER BY received_on ASC))[1]    AS sample_subject
    FROM k
   GROUP BY key, kind
)
SELECT a.*,
       EXISTS (SELECT 1 FROM case_ c
                WHERE (a.kind IN ('case_po', 'external_ref')
                       AND (upper(coalesce(c.case_po, '')) = a.key OR upper(coalesce(c.case_ref, '')) = a.key))
                   OR (a.kind = 'vrm' AND c.vrm = a.key)) AS r1_match_exact,
       EXISTS (SELECT 1 FROM case_ c
                WHERE (a.kind IN ('case_po', 'external_ref')
                       AND (upper(coalesce(c.case_po, '')) = a.key OR upper(coalesce(c.case_ref, '')) = a.key))
                   OR (a.kind = 'vrm'
                       AND upper(regexp_replace(coalesce(c.vrm, ''), '\s+', '', 'g')) = a.key)) AS r1_match_loose
  FROM agg a
 ORDER BY kind, key;
\o

-- ---------------------------------------------------------------------------
-- Output 3 — prior retro machinery outcomes (live mint-guard / ladder evidence).
-- ---------------------------------------------------------------------------
\o docs/tickets/done/TKT-140-retro-backlog-drain/evidence/enum-retro-audit-events.csv
SELECT ca.name AS action, count(*) AS events,
       min(ae.occurred_at) AS first_seen, max(ae.occurred_at) AS last_seen
  FROM audit_event ae
  JOIN choice_audit_action ca ON ca.code = ae.action_code
 WHERE ca.name IN ('retro_case_created', 'retro_case_linked', 'retro_reconstruction_failed')
    OR ae.name LIKE 'Retro%'
 GROUP BY ca.name
 ORDER BY ca.name;
\o
\pset format aligned

\echo '=== mint-guard refusals recorded live (retro/create refused_category audits) ==='
SELECT ae.occurred_at, ae.name
  FROM audit_event ae
 WHERE ae.name LIKE 'Retro create refused%'
 ORDER BY ae.occurred_at;

\echo '=== retro failure audits (bottom-of-ladder Unable-to-locate), last 20 ==='
SELECT ae.occurred_at, left(ae.name, 140) AS summary
  FROM audit_event ae
  JOIN choice_audit_action ca ON ca.code = ae.action_code
 WHERE ca.name = 'retro_reconstruction_failed'
 ORDER BY ae.occurred_at DESC
 LIMIT 20;

RESET ROLE;
