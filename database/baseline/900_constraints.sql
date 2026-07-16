-- =============================================================================
-- 900_constraints.sql  --  relationship FKs, dedup keys, RLS  (apply LAST)
-- -----------------------------------------------------------------------------
-- Cascade rules preserve domain ownership:
--   owned children use ON DELETE CASCADE
--   independently retained records use ON DELETE SET NULL
-- Rationale (relationships.json notes): child rows truly OWNED by a case (Evidence,
-- FieldLevelProvenance, Chaser, Note) cascade; append-only/history + corpus referrers
-- (AuditEvent, ImprovementSignal, InboundEmail, and all corpus lookups) RemoveLink so
-- history/corpus survive a deleted case. N:N intersect rows cascade from either side.
-- Choice (`*_code`) FKs were declared inline in the table files (they reference 000).
-- =============================================================================
BEGIN;

-- ---- 1:N relationship FKs (15 total) ---------------------------------------

-- Case -> corpus lookups (RemoveLink / SET NULL): a deleted corpus row must not
-- delete the case; a deleted case must not delete corpus history.
ALTER TABLE case_ ADD CONSTRAINT fk_case_work_provider
  FOREIGN KEY (work_provider_id)      REFERENCES work_provider(id)      ON DELETE SET NULL;
ALTER TABLE case_ ADD CONSTRAINT fk_case_image_source
  FOREIGN KEY (image_source_id)       REFERENCES image_source(id)       ON DELETE SET NULL;
ALTER TABLE case_ ADD CONSTRAINT fk_case_inspection_address
  FOREIGN KEY (inspection_address_id) REFERENCES inspection_address(id) ON DELETE SET NULL;

-- Case -> owned children (Cascade): deleting a case removes these rows.
ALTER TABLE evidence ADD CONSTRAINT fk_evidence_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;
ALTER TABLE field_level_provenance ADD CONSTRAINT fk_flp_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;
ALTER TABLE chaser ADD CONSTRAINT fk_chaser_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;
ALTER TABLE note ADD CONSTRAINT fk_note_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;

-- Case -> append-only / deferred (RemoveLink / SET NULL): keep history.
ALTER TABLE audit_event ADD CONSTRAINT fk_audit_event_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;
ALTER TABLE improvement_signal ADD CONSTRAINT fk_improvement_signal_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;
ALTER TABLE improvement_signal ADD CONSTRAINT fk_improvement_signal_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE SET NULL;

-- Corpus inter-references (RemoveLink / SET NULL).
ALTER TABLE inspection_address ADD CONSTRAINT fk_inspection_address_repairer
  FOREIGN KEY (repairer_id) REFERENCES repairer(id) ON DELETE SET NULL;
ALTER TABLE image_source ADD CONSTRAINT fk_image_source_repairer
  FOREIGN KEY (repairer_id) REFERENCES repairer(id) ON DELETE SET NULL;
ALTER TABLE image_source ADD CONSTRAINT fk_image_source_default_inspection_address
  FOREIGN KEY (default_inspection_address_id) REFERENCES inspection_address(id) ON DELETE SET NULL;

-- Phase-8 InboundEmail -> Case / WorkProvider (RemoveLink, ADR-0015): a removed
-- case/archived provider must NOT delete the audit-of-record triage row.
ALTER TABLE inbound_email ADD CONSTRAINT fk_inbound_email_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;
ALTER TABLE inbound_email ADD CONSTRAINT fk_inbound_email_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE SET NULL;

-- AI suggestion layer (TKT-015) -> case/evidence (CASCADE: the working suggestion
-- is owned by its subject -- a retention purge of the case takes its suggestions
-- with it) and inbound_email (SET NULL: the email is the audit-of-record, RemoveLink
-- everywhere). Producers: image-analysis (TKT-016), reg-OCR (TKT-017), triage-category.
ALTER TABLE ai_suggestion ADD CONSTRAINT fk_ai_suggestion_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;
ALTER TABLE ai_suggestion ADD CONSTRAINT fk_ai_suggestion_evidence
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE;
ALTER TABLE ai_suggestion ADD CONSTRAINT fk_ai_suggestion_inbound_email
  FOREIGN KEY (inbound_email_id) REFERENCES inbound_email(id) ON DELETE SET NULL;

-- Provider API-intake keys (TKT-055/ADR-0020) -> work_provider (CASCADE: a key is
-- owned by its provider -- a purged provider takes its keys with it).
ALTER TABLE provider_api_key ADD CONSTRAINT fk_provider_api_key_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;
ALTER TABLE provider_intake_operation ADD CONSTRAINT fk_provider_intake_operation_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;
ALTER TABLE provider_intake_operation ADD CONSTRAINT fk_provider_intake_operation_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;

-- ---- N:N intersect FKs (2 junction tables; CASCADE from either side) --------
ALTER TABLE repairer_workprovider ADD CONSTRAINT fk_rwp_repairer
  FOREIGN KEY (repairer_id)      REFERENCES repairer(id)      ON DELETE CASCADE;
ALTER TABLE repairer_workprovider ADD CONSTRAINT fk_rwp_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;
ALTER TABLE imagesource_workprovider ADD CONSTRAINT fk_iswp_image_source
  FOREIGN KEY (image_source_id)  REFERENCES image_source(id)  ON DELETE CASCADE;
ALTER TABLE imagesource_workprovider ADD CONSTRAINT fk_iswp_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;

-- ---- Dedup keys (ADR-0010) -------------------------------------------------
-- Postgres treats NULLs as distinct, so manually-created rows (no Message-ID) are
-- unaffected; only a repeated real Message-ID collides -> the get-or-create guard.
ALTER TABLE case_ ADD CONSTRAINT uq_case_source_message_id
  UNIQUE (source_message_id);
-- Internet-Message-Id is not globally unique across independent mailboxes. Keep the
-- mailbox-qualified arrival identity so a duplicated id can never mix one mailbox's
-- immutable Graph id/webLink tuple into another mailbox's row. NULLS NOT DISTINCT keeps
-- legacy rows with an unknown mailbox replay-safe too (Postgres 16 live).
ALTER TABLE inbound_email ADD CONSTRAINT uq_inbound_email_source_mailbox_message_id
  UNIQUE NULLS NOT DISTINCT (source_mailbox, source_message_id);

-- Case/PO uniqueness (#11) — belt-and-braces over the intake mint. The automated mint
-- (services/data-api/src/features/cases/internal-resolution-routes.ts) already guarantees no duplicate per-(principal,year)
-- sequence via a pg_advisory_xact_lock that spans the MAX+1 probe and the INSERT, so this
-- partial UNIQUE only additionally catches an auto-vs-manual collision. CASE-INSENSITIVE
-- (upper(case_po), #82): a manual 'ccpy26050' and an automated 'CCPY26050' are the SAME
-- Case/PO and must collide — the API normalises manual case_po to UPPER and probes on
-- upper(case_po), this index is the DB backstop. Partial (case_po IS NOT NULL) so the many
-- manually-created / pre-mint rows with NULL case_po are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_case_case_po ON case_ (upper(case_po)) WHERE case_po IS NOT NULL;

-- Helpful FK-side indexes not already created in the table files.
CREATE INDEX ix_improvement_signal_case_id          ON improvement_signal (case_id);
CREATE INDEX ix_improvement_signal_work_provider_id ON improvement_signal (work_provider_id);
CREATE INDEX ix_inbound_email_case_id               ON inbound_email (case_id);
CREATE INDEX ix_inbound_email_work_provider_id      ON inbound_email (work_provider_id);
CREATE INDEX ix_inspection_address_repairer_id      ON inspection_address (repairer_id);
CREATE INDEX ix_image_source_repairer_id            ON image_source (repairer_id);
CREATE INDEX ix_rwp_work_provider                   ON repairer_workprovider (work_provider_id);
CREATE INDEX ix_iswp_work_provider                  ON imagesource_workprovider (work_provider_id);
-- ai_suggestion FK-side indexes (case_id is already covered by ix_ai_suggestion_case_review in 160).
CREATE INDEX ix_ai_suggestion_evidence_id           ON ai_suggestion (evidence_id);
CREATE INDEX ix_ai_suggestion_inbound_email_id      ON ai_suggestion (inbound_email_id);

COMMIT;

-- =============================================================================
-- Row-Level Security  (defense-in-depth for a SINGLE-TENANT, staff-only app)
-- -----------------------------------------------------------------------------
-- The Data API (the standalone Flex Consumption Function App) is the ONLY DB client.
-- It connects as a non-owner login mapped from its managed identity (see
-- 31-auth-migration.md) and sets the caller's app role per request/transaction:
--     SET LOCAL app.role = 'admin';   -- or 'staff'
-- TKT-154: serialize the autonomous registration decision with every Case change
-- that can alter its eligibility. The MCP transaction takes the same advisory key
-- before its predicate read. Two triggers keep UPDATE OF syntax separate from
-- INSERT/DELETE and acquire old/new registration keys in a stable order.
CREATE OR REPLACE FUNCTION lock_case_registration_eligibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_registration text;
  new_registration text;
  registration_key text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_registration := regexp_replace(upper(COALESCE(OLD.vrm, '')), '[^A-Z0-9]', '', 'g');
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_registration := regexp_replace(upper(COALESCE(NEW.vrm, '')), '[^A-Z0-9]', '', 'g');
  END IF;

  FOR registration_key IN
    SELECT DISTINCT candidate
      FROM (VALUES (old_registration), (new_registration)) AS registrations(candidate)
     WHERE candidate IS NOT NULL AND candidate <> ''
     ORDER BY candidate
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('mcp-image-registration:' || registration_key, 0)
    );
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- LOCK BUDGET (TKT-217): this BEFORE INSERT OR DELETE trigger fires per row and
-- takes a per-row pg_advisory_xact_lock for EVERY case_ INSERT/DELETE. The lock is
-- REQUIRED for phantom-case protection (it serialises the autonomous registration
-- decision with case mutation) and must not be removed. Its operational cost: one
-- very large SINGLE-TRANSACTION bulk case_ purge/insert (ADR-0017 disposition tooling
-- or bulk intake) accumulates one advisory lock slot per row and can approach
-- max_locks_per_transaction and abort the whole transaction. Bulk writers MUST batch
-- (chunk each COMMIT to a bounded row count) rather than mutating all case_ rows in one
-- transaction. Follow-up TKT-217 tracks the batching requirement in the disposition/
-- bulk-writer tooling.
DROP TRIGGER IF EXISTS tr_case_registration_insert_delete ON case_;
CREATE TRIGGER tr_case_registration_insert_delete
  BEFORE INSERT OR DELETE ON case_
  FOR EACH ROW EXECUTE FUNCTION lock_case_registration_eligibility();

DROP TRIGGER IF EXISTS tr_case_registration_eligibility_update ON case_;
CREATE TRIGGER tr_case_registration_eligibility_update
  BEFORE UPDATE OF vrm, status_code, duplicate_keys ON case_
  FOR EACH ROW EXECUTE FUNCTION lock_case_registration_eligibility();

-- RLS here is NOT multi-tenant row filtering (there are no tenants); its single job
-- is to make the AUDIT TRAIL tamper-evident (append-only) and to gate destructive
-- deletes to the admin role. Owners bypass RLS unless FORCE is set, hence FORCE +
-- the "connect as non-owner" rule above.
-- helper: current_setting('app.role', true) returns NULL when unset (missing_ok=true).
-- =============================================================================
BEGIN;

-- Append-only audit trail: INSERT + SELECT for any app role; NO update policy at all
-- (=> updates denied); DELETE only for admin (legal/disposition tooling).
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE  ROW LEVEL SECURITY;
CREATE POLICY p_audit_event_insert ON audit_event FOR INSERT WITH CHECK (true);
CREATE POLICY p_audit_event_select ON audit_event FOR SELECT USING (true);
CREATE POLICY p_audit_event_delete ON audit_event FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- Historical Outlook-link remediation evidence is append-only: the Data API may
-- SELECT candidates/ledger and INSERT outcomes, but can never revise or delete one.
ALTER TABLE outlook_link_backfill_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_link_backfill_ledger FORCE  ROW LEVEL SECURITY;
CREATE POLICY p_outlook_link_backfill_ledger_select ON outlook_link_backfill_ledger
  FOR SELECT USING (current_setting('app.role', true) IN ('staff','admin'));
CREATE POLICY p_outlook_link_backfill_ledger_insert ON outlook_link_backfill_ledger
  FOR INSERT WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));

-- Case data: full DML for staff + admin (the app already authenticates the user,
-- Entra staff-only, no External ID). The policies are permissive on purpose -- they
-- exist so a future least-privilege split (e.g. read-only reviewer) is a policy edit,
-- not a schema change. The destructive case-disposition purge (ADR-0017) is admin-only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'case_','field_level_provenance','chaser','note',
    'work_provider','repairer','image_source','inspection_address',
    'improvement_signal','inbound_email','repairer_workprovider','imagesource_workprovider',
    'ai_suggestion','provider_api_key','provider_intake_operation','case_po_floor','ai_usage_ledger',
    'archive_mirror_outbox','box_file_request_outbox','evidence_deletion','staff_evidence_upload',
    'staff_evidence_upload_item','manual_intake_case_create_operation',
    'mcp_image_ingest_rate_limit','mcp_http_session',
    'capture_session','capture_session_shot','capture_asset',
    'archive_holding_folder','archive_holding_intake','archive_holding_file','archive_holding_deferred_intake'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY;', t);
    -- read/write for any recognised app role
    EXECUTE format($p$CREATE POLICY p_%1$s_rw ON %1$I
        USING (current_setting('app.role', true) IN ('staff','admin'))
        WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));$p$, t);
    -- deletes restricted to admin (staff edit, admin removes)
    EXECUTE format($p$CREATE POLICY p_%1$s_no_delete ON %1$I AS RESTRICTIVE FOR DELETE
        USING (current_setting('app.role', true) = 'admin');$p$, t);
  END LOOP;
  EXECUTE 'ALTER TABLE capture_session_resume_token ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'ALTER TABLE capture_session_resume_token FORCE ROW LEVEL SECURITY;';
  EXECUTE $p$CREATE POLICY p_capture_session_resume_token_rw ON capture_session_resume_token
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));$p$;
END $$;

-- Evidence keeps the generic read/write posture. The PRIMARY control on the staff
-- delete path is that cespk_app holds NO table DELETE grant on evidence and never
-- issues a direct DELETE — the only delete seam is the guarded SECURITY DEFINER
-- complete_evidence_deletion() function (claim-token + resolved store outcomes +
-- identity match). p_evidence_scoped_delete below is DEFENSE-IN-DEPTH: on the live
-- DB the function's BYPASSRLS owner means this RESTRICTIVE policy is not on the live
-- delete path, so it must NOT be relied on as the control (see TKT-160 review). It
-- still bounds any future direct grant to the exact ready_to_finalize row; generic
-- staff deletes fail; admins retain the existing retention/disposition capability.
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY p_evidence_rw ON evidence
  USING (current_setting('app.role', true) IN ('staff','admin'))
  WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
CREATE POLICY p_evidence_scoped_delete ON evidence AS RESTRICTIVE FOR DELETE
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
        FROM evidence_deletion d
       WHERE d.id = evidence.deletion_operation_id
         AND d.evidence_id = evidence.id
         AND d.case_id = evidence.case_id
         AND d.state = 'ready_to_finalize'
    )
  );

COMMIT;

-- Immutable vehicle lookup / MOT estimator evidence (TKT-152). These tables
-- intentionally do NOT use the generic rw policy above: provider snapshots,
-- raw observations, model profiles and estimate runs are append-only evidence.
BEGIN;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mileage_model_profile','vehicle_lookup_run','vehicle_provider_snapshot',
    'mot_odometer_observation','mileage_estimate_result'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY p_%1$s_select ON %1$I FOR SELECT
      USING (current_setting('app.role', true) IN ('staff','admin'));$p$, t);
    EXECUTE format($p$CREATE POLICY p_%1$s_insert ON %1$I FOR INSERT
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));$p$, t);
  END LOOP;
END $$;
COMMIT;

-- NOTE on PERMISSIVE vs RESTRICTIVE: p_<t>_rw is PERMISSIVE and covers ALL/SELECT/
-- INSERT/UPDATE/DELETE; the RESTRICTIVE p_<t>_no_delete is AND-ed on top for DELETE
-- only, so a staff role can read/insert/update but cannot delete. Adjust per the
-- final role model in 31-auth-migration.md before production.
