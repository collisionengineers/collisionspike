-- Executable PostgreSQL fixture for the audit-derived TKT-089 ownership rules.
-- Run with ON_ERROR_STOP=1. It creates no persistent objects and raises on drift.
DO $$
DECLARE
  registration_before jsonb := '{"imageRole":100000003,"registrationVisible":null,"acceptedForEva":true,"excluded":false,"reflectionDismissed":false}';
  registration_after  jsonb := '{"imageRole":100000003,"registrationVisible":true,"acceptedForEva":true,"excluded":false,"reflectionDismissed":false}';
  reflection_before   jsonb := '{"imageRole":100000003,"registrationVisible":null,"acceptedForEva":true,"excluded":false,"reflectionDismissed":false}';
  reflection_after    jsonb := '{"imageRole":100000003,"registrationVisible":null,"acceptedForEva":true,"excluded":false,"reflectionDismissed":true}';
  reason_before       jsonb := '{"imageRole":100000003,"registrationVisible":null,"acceptedForEva":true,"excluded":true,"reflectionDismissed":false}';
  reason_after        jsonb := '{"imageRole":100000003,"registrationVisible":null,"acceptedForEva":true,"excluded":true,"reflectionDismissed":false}';
BEGIN
  IF NOT (
    registration_before->'registrationVisible'
      IS DISTINCT FROM registration_after->'registrationVisible'
  ) THEN
    RAISE EXCEPTION 'registration-only fixture did not identify registration ownership';
  END IF;
  IF registration_before->'imageRole' IS DISTINCT FROM registration_after->'imageRole'
     OR registration_before->'acceptedForEva' IS DISTINCT FROM registration_after->'acceptedForEva'
     OR registration_before->'excluded' IS DISTINCT FROM registration_after->'excluded' THEN
    RAISE EXCEPTION 'registration-only fixture leaked ownership to another decision';
  END IF;

  IF reflection_before->'imageRole' IS DISTINCT FROM reflection_after->'imageRole'
     OR reflection_before->'registrationVisible' IS DISTINCT FROM reflection_after->'registrationVisible'
     OR reflection_before->'acceptedForEva' IS DISTINCT FROM reflection_after->'acceptedForEva'
     OR reflection_before->'excluded' IS DISTINCT FROM reflection_after->'excluded' THEN
    RAISE EXCEPTION 'reflection-only fixture leaked decision ownership';
  END IF;
  IF NOT (reflection_before->'reflectionDismissed'
            IS DISTINCT FROM reflection_after->'reflectionDismissed') THEN
    RAISE EXCEPTION 'reflection-only fixture did not change reflection state';
  END IF;

  IF reason_before->'imageRole' IS DISTINCT FROM reason_after->'imageRole'
     OR reason_before->'registrationVisible' IS DISTINCT FROM reason_after->'registrationVisible'
     OR reason_before->'acceptedForEva' IS DISTINCT FROM reason_after->'acceptedForEva'
     OR reason_before->'excluded' IS DISTINCT FROM reason_after->'excluded'
     OR reason_before->'reflectionDismissed' IS DISTINCT FROM reason_after->'reflectionDismissed' THEN
    RAISE EXCEPTION 'reason-only fixture unexpectedly changed a snapshotted value';
  END IF;
END;
$$;
