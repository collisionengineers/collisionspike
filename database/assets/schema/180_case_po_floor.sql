-- =============================================================================
-- 180_case_po_floor.sql  --  Case/PO sequence floors  (ADR-0022 cutover; TKT-058)
-- -----------------------------------------------------------------------------
-- One row per (marker+PRINCIPAL+YY) prefix carrying the REAL-WORLD maximum
-- sequence at cutover — the bridge from the old process (staff mint the number at
-- EVA-add) to the new one (the system mints at intake). `mintCasePo`
-- (api/src/lib/case-po.ts) allocates GREATEST(db_max, floor_seq) + 1, so the live
-- sequence CONTINUES the business's numbering instead of restarting after a DB
-- reset, and a reconstructed historical Case/PO can never collide with a
-- freshly-minted one.
--
-- Empty table = no floors = pre-cutover behaviour (the mechanism ships dark).
-- Seeded ONCE at cutover from the archive folder names / EVA maxima — runbook:
-- docs/plans/case-po-sequence-cutover.md. RLS/GRANT in 900_constraints.sql (+ the
-- 2026-07-04-case-po-floor delta for the live apply).
-- =============================================================================

CREATE TABLE case_po_floor (
  -- The mint prefix EXACTLY as mintCasePo builds it: marker + PRINCIPAL + YY,
  -- e.g. 'CCPY26', 'A.PCH26', 'AP.QDOS26'. Upper-case by convention.
  prefix     varchar(24) PRIMARY KEY,
  -- The real-world MAX sequence already used for this prefix (mint continues at +1).
  floor_seq  integer     NOT NULL CHECK (floor_seq >= 0),
  -- Where the number came from (e.g. 'archive scan 2026-07-10', 'operator: EVA next-no').
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE case_po_floor IS
  'ADR-0022 cutover sequence floors: mintCasePo = GREATEST(db max, floor_seq) + 1 per prefix. Empty = dark.';
