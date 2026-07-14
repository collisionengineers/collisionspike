-- =============================================================================
-- TKT-150 -- distinguish system provider holds from staff holds
--
-- Automated provider recovery may clear only a hold that intake owns. The
-- existing `held_by` column belongs to retention/legal-hold metadata and is not
-- reused for case routing.
--
-- Additive + transactional + idempotent. The legacy backfill is deliberately
-- conservative: only unnumbered Held cases with an intake/retro audit proving
-- that provider identity caused the hold are marked. Any case that has ever had
-- an explicit staff "Case put on hold" event remains unclassified for review.
-- =============================================================================
BEGIN;

INSERT INTO choice_field_provenance_source_type (code, name, label)
VALUES (100000011, 'unknown', 'Source Not Recorded')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      label = EXCLUDED.label;

ALTER TABLE case_
  ADD COLUMN IF NOT EXISTS on_hold_reason varchar(40);

ALTER TABLE case_
  ADD COLUMN IF NOT EXISTS provider_archive_requested_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_archive_completed_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_archive_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_archive_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_archive_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_archive_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provider_archive_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_archive_last_error varchar(200);

UPDATE case_ c
   SET on_hold_reason = 'provider_unresolved',
       updated_at = now()
 WHERE c.on_hold = true
   AND NULLIF(btrim(c.case_po), '') IS NULL
   AND c.on_hold_reason IS NULL
   AND EXISTS (
     SELECT 1
       FROM audit_event ae
      WHERE ae.case_id = c.id
        AND ae.action_code = 100000025 -- inbound_routed
        AND (
          ae.name LIKE 'New client routed to Held%'
          OR ae.name LIKE 'Intermediary sender routed to Held%'
          OR ae.name LIKE 'Retro case held%identity unverified%'
        )
   )
   AND NOT EXISTS (
     SELECT 1
       FROM audit_event manual_hold
      WHERE manual_hold.case_id = c.id
        AND manual_hold.action_code = 100000013 -- status_changed
        AND manual_hold.name = 'Case put on hold'
   );

ALTER TABLE case_
  DROP CONSTRAINT IF EXISTS ck_case_on_hold_reason;

ALTER TABLE case_
  ADD CONSTRAINT ck_case_on_hold_reason CHECK (
    on_hold_reason IS NULL
    OR (on_hold = true AND on_hold_reason IN (
      'provider_unresolved', 'provider_archive_pending', 'manual'
    ))
  );

ALTER TABLE case_
  DROP CONSTRAINT IF EXISTS ck_case_provider_archive_generation;

ALTER TABLE case_
  ADD CONSTRAINT ck_case_provider_archive_generation CHECK (
    provider_archive_completed_generation <= provider_archive_requested_generation
    AND provider_archive_attempt_count >= 0
  );

CREATE INDEX IF NOT EXISTS ix_case_provider_archive_pending
  ON case_ (provider_archive_next_attempt_at, provider_archive_requested_at, id)
  WHERE provider_archive_completed_generation < provider_archive_requested_generation;

COMMENT ON COLUMN case_.on_hold_reason IS
  'Routing-hold owner. provider_unresolved advances to provider_archive_pending; only Archive linkage clears it. manual requires staff action.';

COMMENT ON COLUMN case_.provider_archive_requested_generation IS
  'Durable provider-recovery Archive-folder work requested in the identity transaction; completion advances only after exact case-state verification.';

COMMIT;

-- Read-only verification:
-- SELECT on_hold_reason, count(*) FROM case_ GROUP BY on_hold_reason ORDER BY 1;
-- SELECT count(*) FROM case_ WHERE NOT on_hold AND on_hold_reason IS NOT NULL; -- expect 0
-- SELECT count(*) FROM case_ WHERE on_hold_reason NOT IN ('provider_unresolved', 'provider_archive_pending', 'manual'); -- expect 0
