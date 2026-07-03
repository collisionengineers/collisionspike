-- =============================================================================
-- 916_provider_domain_corrections.sql -- ADDITIVE provider domain corrections
--   (evidence: the verified 29-email intake sample, 2026-07 email-classifier hardening)
--
-- Idempotent. Apply AFTER 910_seed_corpus.sql / 915_corpus_email_address_match.sql (or
-- standalone against the live DB). AUTHOR-ONLY: do NOT apply without operator review.
--
-- Section A -- APPEND known sender domains, evidence-backed by the 29-email sample. Each
-- provider mailed a genuine instruction / reply from a domain that must auto-match to its
-- principal_code so its mail is not mis-classed as "new client work":
--   FW    Fairway Legal      -> fairwaylegal.co.uk     (info@fairwaylegal.co.uk)
--   TEN   Ten Legal          -> tenlegal.co.uk         (sa@tenlegal.co.uk)
--   AX    AX / ax-uk         -> ax-uk.com              (engineersinspections@ax-uk.com)
--   BC    Baker & Coleman    -> bakercoleman.co.uk     (u.ibrahim@/a.nawaz@bakercoleman.co.uk)
--   DFD   Davison Flynn Duke -> dfd-solicitors.co.uk   (gary.laiolo@dfd-solicitors.co.uk)
--   BLACK Blackstone Legal   -> blackstone-legal.co.uk (claims@blackstone-legal.co.uk)
--
-- APPEND, never replace: each UPDATE unions the existing known_email_domains with the new
-- domain, then lowercases / trims / dedupes / sorts / newline-joins (same de-dupe idiom as
-- 915 -- regexp_split_to_array + unnest + DISTINCT + string_agg). Guarded against
-- duplication, so re-running is a no-op. A principal_code that is not present in the corpus
-- makes its UPDATE affect zero rows (a safe no-op) -- confirm the code exists before relying
-- on it.
--
-- Section B -- Parkhouse / PHA is a NEW provider (office@parkhouseassist.com, "New claim
-- Instructions PHA 5013"). Inventing a work_provider row is a business decision, so it is
-- kept SEPARATE and gated OPERATOR-CONFIRM below (idempotent, but off by default).
--
-- known_email_domains = newline-separated, lowercased, deduped MATCHING KEY (domain-level);
-- @cs/domain provider-match consults known_email_addresses (915) first, then this.
--
-- RLS: work_provider has FORCE ROW LEVEL SECURITY; run with app.role in ('staff','admin'),
-- and the INSERT/UPDATE need table-owner/azure_pg_admin privilege, e.g.
--   psql "host=... dbname=collisionspike sslmode=require user=<entra-admin> options='-c app.role=admin'" -f 916_*.sql
--
-- Reproducibility: the operator's external seed inputs should also carry these rows so a
-- full 910 reseed reproduces them WITHOUT this patch. Add to
--   dataverse/.build/email-domains.csv (principal_code,email_domain):
--     FW,fairwaylegal.co.uk
--     TEN,tenlegal.co.uk
--     AX,ax-uk.com
--     BC,bakercoleman.co.uk
--     DFD,dfd-solicitors.co.uk
--     BLACK,blackstone-legal.co.uk
-- Until those are added, re-run THIS patch after any reseed (it is idempotent).
-- =============================================================================
BEGIN;

-- --- Section A: evidence-backed domain appends -------------------------------
-- FW -- Fairway Legal
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['fairwaylegal.co.uk']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'FW';

-- TEN -- Ten Legal
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['tenlegal.co.uk']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'TEN';

-- AX -- AX / ax-uk
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['ax-uk.com']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'AX';

-- BC -- Baker & Coleman
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['bakercoleman.co.uk']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'BC';

-- DFD -- Davison Flynn Duke
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['dfd-solicitors.co.uk']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'DFD';

-- BLACK -- Blackstone Legal
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['blackstone-legal.co.uk']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'BLACK';

COMMIT;

-- =============================================================================
-- Section B -- OPERATOR-CONFIRM: Parkhouse / PHA NEW provider row
-- -----------------------------------------------------------------------------
-- The 29-email sample carried a NEW instruction from Parkhouse Assist
-- (office@parkhouseassist.com, subject "New claim Instructions PHA 5013"). No PHA row
-- exists in the corpus yet, so its mail currently classifies as new_client_work.
--
-- Inventing a work_provider row (its display_name, principal_code, policies) is a BUSINESS
-- decision, not a data correction -- so this INSERT is deliberately kept OUT of the
-- committed transaction above and left commented OFF. The operator must CONFIRM the
-- principal_code ("PHA" is inferred from the subject line, NOT verified against Parkhouse's
-- actual EVA/Box code) and the display_name before applying it. The statement is idempotent
-- (ON CONFLICT (principal_code) DO NOTHING) so uncommenting and running it twice is safe.
--
--   BEGIN;
--   INSERT INTO work_provider (principal_code, display_name, known_email_domains, active)
--   VALUES ('PHA', 'Parkhouse Assist', 'parkhouseassist.com', true)
--   ON CONFLICT (principal_code) DO NOTHING;
--   COMMIT;
--
-- Reproducibility (once confirmed): also add to the operator's external seed inputs
--   dataverse/.build/providers.csv        : PHA,Parkhouse Assist
--   dataverse/.build/email-domains.csv    : PHA,parkhouseassist.com
-- =============================================================================
