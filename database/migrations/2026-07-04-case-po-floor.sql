-- =============================================================================
-- 2026-07-04-case-po-floor.sql
-- Case/PO sequence-floor table (ADR-0022 cutover mechanism) -- idempotent
-- -----------------------------------------------------------------------------
-- PURPOSE. The transition from staff-minted-at-EVA-add numbering to
-- system-minted-at-intake (TKT-058; ADR-0022 Consequences addendum;
-- docs/adr/0021-case-po-marker-taxonomy.md): `case_po_floor` carries the
-- REAL-WORLD per-(marker, principal, year) maxima, and mintCasePo allocates
-- GREATEST(db_max, floor_seq) + 1 -- the live sequence continues the business's
-- numbering instead of restarting after the 2026-06-30 DB reset.
--
-- SHIPS DARK: an EMPTY table changes nothing (floor 0 everywhere), and the API
-- code is schema-tolerant (a missing table = floor 0), so this delta and the
-- code deploy are order-independent. The table only ACTS once the cutover
-- runbook seeds it.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. CREATE IF NOT EXISTS / guarded policy
-- creates; one BEGIN..COMMIT. A fresh rebuild that already applied the
-- companion canonical files (../180_case_po_floor.sql, ../900_constraints.sql)
-- no-ops here. See ./README.md for the canonical-vs-delta relationship.
--
-- APPLY RUNBOOK: docs/operations/database.md connection pattern (transient firewall
-- rule -> AAD token -> psql -> SET ROLE csadmin -> \i this file -> delete rule).
-- Verify with the queries at the foot.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. case_po_floor -- the cutover sequence-floor table (../180_case_po_floor.sql).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_po_floor (
  prefix     varchar(24) PRIMARY KEY,
  floor_seq  integer     NOT NULL CHECK (floor_seq >= 0),
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE case_po_floor IS
  'ADR-0022 cutover sequence floors: mintCasePo = GREATEST(db max, floor_seq) + 1 per prefix. Empty = dark.';

-- ---------------------------------------------------------------------------
-- 2. RLS + grant -- same posture as every work table (staff rw, delete admin-only).
-- ---------------------------------------------------------------------------
ALTER TABLE case_po_floor ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_po_floor FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'case_po_floor' AND policyname = 'p_case_po_floor_rw') THEN
    CREATE POLICY p_case_po_floor_rw ON case_po_floor
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'case_po_floor' AND policyname = 'p_case_po_floor_no_delete') THEN
    CREATE POLICY p_case_po_floor_no_delete ON case_po_floor AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON case_po_floor TO cespk_app;
  END IF;
END $$;

COMMIT;

-- VERIFY (all read-only):
--   SELECT to_regclass('public.case_po_floor');   -- expect: case_po_floor (not NULL)
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'case_po_floor'; -- expect t | t
--   SELECT policyname FROM pg_policies WHERE tablename = 'case_po_floor' ORDER BY policyname;
--     -- expect p_case_po_floor_no_delete, p_case_po_floor_rw
--   SELECT count(*) FROM case_po_floor;           -- expect 0 until the cutover runbook seeds it
