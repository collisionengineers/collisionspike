-- TKT-226 — append-only inbound subtype for retro-linked related correspondence.
-- The TKT-222 link-related lane stamps subtype 'retro_related' (retro-routes.ts), but the
-- name had no choice row: INBOUND_SUBTYPE_TO_INT mapped it to NULL and rows rendered
-- 'Unidentified'. Apply BEFORE deploying a Data API build that maps 'retro_related' -> 100000016.
BEGIN;

INSERT INTO choice_inbound_subtype (code, name, label) VALUES
  (100000016, 'retro_related', 'Related (retro-linked)')
ON CONFLICT (code) DO NOTHING;

-- Corrective backfill: rows the retro lane already linked landed subtype NULL
-- (silent unmapped-name null). Re-stamp only those rows, never a human decision.
UPDATE inbound_email
   SET subtype_code = 100000016, updated_at = now()
 WHERE subtype_code IS NULL
   AND category_code = 100000005            -- case_update
   AND classifier_mode <> 'human'
   AND signals LIKE '%retro_related_linked%';

COMMIT;
