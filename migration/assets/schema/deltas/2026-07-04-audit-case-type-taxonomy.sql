-- =============================================================================
-- 2026-07-04-audit-case-type-taxonomy.sql
-- ADR-0021 case-type marker taxonomy -- choice rows (idempotent, DATA ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. Land the choice_* rows the ADR-0021 case-type work needs BEFORE the
-- operator flips AUDIT_CASES_ENABLED:
--   docs/adr/0021-case-po-marker-taxonomy.md   (the marker taxonomy: A. audit /
--     AP. audit_total_loss / D. diminution; per-marker independent sequences;
--     the QDOS dual report+audit derived-ID rule)
--   docs/adr/0014-audit-case-type-second-inspection.md  (the audit case-type +
--     engineer_report evidence design this extends)
--   docs/gated.md item D10 (this delta's apply runbook + the SEPARATE, LATER
--     gate-flip item)
-- Concretely:
--   - choice_case_type      : +2 rows  (100000002 audit_total_loss, 100000003 diminution)
--                             and reasserts the 2 base rows (standard/audit) in case a
--                             live rebuild predates them.
--   - choice_evidence_kind  : reasserts 100000007 engineer_report (canonical in
--                             000_enums_lookups.sql; reasserted here because no applied
--                             delta ever shipped it and the live DB predates verification).
--
-- DEPLOY-ORDER. This delta must be applied BEFORE AUDIT_CASES_ENABLED=true is set on
-- cespk-api-dev/cespk-orch-dev: with the gate on, the Data API writes
-- case_.case_type_code (FK -> choice_case_type) and evidence.kind_code 100000007 --
-- both would FK-violate without these rows. With the gate OFF (today's state) nothing
-- writes the new codes, so applying this delta early is safe and side-effect-free.
-- The api/orch/parser code deploys themselves have NO ordering dependency on it.
--
-- Idempotent: every INSERT is ON CONFLICT DO NOTHING; re-running is a no-op.
-- =============================================================================

BEGIN;

INSERT INTO choice_case_type (code, name, label) VALUES
  (100000000, 'standard',         'Standard'),
  (100000001, 'audit',            'Audit'),
  (100000002, 'audit_total_loss', 'Audit (Total Loss)'),
  (100000003, 'diminution',       'Diminution')
ON CONFLICT (code) DO NOTHING;

INSERT INTO choice_evidence_kind (code, name, label) VALUES
  (100000007, 'engineer_report', 'Engineer Report (audited)')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- POST-CHECK (expect 4 and 1):
--   SELECT count(*) FROM choice_case_type;
--   SELECT count(*) FROM choice_evidence_kind WHERE code = 100000007;
