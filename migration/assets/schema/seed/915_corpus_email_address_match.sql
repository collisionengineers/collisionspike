-- =============================================================================
-- 915_corpus_email_address_match.sql -- ADDITIVE corpus match fixes (2026-06 live-test defects)
--
-- Idempotent. Apply AFTER 910_seed_corpus.sql (or standalone against the live DB). Adds the
-- address-level match column and reinforces two provider mappings found mis-matched in the
-- 2026-06 live test:
--   #9  OAK  "Oakwoods Solicitors"     -> BOTH sender domains (oakwoodscotland.co.uk +
--                                         oakwoodsolicitors.co.uk) so Oakwood mail auto-matches
--                                         instead of mis-classing as "new client work".
--   #5  YML  "YM Law / NETWORK HD UK"  -> address-level match networkhduk@gmail.com (a generic
--                                         gmail.com domain cannot be domain-keyed).
--
-- known_email_addresses = full-address overrides for generic domains; @cs/domain provider-match
-- consults it FIRST (takes precedence over the domain match). Newline-separated, lowercased,
-- deduped -- same storage convention as known_email_domains.
--
-- RLS: work_provider has FORCE ROW LEVEL SECURITY; run with app.role in ('staff','admin'), e.g.
--   psql "host=... dbname=collisionspike sslmode=require user=<entra-admin> options='-c app.role=admin'" -f 915_*.sql
-- (the ALTER needs table-owner/azure_pg_admin privilege; the UPDATEs need app.role set).
--
-- Reproducibility: the operator's external seed inputs should also carry these rows so a full
-- 910 reseed reproduces them WITHOUT this patch:
--   dataverse/.build/email-domains.csv    (principal_code,email_domain):   OAK,oakwoodsolicitors.co.uk
--   dataverse/.build/email-addresses.csv  (principal_code,email_address):  YML,networkhduk@gmail.com
-- Until those are added, re-run THIS patch after any reseed (it is idempotent).
-- =============================================================================
BEGIN;

-- Address-level match column (mirrors known_email_domains; full sender addresses).
ALTER TABLE work_provider ADD COLUMN IF NOT EXISTS known_email_addresses text;
COMMENT ON COLUMN work_provider.known_email_addresses IS
  'Full sender-address overrides for generic domains (e.g. gmail). Newline/JSON list; address-level match, takes precedence over domain match.';

-- #9 OAK -- union existing domains with BOTH Oakwood domains (dedupe, sort, newline-join).
UPDATE work_provider SET
  known_email_domains = (
    SELECT string_agg(d, E'\n' ORDER BY d) FROM (
      SELECT DISTINCT lower(trim(x)) AS d FROM unnest(
        regexp_split_to_array(coalesce(known_email_domains, ''), '[\r\n,]+')
        || ARRAY['oakwoodscotland.co.uk', 'oakwoodsolicitors.co.uk']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'OAK';

-- #5 YML -- address-level match for the generic gmail sender (domain can't be keyed).
UPDATE work_provider SET
  known_email_addresses = (
    SELECT string_agg(a, E'\n' ORDER BY a) FROM (
      SELECT DISTINCT lower(trim(x)) AS a FROM unnest(
        regexp_split_to_array(coalesce(known_email_addresses, ''), '[\r\n,]+')
        || ARRAY['networkhduk@gmail.com']
      ) AS t(x) WHERE trim(x) <> ''
    ) u
  ),
  updated_at = now()
WHERE principal_code = 'YML';

COMMIT;
