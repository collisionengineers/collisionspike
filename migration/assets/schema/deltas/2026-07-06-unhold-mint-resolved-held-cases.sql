-- =============================================================================
-- 2026-07-06-unhold-mint-resolved-held-cases.sql
-- Backfill pass Phase 2 — un-hold + mint a Case/PO for the resolved-but-Held cases
-- (DATA ONLY, idempotent, one transaction). Follows Phase 1
-- (2026-07-06-backfill-providers-active-cases.sql).
-- -----------------------------------------------------------------------------
-- CONTEXT. After Phase 1, 23 ACTIVE cases carry a resolved work_provider_id but are
-- still on_hold with case_po NULL (they were parked as "new client → Held" before the
-- provider was known; nothing un-holds a case retroactively — internal.ts:320-337).
-- Every OTHER active case (128) already carries a system-minted placeholder Case/PO.
-- This delta brings the 23 into line: un-hold them and mint the next standard Case/PO.
--
-- WHY IT'S SAFE TO HAND-APPLY (and why it is NOT a loose reimplementation):
--   * The live allocator is api/src/lib/case-po.ts::mintCasePo =
--     GREATEST(db_max, floor) + 1 under pg_advisory_xact_lock('casepo:<PREFIX>').
--   * case_po_floor is DARK (0 rows — verified 2026-07-06), so floor = 0 and the mint
--     reduces to db_max + 1. ALL 23 cases are case_type NULL = STANDARD marker (''),
--     and there are NO existing standard PCH26/FW26/DFD26 rows (only audit A.PCH26nn),
--     so each principal's standard sequence starts at 001.
--   * This delta takes the SAME advisory-lock KEY per (marker='',principal,'26') prefix
--     BEFORE probing, and RE-COMPUTES db_max inside the transaction (NOT the preview's
--     hardcoded numbers) — so a concurrent live intake mint of the same standard
--     sequence is serialised and the row_number() continues ABOVE whatever it minted.
--   * The probe SQL (LIKE prefix||'%' AND ~ '^PRINCIPAL26[0-9]{3,}$', SUBSTRING from
--     length(prefix)+1) is copied verbatim from mintCasePo / next-po, so 'A.PCH26nnn'
--     is never swept into the standard 'PCH26' sequence.
--
-- These numbers are PLACEHOLDERS: the ADR-0022 case_po_floor cutover (blocked on
-- gated.md D11 Box archive-root config) will re-seed the floor and renumber ALL
-- placeholders (these 23 + the existing 128) to continue the real-world sequence.
-- That is the accepted trial-period model (docs/plans/case-po-sequence-cutover.md).
--
-- PREVIEW (read 2026-07-06): PCH26001..PCH26020, FW26001..FW26002, DFD26001.
--
-- PRE-CHECK (expect 23 held/NULL-po/resolved):
--   SELECT count(*) FROM case_
--    WHERE status_code NOT IN (100000008,100000009,100000010,100000011)
--      AND on_hold AND case_po IS NULL AND work_provider_id IS NOT NULL;
-- =============================================================================

-- REPLAY-SAFETY CUTOFF. This delta captures the resolved-but-Held cases that existed at
-- apply time (2026-07-06). Without a bound, a later rerun would ALSO un-hold + mint a
-- Case/PO for any NEW resolved-Held case still awaiting staff confirmation — a live-data
-- side effect the deltas/ README forbids ("repeat runs must no-op"). Bounding on
-- created_at < the day AFTER apply keeps the applied result identical while making reruns
-- inert against future cases. (The idempotency guard below still no-ops the original 23.)
\set unhold_cutoff '2026-07-07 00:00:00+00'

BEGIN;

-- Take the live allocator's advisory-lock key for each affected standard prefix, so
-- this batch serialises against any concurrent intake mint of the same sequence.
-- (Held.prefix = marker '' + upper(principal) + '26'.)
SELECT pg_advisory_xact_lock(hashtext('casepo:' || prefix)::bigint)
  FROM (
    SELECT DISTINCT upper(w.principal_code) || '26' AS prefix
      FROM case_ c
      JOIN work_provider w ON w.id = c.work_provider_id
     WHERE c.status_code NOT IN (100000008,100000009,100000010,100000011)
       AND c.on_hold AND c.case_po IS NULL
       AND c.work_provider_id IS NOT NULL
       AND c.created_at < TIMESTAMPTZ :'unhold_cutoff'
  ) p
 ORDER BY prefix;  -- deterministic lock order (deadlock-safe)

-- Compute assignments (db_max re-probed HERE under the lock) and apply: mint + un-hold.
WITH held AS (
  SELECT c.id, c.created_at,
         upper(w.principal_code) AS principal,
         upper(w.principal_code) || '26' AS prefix
    FROM case_ c
    JOIN work_provider w ON w.id = c.work_provider_id
   WHERE c.status_code NOT IN (100000008,100000009,100000010,100000011)
     AND c.on_hold AND c.case_po IS NULL
     AND c.work_provider_id IS NOT NULL
     AND c.created_at < TIMESTAMPTZ :'unhold_cutoff'   -- replay-safety (see header)
),
dbmax AS (  -- exact mintCasePo probe, STANDARD marker only
  SELECT h.prefix, h.principal,
         COALESCE(MAX(SUBSTRING(upper(c.case_po) FROM length(h.prefix) + 1)::int), 0) AS max_seq
    FROM (SELECT DISTINCT prefix, principal FROM held) h
    LEFT JOIN case_ c
      ON upper(c.case_po) LIKE h.prefix || '%'
     AND upper(c.case_po) ~ ('^' || h.principal || '26[0-9]{3,}$')
   GROUP BY h.prefix, h.principal
),
assigned AS (
  SELECT h.id, h.prefix,
         d.max_seq + row_number() OVER (PARTITION BY h.prefix
                                        ORDER BY h.created_at, h.id) AS seq
    FROM held h JOIN dbmax d ON d.prefix = h.prefix
),
upd AS (
  UPDATE case_ c
     SET case_po    = a.prefix || lpad(a.seq::text, 3, '0'),
         on_hold    = false,
         updated_at = now()
    FROM assigned a
   WHERE c.id = a.id
     AND c.case_po IS NULL       -- idempotency guard: a re-run finds none
     AND c.on_hold
  RETURNING c.id, c.case_po
)
INSERT INTO audit_event (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
SELECT left('Un-held + Case/PO minted (backfill Phase 2): ' || u.case_po, 400),
       u.id,
       'backfill/phase2 2026-07-06',
       100000013,   -- status_changed (no dedicated un-hold/case_po action code exists)
       100000000,   -- info
       json_build_object('on_hold', true,  'case_po', NULL)::text,
       json_build_object('on_hold', false, 'case_po', u.case_po)::text,
       now()
  FROM upd u;

COMMIT;

-- POST-CHECK (expect 0 resolved-held-unnumbered remaining; the 15 unresolved stay Held):
--   SELECT count(*) FILTER (WHERE work_provider_id IS NOT NULL) AS resolved_still_held
--     FROM case_
--    WHERE status_code NOT IN (100000008,100000009,100000010,100000011)
--      AND on_hold AND case_po IS NULL;                       -- expect 0
--   SELECT case_po FROM case_ WHERE upper(case_po) ~ '^(PCH|FW|DFD)26[0-9]{3}$' ORDER BY case_po;
