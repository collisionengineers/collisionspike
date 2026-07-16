-- =============================================================================
-- TKT-148 — race-safe, truthfully-labelled overview-photo chase suggestions
-- =============================================================================
BEGIN;

INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000054, 'chaser_suggested', 'Chase suggested')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      label = EXCLUDED.label;

ALTER TABLE chaser
  ADD COLUMN IF NOT EXISTS suggested boolean NOT NULL DEFAULT false;

-- A pre-index deployment may already contain duplicate rows from the former
-- snapshot-sensitive INSERT. Remove ONLY redundant rows with the exact system
-- signature, preserving the oldest deterministic survivor per case. Unrelated
-- and staff-created chasers are never in this CTE.
WITH exact_system_rows AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY case_id
           ORDER BY CASE status_code
                      WHEN 100000002 THEN 0 -- responded
                      WHEN 100000003 THEN 1 -- overdue
                      WHEN 100000001 THEN 2 -- sent
                      ELSE 3                -- drafted / unknown
                    END,
                    sent_at DESC NULLS LAST,
                    drafted_at ASC NULLS LAST,
                    created_at ASC,
                    id ASC
         ) AS occurrence
    FROM chaser
   WHERE template_used = 'Overview photo request'
     AND name = 'Suggested chase — ask for a photo of the whole vehicle showing the registration plate clearly.'
)
DELETE FROM chaser ch
 USING exact_system_rows exact
 WHERE ch.id = exact.id
   AND exact.occurrence > 1;

-- Exact historical TKT-148 survivor rows only. Staff-created/manual chasers stay false.
UPDATE chaser
   SET suggested = true,
       updated_at = now()
 WHERE suggested = false
   AND template_used = 'Overview photo request'
   AND name = 'Suggested chase — ask for a photo of the whole vehicle showing the registration plate clearly.';

-- The database, not a snapshot-sensitive NOT EXISTS check, is the final
-- concurrency backstop. Different staff chasers remain unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chaser_overview_suggestion
  ON chaser (case_id)
  WHERE template_used = 'Overview photo request'
    AND name = 'Suggested chase — ask for a photo of the whole vehicle showing the registration plate clearly.';

COMMIT;
