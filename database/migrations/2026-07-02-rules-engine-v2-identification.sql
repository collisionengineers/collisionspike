-- =============================================================================
-- 2026-07-02-rules-engine-v2-identification.sql
-- Rules Engine v2, Phase 3 -- identification/corpus delta (idempotent, DATA ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. Seeds the ADR-0011 Image-Source intermediary corpus:
--   docs/adr/0011-work-provider-intermediary-garage-roles.md  (binding design -- an
--     intermediary is an ImageSource row, many-to-many with WorkProvider; NEVER a
--     WorkProvider's own knownEmailDomains entry)
--   docs/tickets/TKT-021-connexus-intermediary/, TKT-028-work-provider-not-populating/,
--   TKT-051-pch-connexus/  (the real senders this delta encodes)
--   docs/operations/operator-actions.md (operator-owned activation)
-- Concretely:
--   - image_source              : +1 row   (Connexus, kind=intermediary, domain connexus.co.uk)
--   - imagesource_workprovider  : +up to 2 rows (Connexus -> PCH, Connexus -> SBL)
--   - work_provider             : known_email_domains -- PCH gains pch-ltd.com (its own,
--                                  direct senders -- TKT-051); connexus.co.uk is
--                                  DEFENSIVELY REMOVED from every work_provider row that
--                                  might carry it (an intermediary domain must never
--                                  direct-match a single provider -- ADR-0011)
--
-- UNLIKE the companion 2026-07-02-rules-engine-v2-taxonomy.sql (D7), this delta is PURE
-- DATA -- no new columns, tables, or choice_* codes. Every table/column it touches
-- (image_source, imagesource_workprovider, work_provider.known_email_domains) is
-- ALREADY LIVE (030_image_source.sql / 140_imagesource_workprovider.sql /
-- 010_work_provider.sql), so there is no engine/app-setting deploy-order coupling: the
-- API + orchestration code that reads this corpus (GET /api/internal/provider-match-
-- records' new `imageSources` field, the @cs/domain `matchSenderIdentity` fn, and
-- applyParserFields' content-string -> work_provider_id mapping) degrades SAFELY to
-- today's behaviour when this delta has not yet landed (an empty imageSources list is a
-- normal, handled case -- see services/data-api/src/features/inbound/internal/parser-fields.ts).
-- Applying this delta is
-- what makes the Connexus/PCH/SBL routing live; it does not gate any other deploy.
--
-- VERIFIED SENDER FACTS (2026-07-02, from the real ticket evidence -- domains/codes
-- only, no PII quoted here per repo discipline):
--   - Connexus's own covering emails (TKT-051 evidence .eml `From:` header) come from
--     the domain connexus.co.uk.
--   - The TKT-051 instruction document ("Inspection Request - Audit Report.DOC",
--     forwarded BY Connexus) was run through the vendored parser locally
--     (services/functions/parser/.venv) and returned work_provider.value = "PCH" at confidence
--     1.0 (rule_id pch_performance_work_provider) -- the doc-content signal already
--     works; only the string -> work_provider_id mapping was missing (this is the API
--     code change this delta's data unlocks, not something this file does).
--   - TKT-051's operator note states PCH's OWN direct senders use the domain
--     pch-ltd.com ("Other emails from *@pch-ltd.com ... these are direct from PCH").
--   - TKT-021's operator note names PCH (Performance Car Hire) and SBL as the two
--     principals Connexus sends work on behalf of.
--   - Principal codes: confirmed against the live corpus docs/tickets/ADRs (NOT the raw
--     CSVs 910_seed_corpus.sql \copy's from -- those are gitignored/local-only and were
--     not available to author this delta) -- PCH is referenced repeatedly as a plain
--     "PCH" principal_code in the authoritative provider corpus. ADR-0014 confirms
--     the "A." seen on real folder names like
--     A.PCH261269 is an AUDIT CASE/PO PREFIX minted at Case/PO generation, NOT part of
--     principal_code -- the base code is plain PCH. SBL is confirmed the same way via
--     its claim-number format (SBL-Bxxxxxxx) across multiple real tickets. Both lookups
--     below are by principal_code (case-insensitively) against the LIVE corpus, so if
--     either code turns out to differ from this assumption in production, the
--     corresponding join INSERT simply selects zero rows (see the SKIP note below) --
--     it does not fail the delta.
--
-- SKIP-ON-MISSING. The imagesource_workprovider INSERT ... SELECT ... WHERE
-- upper(principal_code) IN ('PCH','SBL') pattern below silently inserts fewer than 2
-- rows if either code is not present/active in the live corpus (no error, no partial
-- statement failure -- standard SQL set semantics). Run this delta's own verification
-- query (step 5 below) to confirm both landed; if one is missing, find its real
-- principal_code and author a follow-up delta (never edit this frozen file).
--
-- DE-COLLISION NOTE (per the task's explicit ask to check-and-report). This delta
-- COULD NOT be verified against the live database or the raw seed CSVs (no live psql/az
-- in this session; external corpus-refresh sources
-- are not checked into this repo and were not present in this workspace). The two
-- checked-in seed files were inspected directly:
--   - 910_seed_corpus.sql itself contains no literal domain strings (it \copy's from
--     external CSVs this session could not read) -- inconclusive by inspection alone.
--   - 915_corpus_email_address_match.sql (fully inline, git-tracked) does NOT mention
--     Connexus or connexus.co.uk anywhere.
-- So presence of connexus.co.uk on any LIVE work_provider.known_email_domains could not
-- be confirmed either way from this session. The DE-COLLISION UPDATE below is written
-- to be a safe idempotent NO-OP when the domain is absent (matches zero rows) and a
-- correct removal when it is present -- see the "DE-COLLISION" section below.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. Every statement is safe to run more than once
-- (WHERE NOT EXISTS / ON CONFLICT DO NOTHING / DISTINCT-based re-aggregation
-- throughout), and the whole file is one BEGIN...COMMIT so it either fully lands or not
-- at all. Mirrors the seed/915_corpus_email_address_match.sql idiom for appending to
-- known_email_domains (regexp_split_to_array + unnest + DISTINCT + string_agg).
--
-- APPLY RUNBOOK (identical connection pattern to D7 / the 2026-06-30 ai_suggestion
-- delta; see docs/operations/database.md for the general pattern and
-- docs/operations/operator-actions.md for the operator checklist):
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
--      application login cespk_app does NOT own these tables by design, and
--      work_provider/image_source/imagesource_workprovider all carry
--      FORCE ROW LEVEL SECURITY (900_constraints.sql); csadmin owns every table and
--      BYPASSES RLS:
--        PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv) \
--        psql "host=cespk-pg-dev.postgres.database.azure.com port=5432 dbname=collisionspike sslmode=require \
--          user=digital@collisionengineers.co.uk" -v ON_ERROR_STOP=1
--        collisionspike=> SET ROLE csadmin;
--   4. Apply this file:
--        collisionspike=> \i database/migrations/2026-07-02-rules-engine-v2-identification.sql
--   5. Verify (all read-only; run as any role):
--        SELECT id, name, kind_code, email_domain FROM image_source WHERE kind_code = 100000002;
--          -- expect exactly 1 row: name 'Connexus', email_domain 'connexus.co.uk'
--        SELECT wp.principal_code, wp.display_name
--          FROM imagesource_workprovider iw
--          JOIN work_provider wp ON wp.id = iw.work_provider_id
--          JOIN image_source  im ON im.id = iw.image_source_id
--         WHERE im.name = 'Connexus'
--         ORDER BY wp.principal_code;
--          -- expect 2 rows: PCH and SBL (by whatever case the live principal_code uses)
--          -- if fewer than 2 rows: one of the principal codes assumed above is wrong or
--          -- inactive in the live corpus -- see the SKIP-ON-MISSING note above
--        SELECT known_email_domains FROM work_provider WHERE upper(principal_code) = 'PCH';
--          -- expect pch-ltd.com present alongside PCH's existing domain(s)
--        SELECT principal_code FROM work_provider
--         WHERE known_email_domains ~* '(^|[\r\n,])\s*connexus\.co\.uk\s*($|[\r\n,])';
--          -- expect ZERO rows (de-collision confirmed)
--   6. Remove the transient firewall rule from step 2:
--        az postgres flexible-server firewall-rule delete -g rg-collisionspike-dev \
--          -n cespk-pg-dev --rule-name OperatorBuildHost --yes
--
-- ROLLBACK STANCE. Additive/corrective-only, same doctrine as D7 and
-- ../000_enums_lookups.sql. There is no destructive rollback script. If a principal code
-- assumption above proves wrong, or the Connexus domain changes, author a NEW forward
-- delta (this file is frozen once applied live) -- do not edit this one, do not DELETE
-- the image_source/imagesource_workprovider rows it created (a later case may already
-- reference them).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. image_source -- Connexus, the claims-management intermediary (ADR-0011,
-- TKT-021/TKT-051). Named plainly, matching 910_seed_corpus.sql's own naming style
-- for image_source rows (plain business name, no decoration -- see its repairer-kind
-- INSERT). Natural key = (name, kind_code): image_source has no UNIQUE constraint of
-- its own (unlike work_provider.principal_code), so this mirrors 910's own guard for
-- its image_source INSERT (`WHERE NOT EXISTS (... img.name = ... AND img.kind_code = ...)`).
-- channel_code = 100000000 'email' (Connexus is known to us only as an email sender).
-- ---------------------------------------------------------------------------
INSERT INTO image_source (name, kind_code, channel_code, email_domain, created_at, updated_at)
SELECT 'Connexus', 100000002, 100000000, 'connexus.co.uk', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM image_source WHERE name = 'Connexus' AND kind_code = 100000002
);

-- ---------------------------------------------------------------------------
-- 2. imagesource_workprovider -- Connexus -> {PCH, SBL} (ADR-0011's N:N: "one
-- intermediary serves several providers"). Resolves work_provider ids by
-- principal_code (case-insensitive); a missing/inactive code simply selects zero rows
-- for that principal -- see the SKIP-ON-MISSING note in the header. The join table's
-- own composite PRIMARY KEY (image_source_id, work_provider_id) makes ON CONFLICT DO
-- NOTHING the natural idempotency guard (no separate WHERE NOT EXISTS needed here).
-- ---------------------------------------------------------------------------
INSERT INTO imagesource_workprovider (image_source_id, work_provider_id)
SELECT im.id, wp.id
FROM image_source im
CROSS JOIN work_provider wp
WHERE im.name = 'Connexus'
  AND im.kind_code = 100000002
  AND upper(wp.principal_code) IN ('PCH', 'SBL')
ON CONFLICT (image_source_id, work_provider_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. work_provider.known_email_domains -- PCH gains its own DIRECT domain
-- pch-ltd.com (TKT-051: "Other emails from *@pch-ltd.com ... these are direct from
-- PCH"). Mirrors seed/915_corpus_email_address_match.sql's own idiom exactly
-- (regexp_split_to_array + unnest + DISTINCT + string_agg) -- idempotent by
-- construction (DISTINCT dedupes a repeat run without needing a separate existence
-- guard, matching 915's OAK/YML statements).
-- ---------------------------------------------------------------------------
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['pch-ltd.com']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE upper(principal_code) = 'PCH';

-- ---------------------------------------------------------------------------
-- 4. DE-COLLISION -- an intermediary's domain must NEVER also direct-match a single
-- work_provider (ADR-0011: "Intermediary domains are therefore not WorkProvider
-- domains"). Defensively strips connexus.co.uk from EVERY work_provider row that might
-- carry it. Presence/absence could not be verified offline this session (see the
-- header's DE-COLLISION NOTE) -- this statement matches zero rows (a pure no-op) when
-- absent, and correctly removes it when present. Same regexp_split_to_array / unnest /
-- DISTINCT / string_agg idiom as step 3, run in reverse (filter the domain OUT of the
-- unnested set instead of appending it). NULLIF collapses an emptied list to NULL
-- rather than leaving a zero-length string.
-- ---------------------------------------------------------------------------
UPDATE work_provider SET
  known_email_domains = NULLIF((
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
      ) AS t(x)
      WHERE trim(x) <> '' AND lower(trim(x)) <> 'connexus.co.uk'
    ) u
  ), ''),
  updated_at = now()
WHERE lower(coalesce(known_email_domains, '')) ~ '(^|[\r\n,])\s*connexus\.co\.uk\s*($|[\r\n,])';

COMMIT;
