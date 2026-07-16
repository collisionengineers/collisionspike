-- =============================================================================
-- 2026-07-02-rules-engine-v2-taxonomy.sql
-- Rules Engine v2, Phase 2 -- additive taxonomy + context-column delta (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. Adds the triage taxonomy and capture columns defined by
--   docs/adr/0019-triage-policy-stage-split.md.
--   Operator-owned activation is tracked in docs/operations/operator-actions.md.
-- Concretely:
--   - choice_inbound_category : +2 rows  (case_update, cancellation)
--   - choice_inbound_subtype  : +3 rows  (images_received, cancellation_notice, update_general)
--   - choice_audit_action     : +4 rows  (inbound_link_suggested, inbound_linked,
--                                          inbound_detached, cancellation_proposed)
--   - inbound_email           : +2 columns (body_jobref, conversation_id) + 2 partial indexes
--
-- >>> DEPLOY-ORDER WARNING <<<
--   This delta MUST be applied BEFORE any parser/orchestration deploy that ships the
--   taxonomy-v2 engine (engine tag engine-v2.2 -- the first tag that EMITS
--   category_code 100000005/100000006 or subtype_code 100000010-100000012). Deploying
--   engine-v2.2 first would have the classifier hand orchestration choice codes that
--   do not exist yet in this database: inbound_email.category_code / subtype_code /
--   suggested_category_code / suggested_subtype_code all carry FK REFERENCES to the
--   choice_inbound_category / choice_inbound_subtype tables (see ../120_inbound_email.sql),
--   so the classify-persist write would fail closed on the FK constraint. Applying this
--   delta first is always safe on its own: the new codes/columns simply sit unused until
--   an engine that emits/populates them ships (append-only doctrine, ../000_enums_lookups.sql).
--   Equally, do not flip any TRIAGE_* app-setting gate (TRIAGE_REF_GATE_ENABLED,
--   TRIAGE_CANCELLATION_ENABLED, …) until this delta is confirmed live.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. Every statement below is safe to run more than
-- once against the same database (ON CONFLICT DO NOTHING / IF NOT EXISTS throughout),
-- and the whole file is one BEGIN…COMMIT so it either fully lands or not at all. It is
-- also safe to run against a FRESH rebuild that already applied the canonical files in
-- lexical order (000_enums_lookups.sql / 120_inbound_email.sql already carry these same
-- rows/columns/indexes as of this delta's date -- see the companion edits there) --
-- every statement here will simply no-op in that case. See ./README.md for the
-- canonical-vs-delta relationship.
--
-- APPLY RUNBOOK (mirrors the 2026-06-30 ai_suggestion delta apply; see
-- docs/operations/database.md for the general connection pattern and
-- docs/operations/operator-actions.md for the operator checklist
-- for the full operator checklist):
--   1. az login
--        Interactive sign-in as the Entra principal that is cespk-pg-dev's Microsoft
--        Entra admin -- live as digital@collisionengineers.co.uk, mapped to the
--        server's azure_pg_admin role.
--   2. Add a transient firewall rule for the operator workstation's public IP
--      (delete it again in step 6 -- only AllowAzureServices should persist):
--        az postgres flexible-server firewall-rule create -g rg-collisionspike-dev \
--          -n cespk-pg-dev --rule-name OperatorBuildHost \
--          --start-ip-address <your-ip> --end-ip-address <your-ip>
--   3. Get an Entra access token and connect, then become the table owner. The
--      application login cespk_app does NOT own these tables and cannot run DDL
--      against them by design; csadmin owns every table
--      and BYPASSES RLS, which is required here since this is schema DDL, not a
--      staff/admin app-role data write:
--        PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv) \
--        psql "host=cespk-pg-dev.postgres.database.azure.com port=5432 dbname=collisionspike sslmode=require user=digital@collisionengineers.co.uk" \
--          -v ON_ERROR_STOP=1
--        collisionspike=> SET ROLE csadmin;
--   4. Apply this file:
--        collisionspike=> \i database/migrations/2026-07-02-rules-engine-v2-taxonomy.sql
--   5. Verify (all read-only; run as any role):
--        SELECT code, name, label FROM choice_inbound_category ORDER BY code DESC LIMIT 3;
--          -- expect the newest row to be 100000006 'cancellation', then 100000005 'case_update'
--        SELECT code, name, label FROM choice_inbound_subtype ORDER BY code DESC LIMIT 4;
--          -- expect 100000012 'update_general', 100000011 'cancellation_notice',
--          --        100000010 'images_received', then the pre-existing 100000009 'acknowledgement'
--        SELECT code, name, label FROM choice_audit_action ORDER BY code DESC LIMIT 5;
--          -- expect 100000038 'cancellation_proposed' down to 100000035 'inbound_link_suggested',
--          --        then the pre-existing 100000034 'ai_suggestion_rejected'
--        \d inbound_email
--          -- expect body_jobref varchar(64) and conversation_id varchar(512) present
--        SELECT indexname FROM pg_indexes WHERE tablename = 'inbound_email' AND indexname LIKE 'idx_inbound_email_%' ORDER BY indexname;
--          -- expect idx_inbound_email_body_jobref, idx_inbound_email_conversation
--   6. Remove the transient firewall rule from step 2:
--        az postgres flexible-server firewall-rule delete -g rg-collisionspike-dev \
--          -n cespk-pg-dev --rule-name OperatorBuildHost --yes
--
-- ROLLBACK STANCE. Additive-only, by design -- same doctrine as ../000_enums_lookups.sql
-- ("append-only vocabulary. NEVER renumber."). There is no destructive rollback script
-- for this delta. If Phase 2 is abandoned or reworked after this delta ships, the new
-- choice codes and columns simply stay unused: do NOT DELETE FROM choice_inbound_category
-- / choice_inbound_subtype / choice_audit_action and do NOT DROP the new columns --
-- either risks orphaning a row some later engine tag or staff action already wrote
-- against them. A correction, if ever needed, is a NEW forward delta, not an edit to
-- this file (this file is frozen once applied live).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- choice_inbound_category -- two new Rules-Engine-v2 categories. Append-only:
-- 100000000-100000004 are already live (see ../000_enums_lookups.sql). Names match
-- the taxonomy-v2 engine's planned CATEGORY_* additions.
-- ---------------------------------------------------------------------------
INSERT INTO choice_inbound_category (code, name, label) VALUES
  (100000005, 'case_update',  'Case update'),
  (100000006, 'cancellation', 'Cancellation')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- choice_inbound_subtype -- three new Rules-Engine-v2 subtypes. Append-only:
-- 100000000-100000009 are already live. NOTE: `images_received` is the ONLY subtype
-- actually named in the plan text (Phase 2 "Images-received routing", TKT-034/043).
-- `cancellation_notice` and `update_general` are NOT plan-named -- they are minimal
-- completions minted here so the two new categories above (cancellation, case_update)
-- each have at least one subtype to land on before the engine ships real ones.
-- FLAGGED FOR OPERATOR REVIEW AT APPLY TIME: confirm these two names/labels are
-- acceptable placeholders, or hold this INSERT back until Phase 2's build supplies the
-- real subtype set (the category rows above are needed regardless; these three subtype
-- rows are the part worth a second look).
-- ---------------------------------------------------------------------------
INSERT INTO choice_inbound_subtype (code, name, label) VALUES
  (100000010, 'images_received',     'Images received'),
  (100000011, 'cancellation_notice', 'Cancellation notice'),
  (100000012, 'update_general',      'Case update — general')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- choice_audit_action -- four new Phase-2 audit actions. Append-only: tops out at
-- 100000034 'ai_suggestion_rejected' (see ../000_enums_lookups.sql). Covers the
-- ref-gate suggest/link/detach lifecycle (Phase 2: "New inbound_*/attach audit
-- actions") and the cancellation-propose action (Phase 2: "Cancellation action: ...
-- propose close/hold with note + audit"). These are distinct from the EXISTING
-- ai_suggestion_created/accepted/rejected actions (100000032-100000034): those audit
-- review of the classifier's category/subtype SUGGESTION itself; these four audit the
-- ref-gate's case-LINK decision (suggest a link -> accept -> attach, or detach later).
-- ---------------------------------------------------------------------------
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000035, 'inbound_link_suggested', 'Inbound Link Suggested'),
  (100000036, 'inbound_linked',         'Inbound Linked'),
  (100000037, 'inbound_detached',       'Inbound Detached'),
  (100000038, 'cancellation_proposed',  'Cancellation Proposed')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- inbound_email -- two new columns. Both have been CAPTURED by orchestration since the
-- Phase-0 deploy (contract pass-through landed 2026-07-02: conversationId added to the
-- Graph $select in services/orchestration/src/adapters/graph.ts and carried in the envelope; the
-- engine's existing body_jobref surfaced through the OpenAPI schema + TS client) but
-- not yet PERSISTED -- this delta is what starts persistence. See ../120_inbound_email.sql.
-- ---------------------------------------------------------------------------
ALTER TABLE inbound_email ADD COLUMN IF NOT EXISTS body_jobref varchar(64);
ALTER TABLE inbound_email ADD COLUMN IF NOT EXISTS conversation_id varchar(512);

COMMENT ON COLUMN inbound_email.body_jobref IS
  'Engine-extracted existing-job reference (email_classifier.py _job_reference), distinct from body_caseref; feeds the Phase-2 pre-mint ref-gate (closes the TKT-023 leak).';
COMMENT ON COLUMN inbound_email.conversation_id IS
  'Microsoft Graph conversationId; LOCAL Postgres thread correlation only (Phase 2 secondary signal) -- NOT a dedup key (source_message_id is) and NOT used against Graph''s own $filter=conversationId.';

-- Both columns are sparse (historical rows predate capture; not every message carries a
-- job ref), so index only the populated rows.
CREATE INDEX IF NOT EXISTS idx_inbound_email_conversation ON inbound_email (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_email_body_jobref   ON inbound_email (body_jobref)     WHERE body_jobref IS NOT NULL;

COMMIT;
