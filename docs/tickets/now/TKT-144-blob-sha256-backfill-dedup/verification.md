# Verification — TKT-144: Resolve the 214 blob-lane same-name duplicate evidence rows via a sha256 backfill

## Verdict
PENDING

## Evidence
Run executed live 2026-07-10 (see [changes.md](./changes.md)); implementer-side artifacts
awaiting independent verification: [evidence/backup-before.csv](./evidence/backup-before.csv),
[evidence/hash-run-log.csv](./evidence/hash-run-log.csv),
[evidence/pair-outcomes.csv](./evidence/pair-outcomes.csv),
[evidence/status-moves.md](./evidence/status-moves.md) (+ status-moves.csv, header-only),
[evidence/tkt148-observations.csv](./evidence/tkt148-observations.csv),
[evidence/spotcheck-output.txt](./evidence/spotcheck-output.txt),
[evidence/run/](./evidence/run/) (the exact SQL + scripts).

## Pending / gaps
Independent verifier pass (read-only SQL below) not yet run — the implementer must not
self-certify. Expected acceptance mapping: line 1 (historic blob rows carry sha256) →
check 1; line 2 (true duplicates deduplicated with audit; distinct photos untouched) →
checks 2–5 (note the "distinct" bucket is honestly empty — all 106 groups proved
byte-identical; see changes.md).

## How to re-verify (read-only, as csadmin)
```sql
-- 1. acceptance line 1: no blob-lane row lacks sha256 (expect 0 / 3186+ / 3186+)
SELECT count(*) FILTER (WHERE sha256 IS NULL) AS null_sha, count(*) AS blob_total
  FROM evidence WHERE storage_path IS NOT NULL;

-- 2. no active same-name same-hash blob image pair remains (expect 0)
SELECT count(*) FROM (
  SELECT case_id, file_name, sha256 FROM evidence
   WHERE storage_path IS NOT NULL AND excluded = false AND kind_code = 100000000
     AND sha256 IS NOT NULL
   GROUP BY 1,2,3 HAVING count(*) >= 2) x;

-- 3. the collapse is audited: exactly 3 duplicate_dropped rows by this actor,
--    duplicate_rows 70+36+2 = 108 (expect 3 rows at occurred_at 2026-07-10 14:08:32.593907+00)
SELECT case_id, name, before FROM audit_event
 WHERE actor = 'tkt144-blob-sha256-backfill' AND action_code = 100000005;

-- 4. twin shape: 108 rows excluded by this run, reason naming a LIVE survivor
--    (expect 108 / 108 / 0)
SELECT count(*) AS twins,
       count(*) FILTER (WHERE excluded AND NOT accepted_for_eva) AS soft_merged,
       count(*) FILTER (WHERE s.id IS NULL OR s.excluded) AS bad_survivor_refs
  FROM evidence e
  LEFT JOIN evidence s
    ON s.id = substring(e.exclusion_reason FROM 'kept once as ([0-9a-f-]{36})')::uuid
 WHERE e.exclusion_reason LIKE '%TKT-144 sha256 backfill%';

-- 5. no status move by this run (expect 0), statuses of the 3 affected cases unchanged
SELECT count(*) FROM audit_event
 WHERE actor = 'tkt144-blob-sha256-backfill' AND action_code = 100000013;

-- 6. stamped-split forensics (expect 586 = 477 stamped + 108 twins + 1 absorb)
SELECT count(*) FROM evidence
 WHERE storage_path IS NOT NULL
   AND updated_at = TIMESTAMPTZ '2026-07-10 14:08:32.593907+00';
```
Optionally re-run `evidence/run/spotcheck.py` (read-only SAS) to re-prove byte identity
of sampled collapsed groups, and diff any touched row against
`evidence/backup-before.csv`. Firewall check after any window:
`az postgres flexible-server firewall-rule list -g rg-collisionspike-dev --name cespk-pg-dev -o table`
→ only `AllowAzureServices`.
