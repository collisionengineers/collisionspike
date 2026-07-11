-- =============================================================================
-- 900_constraints.sql  --  relationship FKs, dedup keys, RLS  (apply LAST)
-- -----------------------------------------------------------------------------
-- Cascade mapping is taken VERBATIM from dataverse/relationships.json:
--   Dataverse cascade.delete = "Cascade"    -> PG ON DELETE CASCADE
--   Dataverse cascade.delete = "RemoveLink" -> PG ON DELETE SET NULL
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
  FOREIGN KEY (work_provider_id)      REFERENCES work_provider(id)      ON DELETE SET NULL;     -- cr1bd_workprovider_case (RemoveLink)
ALTER TABLE case_ ADD CONSTRAINT fk_case_image_source
  FOREIGN KEY (image_source_id)       REFERENCES image_source(id)       ON DELETE SET NULL;     -- cr1bd_imagesource_case (RemoveLink)
ALTER TABLE case_ ADD CONSTRAINT fk_case_inspection_address
  FOREIGN KEY (inspection_address_id) REFERENCES inspection_address(id) ON DELETE SET NULL;     -- cr1bd_inspectionaddress_case (RemoveLink)

-- Case -> owned children (Cascade): deleting a case removes these rows.
ALTER TABLE evidence ADD CONSTRAINT fk_evidence_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;                                 -- cr1bd_case_evidence (Cascade)
ALTER TABLE field_level_provenance ADD CONSTRAINT fk_flp_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;                                 -- cr1bd_case_fieldlevelprovenance (Cascade)
ALTER TABLE chaser ADD CONSTRAINT fk_chaser_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;                                 -- cr1bd_case_chaser (Cascade)
ALTER TABLE note ADD CONSTRAINT fk_note_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;                                 -- cr1bd_case_note (Cascade)

-- Case -> append-only / deferred (RemoveLink / SET NULL): keep history.
ALTER TABLE audit_event ADD CONSTRAINT fk_audit_event_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;                                -- cr1bd_case_auditevent (RemoveLink)
ALTER TABLE improvement_signal ADD CONSTRAINT fk_improvement_signal_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;                                -- cr1bd_case_improvementsignal (RemoveLink)
ALTER TABLE improvement_signal ADD CONSTRAINT fk_improvement_signal_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE SET NULL;               -- cr1bd_workprovider_improvementsignal (RemoveLink)

-- Corpus inter-references (RemoveLink / SET NULL).
ALTER TABLE inspection_address ADD CONSTRAINT fk_inspection_address_repairer
  FOREIGN KEY (repairer_id) REFERENCES repairer(id) ON DELETE SET NULL;                         -- cr1bd_repairer_inspectionaddress (RemoveLink)
ALTER TABLE image_source ADD CONSTRAINT fk_image_source_repairer
  FOREIGN KEY (repairer_id) REFERENCES repairer(id) ON DELETE SET NULL;                         -- cr1bd_repairer_imagesource (RemoveLink)
ALTER TABLE image_source ADD CONSTRAINT fk_image_source_default_inspection_address
  FOREIGN KEY (default_inspection_address_id) REFERENCES inspection_address(id) ON DELETE SET NULL; -- cr1bd_inspectionaddress_imagesource (RemoveLink)

-- Phase-8 InboundEmail -> Case / WorkProvider (RemoveLink, ADR-0015): a removed
-- case/archived provider must NOT delete the audit-of-record triage row.
ALTER TABLE inbound_email ADD CONSTRAINT fk_inbound_email_case
  FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL;                                -- cr1bd_case_inboundemail (RemoveLink)
ALTER TABLE inbound_email ADD CONSTRAINT fk_inbound_email_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE SET NULL;               -- cr1bd_workprovider_inboundemail (RemoveLink)

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

-- ---- N:N intersect FKs (2 junction tables; CASCADE from either side) --------
ALTER TABLE repairer_workprovider ADD CONSTRAINT fk_rwp_repairer
  FOREIGN KEY (repairer_id)      REFERENCES repairer(id)      ON DELETE CASCADE;
ALTER TABLE repairer_workprovider ADD CONSTRAINT fk_rwp_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;
ALTER TABLE imagesource_workprovider ADD CONSTRAINT fk_iswp_image_source
  FOREIGN KEY (image_source_id)  REFERENCES image_source(id)  ON DELETE CASCADE;
ALTER TABLE imagesource_workprovider ADD CONSTRAINT fk_iswp_work_provider
  FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;

-- ---- Dedup keys (the cr1bd_*_sourcemessageid alternate keys, ADR-0010) ------
-- Postgres treats NULLs as distinct, so manually-created rows (no Message-ID) are
-- unaffected; only a repeated real Message-ID collides -> the get-or-create guard.
ALTER TABLE case_ ADD CONSTRAINT uq_case_source_message_id
  UNIQUE (source_message_id);                                                                   -- cr1bd_case_sourcemessageid_key
ALTER TABLE inbound_email ADD CONSTRAINT uq_inbound_email_source_message_id
  UNIQUE (source_message_id);                                                                   -- cr1bd_inboundemail_sourcemessageid_key

-- Case/PO uniqueness (#11) — belt-and-braces over the intake mint. The automated mint
-- (api/src/functions/internal.ts) already guarantees no duplicate per-(principal,year)
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

-- Case data: full DML for staff + admin (the app already authenticates the user,
-- Entra staff-only, no External ID). The policies are permissive on purpose -- they
-- exist so a future least-privilege split (e.g. read-only reviewer) is a policy edit,
-- not a schema change. The destructive case-disposition purge (ADR-0017) is admin-only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'case_','evidence','field_level_provenance','chaser','note',
    'work_provider','repairer','image_source','inspection_address',
    'improvement_signal','inbound_email','repairer_workprovider','imagesource_workprovider',
    'ai_suggestion','provider_api_key','case_po_floor','ai_usage_ledger',
    'archive_mirror_outbox','box_file_request_outbox'
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
END $$;

COMMIT;

-- NOTE on PERMISSIVE vs RESTRICTIVE: p_<t>_rw is PERMISSIVE and covers ALL/SELECT/
-- INSERT/UPDATE/DELETE; the RESTRICTIVE p_<t>_no_delete is AND-ed on top for DELETE
-- only, so a staff role can read/insert/update but cannot delete. Adjust per the
-- final role model in 31-auth-migration.md before production.
