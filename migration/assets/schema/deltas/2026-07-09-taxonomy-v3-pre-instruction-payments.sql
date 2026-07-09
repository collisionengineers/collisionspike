-- =============================================================================
-- 2026-07-09-taxonomy-v3-pre-instruction-payments.sql
-- PLAN-003 classifier wave -- additive taxonomy-v3 delta (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. Adds the taxonomy-v3 choice rows the PLAN-003 classifier wave's engine
-- tag emits (see the classifier's TAXONOMY_VERSION 2 -> 3 bump):
--   - choice_inbound_category : +1 row  (pre_instruction            -- TKT-084,
--                               operator sign-off recorded 2026-07-09)
--   - choice_inbound_subtype  : +2 rows (payment_remittance          -- TKT-105/120;
--                                         pre_instruction_directions -- TKT-084)
-- Mirrors packages/domain/src/data/choicesets/inbound-email-classification.json
-- (codes 100000007 / 100000013-100000014) and the TS InboundCategory /
-- InboundSubtype unions.
--
-- WHAT THE NEW ROWS MEAN.
--   * pre_instruction / pre_instruction_directions: the sender is giving directions
--     to follow WHEN the official instruction later arrives ("when you receive an
--     instruction from X on this one please hold off obtaining images"). No case is
--     minted; the inbound_email row is held (triage_state 'new', no case_id) and
--     correlated onto the case the later instruction mints, suggest-first, behind
--     TRIAGE_PRE_INSTRUCTION_ENABLED (orchestration app-setting; classifier emission
--     is demoted to 'other' while the gate is off).
--   * payment_remittance (under the existing billing category): an INBOUND payment
--     notification -- a remittance advice or payment-transfer notice for work done
--     (the mirror-image of billing_request). Ungated: the deterministic classifier
--     emits it as soon as the taxonomy-v3 engine tag deploys.
--
-- >>> DEPLOY-ORDER WARNING <<<
--   Apply BEFORE the parser deploy that ships the taxonomy-v3 engine tag (the first
--   tag whose classifier emits category_code 100000007 or subtype_code
--   100000013/100000014): inbound_email.category_code / subtype_code /
--   suggested_category_code / suggested_subtype_code are FK-constrained to the
--   choice tables (../120_inbound_email.sql), so a classify-persist write of an
--   unknown code fails closed. Applying this delta first is always safe: the rows
--   sit unused until the engine ships (append-only doctrine,
--   ../000_enums_lookups.sql). Do not flip TRIAGE_PRE_INSTRUCTION_ENABLED until
--   this delta is confirmed live.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. ON CONFLICT DO NOTHING throughout; one
-- BEGIN..COMMIT. Safe against a fresh rebuild that already carries these rows.
--
-- APPLY RUNBOOK (identical to ./2026-07-02-rules-engine-v2-taxonomy.sql):
--   1. az login                       (Entra admin digital@collisionengineers.co.uk)
--   2. Transient firewall rule for the operator workstation IP (REMOVE in step 6):
--        az postgres flexible-server firewall-rule create -g rg-collisionspike-dev \
--          -n cespk-pg-dev --rule-name OperatorBuildHost \
--          --start-ip-address <your-ip> --end-ip-address <your-ip>
--   3. PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms \
--          --query accessToken -o tsv) \
--      psql "host=cespk-pg-dev.postgres.database.azure.com port=5432 \
--            dbname=collisionspike sslmode=require \
--            user=digital@collisionengineers.co.uk" -v ON_ERROR_STOP=1
--      collisionspike=> SET ROLE csadmin;
--   4. \i migration/assets/schema/deltas/2026-07-09-taxonomy-v3-pre-instruction-payments.sql
--   5. Verify:
--        SELECT code, name, label FROM choice_inbound_category ORDER BY code DESC LIMIT 2;
--          -- expect 100000007 'pre_instruction', then 100000006 'cancellation'
--        SELECT code, name, label FROM choice_inbound_subtype ORDER BY code DESC LIMIT 3;
--          -- expect 100000014 'pre_instruction_directions', 100000013
--          -- 'payment_remittance', then the pre-existing 100000012 'update_general'
--   6. Delete the transient firewall rule:
--        az postgres flexible-server firewall-rule delete -g rg-collisionspike-dev \
--          -n cespk-pg-dev --rule-name OperatorBuildHost --yes
--
-- ROLLBACK STANCE. Additive-only; no destructive rollback (same doctrine as
-- ../000_enums_lookups.sql -- append-only vocabulary, NEVER renumber; a correction
-- is a NEW forward delta).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- choice_inbound_category -- the taxonomy-v3 pre_instruction lane (TKT-084).
-- Append-only: 100000000-100000006 are already live.
-- ---------------------------------------------------------------------------
INSERT INTO choice_inbound_category (code, name, label) VALUES
  (100000007, 'pre_instruction', 'Pre-instruction')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- choice_inbound_subtype -- taxonomy-v3 subtypes. Append-only: 100000000-100000012
-- are already live. Labels are handler-language (rendered in the SPA inbox).
-- ---------------------------------------------------------------------------
INSERT INTO choice_inbound_subtype (code, name, label) VALUES
  (100000013, 'payment_remittance',         'Payment received'),
  (100000014, 'pre_instruction_directions', 'Pre-instruction directions')
ON CONFLICT (code) DO NOTHING;

COMMIT;
