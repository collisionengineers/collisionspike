# Verification — TKT-144: Resolve the 214 blob-lane same-name duplicate evidence rows via a sha256 backfill

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26, in two stages: (1) a full offline evidence-pack
audit — every count independently recomputed from the CSVs (691 backup rows = 477 null-sha ∪
288 pair-class; 477/477 hash outcomes with the 5 clock-skew reruns; 106 groups all
collapsed_same_hash, twins sum 108; scripts read line-by-line: one guarded transaction, abort
guards, never-overwrite stamp, backup-first); acceptance line 2's empty distinct bucket judged
SATISFIED as written (the mechanism genuinely distinguished — an explicit distinct_different_hash
outcome existed and reported none — and the vacuity itself is evidenced by the byte spot-check);
commit 729940a confirmed all-ticket-folder (no code delta, no deploy). Then (2) the orchestrator W2
data pass returned every queued value exactly, and the verifier issued the final verdict:

> **VERIFIED-LIVE** — all six W2 results match the expected column exactly; acceptance line 1
> (null_sha 0 across the whole blob lane, now 3,434 rows with intake stamping sha at write) and
> line 2 (0 active same-name same-hash groups; 3 audits with before 70/36/2 at
> T=2026-07-10 14:08:32.593907+00; 108/108 twins soft-merged; 0 status moves; 586 rows at T exact)
> are both proven live, with the empty distinct bucket evidenced rather than assumed.
> Caveat: closing TKT-144 should not drop the disclosed out-of-scope discovery — the 132 active
> same-case same-hash **different-name** blob buckets (rename-duplicate class) still need their own
> follow-up ticket.

## Orchestrator data-pass W2 (run 2026-07-10, transient window trap-deleted)
1. null_sha **0** / blob_total **3,434** ✓ · 2. dup groups **0** ✓ · 3. **3 audits**, before
duplicate_rows **2/36/70**, occurred_at 2026-07-10 14:08:32.593907+00 ✓ · 4. twins **108** /
soft_merged **108** ✓ · 5. status_changed audits **0** ✓ · 6. rows at run timestamp **586** ✓

## Evidence (implementer artifacts, audited)
[evidence/backup-before.csv](./evidence/backup-before.csv),
[evidence/hash-run-log.csv](./evidence/hash-run-log.csv),
[evidence/pair-outcomes.csv](./evidence/pair-outcomes.csv),
[evidence/status-moves.md](./evidence/status-moves.md) (+ status-moves.csv, header-only),
[evidence/tkt148-observations.csv](./evidence/tkt148-observations.csv),
[evidence/spotcheck-output.txt](./evidence/spotcheck-output.txt),
[evidence/run/](./evidence/run) (the exact SQL + scripts).

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
