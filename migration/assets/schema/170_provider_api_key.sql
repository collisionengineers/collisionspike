-- =============================================================================
-- 170_provider_api_key.sql  --  provider API-intake keys  (TKT-055, ADR-0020)
-- -----------------------------------------------------------------------------
-- NEW Azure-era table (no Dataverse cr1bd_ ancestor). Backs the provider API
-- intake channel: a work provider's own system authenticates with an X-Api-Key
-- header to POST a case (instructions + images) directly, instead of emailing.
--
-- HASH-ONLY (show-once) secret storage: the full secret ('cspk_<32+ url-safe>')
-- is returned to the operator EXACTLY ONCE at mint time and never persisted --
-- only its SHA-256 hex digest (key_hash) is stored, plus the first 12 chars
-- (key_prefix) for display + the O(1) lookup the auth wrapper does before the
-- constant-time hash compare. A leaked database therefore yields no usable keys.
--
-- Provider identity is server-resolved from work_provider_id ON EVERY request
-- (ADR-0020): the submission body never carries a principal code. ON DELETE
-- CASCADE (a purged provider takes its keys with it) -- FK + Row-Level Security
-- are added in 900_constraints.sql (applied LAST), exactly like ai_suggestion (160).
--
-- REVOCATION is a soft flag (revoked_at), never a row delete, so an audit trail
-- of "this key existed and was retired" survives (the app login has no DELETE).
-- =============================================================================
BEGIN;

CREATE TABLE provider_api_key (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owning work provider. The submission's provider identity + principal_code come
  -- ONLY from here (ADR-0020) -- never from the request body. CASCADE FK in 900.
  work_provider_id  uuid NOT NULL,
  -- Operator-supplied human label (e.g. 'Acme production integration').
  label             varchar(200) NOT NULL,
  -- First 12 chars of the full secret ('cspk_' + 7) -- for display + prefix lookup.
  key_prefix        varchar(12) NOT NULL,
  -- SHA-256 hex digest (64 chars) of the FULL secret. The secret itself is NEVER stored.
  key_hash          varchar(128) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text,                          -- Entra oid/upn of the minting Superuser
  revoked_at        timestamptz,                   -- soft-revoke flag (NULL = active)
  last_used_at      timestamptz                    -- fire-and-forget stamp on each successful auth
);

COMMENT ON TABLE provider_api_key IS
  'Provider API-intake keys (TKT-055/ADR-0020) -- hash-only, show-once. Provider identity is server-resolved from work_provider_id on every request; the secret is never persisted.';
COMMENT ON COLUMN provider_api_key.key_hash IS
  'SHA-256 hex of the full secret. Compared with crypto.timingSafeEqual in api/src/lib/api-key-auth.ts; the plaintext is shown once at mint and never stored.';

-- The auth hot path: look up an active key by its display prefix, then constant-time
-- compare the hash. Partial index on the live (non-revoked) keys keeps it lean.
CREATE INDEX ix_provider_api_key_prefix       ON provider_api_key (key_prefix) WHERE revoked_at IS NULL;
-- The Admin "list a provider's keys" read.
CREATE INDEX ix_provider_api_key_work_provider ON provider_api_key (work_provider_id);

COMMIT;
