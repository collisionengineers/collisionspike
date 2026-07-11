-- =============================================================================
-- TKT-089 regression: durable ownership for image review decisions.
-- Adds source columns only; the backfill never changes a business field.
-- =============================================================================
BEGIN;

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS image_role_source varchar(20);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS registration_visible_source varchar(20);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS accepted_for_eva_source varchar(20);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS exclusion_decision_source varchar(20);

CREATE TABLE IF NOT EXISTS backup_20260711_tkt089_evidence_ownership (
  id uuid PRIMARY KEY,
  file_name varchar(400) NOT NULL,
  source_label varchar(400),
  image_role_code integer NOT NULL,
  registration_visible boolean,
  accepted_for_eva boolean NOT NULL,
  excluded boolean NOT NULL,
  exclusion_reason varchar(400),
  person_reflection boolean NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO backup_20260711_tkt089_evidence_ownership
  (id, file_name, source_label, image_role_code, registration_visible,
   accepted_for_eva, excluded, exclusion_reason, person_reflection)
SELECT e.id, e.file_name, e.source_label, e.image_role_code, e.registration_visible,
       e.accepted_for_eva, e.excluded, e.exclusion_reason, e.person_reflection
  FROM evidence e
 WHERE e.kind_code = 100000000
ON CONFLICT (id) DO NOTHING;

-- Historic staff PATCHes predate the ownership columns, but every successful
-- review wrote an append-only attachment_classified audit carrying after.evidenceId
-- plus before/after decision fields. Parse each text snapshot defensively: one
-- malformed legacy audit must not abort the migration. This is the authoritative
-- ownership signal and intentionally replaces a prior inferred 'classifier' value.
--
-- Rolling deploy: rerun this idempotent delta after the new API is live so a staff
-- review written by the old API during the schema->code window is also recovered.
CREATE OR REPLACE FUNCTION pg_temp.try_parse_jsonb(input text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN input::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

WITH parsed_staff_audit AS (
  SELECT
    pg_temp.try_parse_jsonb(ae.before) AS before_json,
    pg_temp.try_parse_jsonb(ae.after) AS after_json
  FROM audit_event ae
  WHERE ae.action_code = 100000002
), valid_staff_audit AS (
  SELECT before_json, after_json, (after_json->>'evidenceId')::uuid AS evidence_id
  FROM parsed_staff_audit
  WHERE jsonb_typeof(before_json) = 'object'
    AND jsonb_typeof(after_json) = 'object'
    AND after_json->>'evidenceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), staff_change_flags AS (
  SELECT
    evidence_id,
    before_json ? 'imageRole' AND after_json ? 'imageRole'
      AND before_json->'imageRole' IS DISTINCT FROM after_json->'imageRole' AS changed_image_role,
    before_json ? 'registrationVisible' AND after_json ? 'registrationVisible'
      AND before_json->'registrationVisible' IS DISTINCT FROM after_json->'registrationVisible' AS changed_registration,
    before_json ? 'acceptedForEva' AND after_json ? 'acceptedForEva'
      AND before_json->'acceptedForEva' IS DISTINCT FROM after_json->'acceptedForEva' AS changed_acceptance,
    before_json ? 'excluded' AND after_json ? 'excluded'
      AND before_json->'excluded' IS DISTINCT FROM after_json->'excluded' AS changed_exclusion,
    -- The historic audit omitted exclusionReason. A successful PATCH with no
    -- decision-value change and no reflection change can therefore only be an
    -- exclusion-reason edit; protect the exclusion decision in that case.
    before_json ?& ARRAY['imageRole','registrationVisible','acceptedForEva','excluded','reflectionDismissed']
      AND after_json ?& ARRAY['imageRole','registrationVisible','acceptedForEva','excluded','reflectionDismissed']
      AND before_json->'imageRole' IS NOT DISTINCT FROM after_json->'imageRole'
      AND before_json->'registrationVisible' IS NOT DISTINCT FROM after_json->'registrationVisible'
      AND before_json->'acceptedForEva' IS NOT DISTINCT FROM after_json->'acceptedForEva'
      AND before_json->'excluded' IS NOT DISTINCT FROM after_json->'excluded'
      AND before_json->'reflectionDismissed' IS NOT DISTINCT FROM after_json->'reflectionDismissed'
      AS changed_exclusion_reason_only
  FROM valid_staff_audit
), staff_ownership AS (
  SELECT
    evidence_id,
    bool_or(changed_image_role) AS owns_image_role,
    bool_or(changed_registration) AS owns_registration,
    bool_or(changed_acceptance) AS owns_acceptance,
    bool_or(changed_exclusion OR changed_exclusion_reason_only) AS owns_exclusion
  FROM staff_change_flags
  GROUP BY evidence_id
)
UPDATE evidence e
SET image_role_source = CASE WHEN s.owns_image_role THEN 'staff' ELSE e.image_role_source END,
    registration_visible_source = CASE WHEN s.owns_registration THEN 'staff' ELSE e.registration_visible_source END,
    accepted_for_eva_source = CASE WHEN s.owns_acceptance THEN 'staff' ELSE e.accepted_for_eva_source END,
    exclusion_decision_source = CASE WHEN s.owns_exclusion THEN 'staff' ELSE e.exclusion_decision_source END
FROM staff_ownership s
WHERE e.id = s.evidence_id
  AND (s.owns_image_role OR s.owns_registration OR s.owns_acceptance OR s.owns_exclusion);

-- A human-accepted suggestion is the strongest recoverable pre-column ownership signal.
UPDATE evidence e
   SET image_role_source = 'staff',
       accepted_for_eva_source = COALESCE(accepted_for_eva_source, 'staff')
 WHERE e.image_role_source IS NULL
   AND EXISTS (
     SELECT 1 FROM ai_suggestion s
      WHERE s.evidence_id = e.id
        AND s.suggestion_type = 'image_role'
        AND s.review_state = 'accepted'
   );

UPDATE evidence e
   SET registration_visible_source = 'staff'
 WHERE e.registration_visible_source IS NULL
   AND EXISTS (
     SELECT 1 FROM ai_suggestion s
      WHERE s.evidence_id = e.id
        AND s.suggestion_type = 'registration'
        AND s.review_state = 'accepted'
   );

-- Provider submissions explicitly own role, EVA acceptance, and include/exclude.
UPDATE evidence
   SET image_role_source = COALESCE(image_role_source, 'provider'),
       accepted_for_eva_source = COALESCE(accepted_for_eva_source, 'provider'),
       exclusion_decision_source = COALESCE(exclusion_decision_source, 'provider')
 WHERE kind_code = 100000000
   AND source_label = 'provider_api';

-- The audited cleanup must remain excluded regardless of later classifier retries.
UPDATE evidence
   SET accepted_for_eva_source = COALESCE(accepted_for_eva_source, 'cleanup'),
       exclusion_decision_source = COALESCE(exclusion_decision_source, 'cleanup')
 WHERE kind_code = 100000000
   AND exclusion_reason ILIKE '%TKT-089%cleanup%';

-- Existing orchestration/Box rows with classification stamps are classifier-owned.
UPDATE evidence
   SET image_role_source = COALESCE(image_role_source, 'classifier'),
       registration_visible_source = CASE
         WHEN registration_visible IS NOT NULL
           THEN COALESCE(registration_visible_source, 'classifier')
         ELSE registration_visible_source
       END,
       accepted_for_eva_source = COALESCE(accepted_for_eva_source, 'classifier'),
       exclusion_decision_source = COALESCE(exclusion_decision_source, 'classifier')
 WHERE kind_code = 100000000
   AND (
     exclusion_reason ILIKE '%auto-classified%'
     OR (
       (source_label = 'auto-intake' OR source_label LIKE 'box_upload%')
       AND (
         registration_visible IS NOT NULL
         OR image_role_code <> 100000003
         OR accepted_for_eva = false
         OR person_reflection = true
       )
     )
   );

-- Unknown historic writers are protected rather than guessed as classifier output.
UPDATE evidence SET image_role_source = 'legacy'
 WHERE kind_code = 100000000 AND image_role_source IS NULL AND image_role_code <> 100000003;
UPDATE evidence SET registration_visible_source = 'legacy'
 WHERE kind_code = 100000000 AND registration_visible_source IS NULL AND registration_visible IS NOT NULL;
UPDATE evidence SET accepted_for_eva_source = 'legacy'
 WHERE kind_code = 100000000 AND accepted_for_eva_source IS NULL AND accepted_for_eva = false;
UPDATE evidence SET exclusion_decision_source = 'legacy'
 WHERE kind_code = 100000000 AND exclusion_decision_source IS NULL AND excluded;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_evidence_image_role_source') THEN
    ALTER TABLE evidence ADD CONSTRAINT ck_evidence_image_role_source
      CHECK (image_role_source IS NULL OR image_role_source IN ('classifier','staff','provider','cleanup','legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_evidence_registration_visible_source') THEN
    ALTER TABLE evidence ADD CONSTRAINT ck_evidence_registration_visible_source
      CHECK (registration_visible_source IS NULL OR registration_visible_source IN ('classifier','staff','provider','cleanup','legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_evidence_accepted_for_eva_source') THEN
    ALTER TABLE evidence ADD CONSTRAINT ck_evidence_accepted_for_eva_source
      CHECK (accepted_for_eva_source IS NULL OR accepted_for_eva_source IN ('classifier','staff','provider','cleanup','legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_evidence_exclusion_decision_source') THEN
    ALTER TABLE evidence ADD CONSTRAINT ck_evidence_exclusion_decision_source
      CHECK (exclusion_decision_source IS NULL OR exclusion_decision_source IN ('classifier','staff','provider','cleanup','legacy'));
  END IF;
END $$;

-- Rolling-deploy compatibility: the pre-source orchestration build may legitimately
-- insert excluded=true while omitting decisionSource. Keep NULL as "unowned" so the
-- old writer remains safe; the allowed-value checks above still reject invented owners,
-- and source-aware updates never overwrite a protected non-NULL owner.
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS ck_evidence_exclusion_source;

CREATE INDEX IF NOT EXISTS ix_evidence_case_classifier_review
  ON evidence (case_id, sequence_index, created_at)
  WHERE kind_code = 100000000
    AND excluded
    AND exclusion_decision_source = 'classifier';

COMMIT;

-- Verify after apply:
-- SELECT exclusion_decision_source, count(*) FROM evidence WHERE excluded GROUP BY 1;
-- SELECT count(*) FROM evidence WHERE excluded AND exclusion_decision_source IS NULL; -- 0
