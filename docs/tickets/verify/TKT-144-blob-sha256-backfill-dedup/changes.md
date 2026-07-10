# Changes — TKT-144: Resolve the 214 blob-lane same-name duplicate evidence rows via a sha256 backfill

## Status
EXECUTED LIVE (2026-07-10) — all 477 null-sha blob rows hashed + stamped (blob lane now
0 null of 3,186), all 106 same-name groups proved byte-identical and collapsed (108 twins
soft-merged across 3 cases, audited), 0 status moves. Verification transcription PENDING.

## What ran (data-only — NO deploys, NO api/orch code changes)

Three transient Postgres windows (WSL Entra-admin `digital@` + `SET ROLE csadmin`,
per-window firewall rule trap-deleted — only `AllowAzureServices` remained after each;
verified in every window's output) plus a read-only blob-hashing phase between them.
Exact artifacts: [evidence/run/](./evidence/run) — `read-window.sql`,
`write-window.sql` (one transaction), `confirm-window.sql`, `window-runner.sh`,
`hash.py`, `spotcheck.py`.

1. **Enumerate + backup first** (`read-window.sql`, read-only): enumerated ALL historic
   blob-lane rows lacking sha256 — **477** (any kind, active + excluded; 1.24 GiB,
   max 31 MiB, none over the 100 MiB cap) — and the same-name class: image-kind active
   blob rows sharing (case_id, file_name) = **214 rows / 106 groups / 110 pairs**
   (exactly TKT-133's recorded 214; the any-kind variant is 288 rows and was backed up
   too). Full-row backups BEFORE any write:
   [backup-before.csv](./evidence/backup-before.csv) (691 rows = 477 ∪ 288) +
   [backup-case-status-before.csv](./evidence/backup-case-status-before.csv) (all 464
   non-terminal cases). Also captured the TKT-133 live audit/exclusion wording to mirror.
2. **Hash** (`hash.py`, read-only): streamed every worklist blob from
   `cespkevidstdev01/evidence` via a read-only **user-delegation SAS** (`--as-user`,
   `--permissions r`) and computed sha256 (lowercase hex, the api `SHA256_HEX_RE` shape),
   throttled, skip-and-record semantics. Self-test first: 3 rows that already carried
   sha256 re-hashed → all matched stored values exactly. **477/477 hashed; 0 missing,
   0 oversized.** (Incident: the first 5 requests 403'd — user-delegation key start-time
   clock skew, `AuthenticationFailed … Key start [14:05:45] … Current [14:05:43]`;
   re-minted with a back-dated `--start` and re-hashed clean; per-blob outcomes incl.
   the rerun notes in [hash-run-log.csv](./evidence/hash-run-log.csv).)
3. **Stamp** (`write-window.sql` §2, one txn with everything below): guarded update,
   never overwriting, only rows in the committed backup —
   ```sql
   UPDATE evidence e SET sha256 = s.sha256, updated_at = now()
     FROM (stage_hash h JOIN stage_backup b ON b.id = h.id) s
    WHERE e.id = s.id AND e.sha256 IS NULL;   -- lower(hex); outcome='hashed' only
   ```
   plus two abort guards (malformed hex; computed hash disagreeing with any
   between-window live stamp) — **477 stamped, 0 between-window equal-stamps,
   0 overwrites; blob-lane null-sha after: 0.**
4. **Dedup the pairs** (§3–§7): the class re-derived AT WRITE TIME restricted to
   backed-up rows (post-enumeration arrivals: **0**) — still 214 rows/106 groups, 0
   unhashed. Byte-hash equality ONLY, bucketed by (case_id, file_name, sha256):
   **every one of the 106 groups was byte-identical** → survivor = earliest
   `created_at` (tie: id), twins soft-merged per the TKT-133 pattern —
   ```sql
   UPDATE evidence e SET excluded = true, accepted_for_eva = false,
          exclusion_reason = 'Duplicate of this case''s copy of the same photo '
            || '(byte-identical; kept once as ' || t.survivor_id || ') — TKT-144 sha256 backfill',
          updated_at = now()
     FROM twins t WHERE e.id = t.twin_id AND e.excluded = false;
   ```
   **108 twins excluded** (106 groups; 2 were triples) across **3 cases** — PCH26009
   (70), PCH26013 (36), one PO-less needs_review case (2). Guarded provenance absorb
   onto survivors where absent: box ids 0, registration_visible 0, image_role
   (unknown→known) 1. One `duplicate_dropped` (100000005) audit_event per affected
   case, actor `tkt144-blob-sha256-backfill`, TKT-133's before/after shape. Per-group
   outcomes: [pair-outcomes.csv](./evidence/pair-outcomes.csv) — 106 ×
   `collapsed_same_hash`, **0 distinct-hash groups, 0 unhashable skips** (the
   "genuinely distinct photos" bucket is honestly EMPTY: every same-name pair proved a
   true byte duplicate).
5. **Status re-evaluation** (§8): the recorded `statusForReviewCase` SQL-parity tree
   (terminals incl. `done` excluded) over the 3 affected cases, audited-if-moved —
   **0 moves** ([status-moves.md](./evidence/status-moves.md); no case regressed, no
   readiness had depended on a duplicate). **TKT-148 observed, not minted**: no
   affected case newly qualifies ([tkt148-observations.csv](./evidence/tkt148-observations.csv)).
6. **Post-verification**: byte-level spot-check of 6 collapsed groups (12 blob
   downloads, survivor + twin from DIFFERENT message folders) — all byte-identical,
   all stored hashes match actual bytes ([spotcheck-output.txt](./evidence/spotcheck-output.txt));
   confirmation window re-proved all 477 worklist rows carry exactly the computed hash
   and pinned the stamped split via the txn timestamp (586 blob rows at
   T=2026-07-10 14:08:32.593907Z = 477 stamped + 108 twins + 1 absorb survivor).

## THE NUMBERS
| metric | value |
|---|---|
| null-sha blob rows found (enumerated) | 477 |
| blobs hashed / missing / oversized | 477 / 0 / 0 |
| rows stamped (never-overwrite; between-window equal-stamps) | 477 (0) |
| blob-lane sha coverage after | 3,186 of 3,186 (0 null) |
| same-name class at write time (rows / groups / pairs) | 214 / 106 / 110 |
| groups collapsed as byte-identical | 106 (all) |
| twin rows soft-merged (excluded) | 108 across 3 cases |
| same-name pairs genuinely distinct (untouched) | 0 |
| unhashable skips in the pair set | 0 |
| provenance absorbs onto survivors (box / reg-visible / role) | 0 / 0 / 1 |
| `duplicate_dropped` audits | 3 (one per affected case) |
| status moves (audited) | 0 |
| active same-name same-hash blob image pairs remaining | 0 |

## Honest findings & remainder

- **The 214-row class was ALREADY fully hashed at enumeration** — all 214 are
  PDF-**extracted** images (`…_img_N_M.jpeg` naming; the extraction lane always stamped
  sha256), so the backfill (477 rows: email attachments, raw `.eml`, instructions,
  engineer reports…) and the dedup keyed on disjoint row sets. The backfill's value is
  acceptance line 1 + the TKT-140 re-delivery shield across the WHOLE blob lane; the
  collapse keyed on the extraction lane's stored hashes, byte-verified by spot-check.
- **Audit/exclusion wording** says "the same photo was attached more than once by
  email" — for these rows the mechanism was the same *document* re-attached across
  emails and its images extracted twice; kept staff-plain, wording mirrors TKT-133.
- **Discovery (untouched, out of scope — name-keyed dedup only):** 132 active
  same-case same-hash buckets under DIFFERENT filenames exist among blob rows (the
  rename-duplicate class; 304 counting all lanes/kinds) — follow-up ticket candidate.
  Sample: 40-bucket export retained off-repo in the run scratchpad.
- **TKT-133 indirect live evidence** (its pending twin-collapse proof, from this run's
  vantage): (a) **no pair had been linked by the live write-time path since
  2026-07-09** — all 108 twins still co-existed until this collapse
  (between-window equal-stamps = 0); (b) among ACTIVE same-case same-sha buckets on
  rows created after 2026-07-09 12:00Z there are 185, **but 0 whose rows were created
  on 2026-07-10** (the day the TKT-133 api dedup deployed, D2) — i.e. no new
  same-case same-sha duplicate has formed since the write-time dedup went live,
  while intake demonstrably ran today (13:40–13:44Z recompute audits). Suggestive,
  not a substitute for the direct email+Box mirror proof TKT-133 still awaits.
- All three Postgres windows were transient and trap-deleted; each window's output
  shows only `AllowAzureServices` remaining. No Box mutations; no secrets touched
  (the SAS was read-only, short-lived, never persisted).
