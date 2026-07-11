-- TKT-089: serialize archive upload with exclusion decisions without holding a
-- database transaction across external Box I/O.
BEGIN;

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS archive_mirror_decision_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_mirror_claim_token uuid,
  ADD COLUMN IF NOT EXISTS archive_mirror_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_mirror_claim_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_evidence_archive_mirror_claim_expiry
  ON evidence (archive_mirror_claim_expires_at)
  WHERE archive_mirror_claim_token IS NOT NULL;

COMMIT;
