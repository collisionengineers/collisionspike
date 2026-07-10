# Changes — TKT-140: Bulk retro backlog drain — reconstitute historical un-cased emails from Deleted Items

## Status
Dry-run phase executed 2026-07-10 (read-only — NO writes: no `retro-case` calls, no Graph
writes, no mailbox mutations, no Postgres writes, no deploys/app-setting changes). Acceptance
line 1 (dry-run report with per-rung outcomes) delivered; acceptance line 2 (the
operator-approved drain) is deliberately NOT run this phase — it awaits operator review of
[evidence/dryrun-summary.md](./evidence/dryrun-summary.md).

## What was run

1. **Backlog enumeration (Postgres, one read-only window)** —
   [evidence/enumeration.sql](./evidence/enumeration.sql) via WSL psql as Entra admin
   `digital@` → `SET ROLE csadmin` (SELECT-only), behind a transient firewall rule created and
   trap-deleted in the same script (verified: only `AllowAzureServices` remains). Key semantics
   mirror the live ladder — `decideRetro` (packages/domain/src/domain/retro-case.ts) for
   eligibility + key derivation, `findExistingCases` (api/src/functions/internal-retro.ts) for
   the rung-1 existence flags. Outputs: enum-context.txt, enum-backlog-rows.csv (118 rows),
   enum-backlog-keys.csv (109 key/kind pairs → 107 distinct strings), enum-retro-audit-history.csv.
2. **Probe drive (read-only Graph via the deployed route)** —
   [evidence/drive-probe.mjs](./evidence/drive-probe.mjs) drove
   `POST /api/retro-deleted-probe` (cespk-orch-dev, function-keyed; key sourced via
   `az functionapp keys list` into a scratchpad file outside the repo and deleted after the
   run) over all 88 un-cased keys expanded to 149 `refSearchVariants` strings — 15 paged calls
   (≤10 variants/call), 1.5s pacing, 429/5xx backoff, >5% error-rate abort armed. 0 errors.
   Outputs: probe-raw.jsonl, probe-run-log.txt, probe-summary.json.
3. **TKT-139 live proof capture** — one raw Graph `$search` response PAIR (compact `"PHA5007"`
   = 0 hits vs spaced `"PHA 5007"` = 2 hits, engineers@, call shape identical to
   `retroOutlookLocate`) via a direct read-only Graph call with the intake app's
   client-credentials token (tenant/client from app settings; secret read from Key Vault into a
   shell variable only — never echoed, never written): [evidence/tkt139-search-pair.json](./evidence/tkt139-search-pair.json).
4. **Deliverables** — [evidence/dryrun-ledger.jsonl](./evidence/dryrun-ledger.jsonl) (107 rows,
   one per key: kind, mailboxes, per-rung outcome, locatable, would-mint, highNoise,
   recommendedForDrain) + [evidence/dryrun-summary.md](./evidence/dryrun-summary.md) (the
   operator go/no-go report).

## Headline numbers

118 eligible un-cased rows → 107 distinct keys; 19 would LINK at rung 1; 88 probed; **75
locatable (85.2%)** of which 62 trustworthy + 13 high-noise junk keys (the big finding — a
blind drain would mint from unrelated mail; exclude them); 13 unlocatable (7 have
Deleted-Items-only hits — a whole-mailbox `$search` margin gap); error rate 0.0%. Go/no-go
criteria all satisfied (would-mint 75 ≤ 500; mint guards evidenced incl. a live
`refused_category` audit). Recommended drain: 99 rows, batches of 10, sequential-within-batch.

## Files touched

- evidence/: enumeration.sql, enum-context.txt, enum-backlog-rows.csv, enum-backlog-keys.csv,
  enum-retro-audit-history.csv, drive-probe.mjs, probe-raw.jsonl, probe-run-log.txt,
  probe-summary.json, dryrun-ledger.jsonl, dryrun-summary.md, tkt139-search-pair.json
- changes.md (this file), verification.md (evidence/gaps notes only — verdict stays PENDING)
- No product source, DDL, app-setting, or live-state change of any kind.

## Follow-up candidates surfaced (not acted on)

Junk-key sniff hygiene / drain denylist; a `deleteditems`-scoped fallback search in
`retroOutlookLocate` (7 keys' material visible only there); own-sender filter misses
Exchange-DN `from` forms; arrival-time retro races the search index (delayed retry). Detail:
dryrun-summary.md §Anomalies.
