# Verification — TKT-087: Box report 409 upload conflicts - investigate duplicate archive attempts

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26. Key findings of the certification pass:
- **Line 1 (18/18 attribution):** independently corroborated in App Insights retention — the
  2026-07-03 window shows exactly 17 Box 409s + 17 old blind-reuse traces; the 18th is the ae1c0c84
  worker-death anomaly exactly as the table states.
- **Line 2 (409-as-already-exists + tests):** 30 box-webhook tests + 7 evidence-names tests re-run
  green; the old blind-reuse trace string is EXTINCT from 2026-07-09; post-fix lanes observed live
  (07-09: 4 content-match reuses + 4 sha1-mismatch disambiguated re-uploads; 07-10: 1+1), all 10
  joined facade requests resultCode 200 (no 409 ever surfaced to a caller); 409 rate collapsed
  8→2/day vs 15–48/day pre-fix. Box-side product verified by keyed read-only listing: per-message
  `message-<8hex>.eml`/`email-body-<8hex>.txt` names and the `-<sha1:8>` disambiguated .DOC trio.
- **Line 3 (written verdict):** stands below verbatim; the large-payload 502 casualty spun off to
  TKT-142 (now done, VERIFIED-LIVE — ae1c0c84 archive repaired 4/4, linkage proven by its W2 SQL).
- **Queued for the next data pass (formality, with reopen conditions):** Q-087-1 mis-link census
  (re-derives the BOARD's "191" figure, which has no repo source artifact); Q-087-2 fix-holding
  check (reopen if post-07-09 shared box_file_ids appear beyond deliberate TKT-133 merge links);
  Q-087-3 per-message rows distinctness; Q-087-4 attribution-case listing → drives the
  **prior-mis-link backfill decision, still to record** (the pre-fix mis-link class is
  prior data debt; a re-archive self-heals a case when it re-runs — observed live on
  QDOS26029).
- Watch-item (outside this ticket, already logged under TKT-142): sporadic per-file upload 502s
  (1 on 07-09, 5 on 07-10), warn-level per-file skips, no archive stranded 0/N.

## Investigation record (2026-07-09, read-only — azure-diagnostician dispatch)

**Verdict: neither benign-Durable-replay nor TKT-092 double-processing — a third cause.**
All 18 × 409 (2026-07-03) were first-run archive activities of *distinct, legitimate* emails
archiving into case folders that already held a file of the same name, because every email's raw
MIME + body text archived under the generic names `message.eml` / `email-body.txt`. Any case
receiving a second email (dedup rung-2 `attach` or `linkReply linked`) was guaranteed those 409s.
The facade absorbed each one as designed (info-level "reusing id"; no archive aborted by a 409) —
but the reuse **mis-linked** the later email's evidence row to the earlier email's Box file id.

### Attribution (18/18)
| Box 409 (UTC 2026-07-03) | Box folder | case | resolution path | note |
|---|---|---|---|---|
| 07:01:11 | 396158752565 | 291e0cf4-… | attach (info@) | 4/4 up, 1 reused |
| 07:01:12 | 396177433597 | 0406b99d-… | attach (info@) | second case, same minute |
| 08:15:34 | 396433091329 | 24ee37e0-… | attach (info@) | follow-up 4 min after create |
| 08:55:50 | 396446740112 | dc693f76-… | attach (info@) | follow-up 5 min after create |
| 08:55:50 | 396441966203 | 28a7e0a1-… | attach (info@) | lockstep pair |
| 09:33:29 | 395446962941 | c63d60d6-… | linkReply linked | reply into an older case |
| 12:46:06 | 396441932611 | f27ade87-… | attach (info@) | later same-ref email |
| 12:48:01 | 396113579607 | b349a269-… | linkReply linked | reply #1 on a busy case |
| 13:16:15 + 13:16:17 | 396129369498 | f6550b04-… | attach (engineers@) | eml + re-sent attachment both reused |
| 13:30:42 | 396135201155 | 571ea8bb-… | linkReply linked | 10/10 up, 1 reused |
| 13:54:08 + 13:54:10 | 396113579607 | b349a269-… | linkReply linked | reply #2 (eml + body reused) |
| **14:14:27** | 396125774315 | **ae1c0c84-…** | linkReply linked | **ANOMALY: facade 502 ×4 → archive `uploaded 0/4`, never re-archived (checked through 2026-07-07)** |
| 14:15:45 | 395806004941 | bdc46a75-… | attach (info@) | later email into old case |
| 14:23:29 + 14:23:30 | 396113579607 | b349a269-… | linkReply linked | reply #3 (eml + body reused) |
| 14:23:53 | 395456061240 | b1a25cc6-… | attach (info@) | body-only email into old case |

### TKT-092 hypothesis — not supported for these 18
- intake-starter absorbed 61 same-Graph-id re-notifications that day (instance-level dedup held);
- rung-1 payloadHash dedup demonstrably dropped one true redelivery at 12:31:26 (`resolution:"drop"`);
- the QCL duplicate GUIDs (d1d862bd/be1a0a11) appear nowhere in the day's orch telemetry; no
  caseResolve minted a duplicate case in the 409 windows.

### Severity/abort
Every 409 logged at severityLevel 1 (info, `box_client.py` "reusing id"); no archive aborted on a
409. The only warn rows are the 4 × `[boxArchive] upload failed … → 502` (14:14:24) — best-effort
per-file skip by design, which is what stranded `ae1c0c84`.

### KQL (App Insights `cespk-orch-dev` 7c7ea68a-…; box-webhook rows under `cespike-parser-ai-dev`, cloud_RoleName cespkbox-fn-v76a47)
- Archive scheduling/completions: `traces | where timestamp between (datetime(2026-07-03T06:45:00Z)..datetime(2026-07-03T14:45:00Z)) | where (message contains "boxArchiveEvidence (Activity)" and message contains "scheduled") or message contains '"evt":"boxArchiveEvidence"' or message contains "[boxArchive]"`
- 409 handling: `traces | where message contains "409" or message contains "reusing" or message contains "item_name_in_use"` (same window, parser-AI component)
- intake-starter duplicate absorption: `traces | where message contains "[intake-starter]"` (whole day)
- Facade requests: `requests | where cloud_RoleName startswith "cespkbox"` (same window)

## Acceptance mapping
- [x] Each of the 18 conflicts attributed to a case + file cluster with a stated cause (above).
- [x] Upload path treats 409 as "already exists" — NOW HARDENED: sha1-verified reuse; mismatch →
      content-disambiguated re-upload; unverifiable → warn-level earlier reuse. Unit tests green
      (`services/functions/box-webhook/tests/test_box_client.py`, 30 passed).
- [x] Written verdict: NOT benign-in-full — idempotency worked mechanically but the generic
      filenames (`message.eml`/`email-body.txt`) made "reuse" WRONG on multi-email cases
      (mis-linkage, later bytes never mirrored); duplication vector (TKT-092) ruled out for
      these 18. Fixed in this wave (per-message names + sha1-verified reuse).

## Pending / gaps
1. Deploy orch + box-webhook Function (dispatcher deploy phase).
2. Data proof: evidence rows for the conflicted files link a valid Box file — note the
   HONEST finding that pre-fix multi-email cases have `.eml`/body rows pointing at the FIRST
   email's file; backfill decision to record (re-archive levers exist).
3. `ae1c0c84` re-archive via keyed `POST /api/box-archive` + linkage check.
4. Post-fix live window: 409s only on genuine replays, absorbed as sha1-matched reuses.

## How to re-verify
- Re-run the KQL above over a post-deploy window; expect `sha1` "matching content; reusing id"
  info rows only for true replays, warn rows for any mismatch (should re-upload disambiguated).
- Postgres: for the 8 multi-email cases above, `SELECT file_name, box_file_id FROM evidence WHERE case_id IN (…) AND file_name LIKE 'message%'` — post-fix rows carry per-message names + distinct box_file_ids.

## Deploy + repair-attempt record — 2026-07-09 (verdict stays PENDING)

- orch + box-webhook DEPLOYED with the fix (per-message names live; sha1-verified 409 reuse live).
- `ae1c0c84` re-archive attempted via keyed `POST /api/box-archive` (durable instance
  `cf33e29a…`, Completed): **still `uploaded 0/4`** — all four uploads got facade **502s again**,
  reproducing the 2026-07-03 failure exactly. Root cause isolated from the traces: the case's raw
  `.eml` is **17.6 MB**, which as a base64 JSON body (~23 MB) kills the box-fn worker
  (first 502 = nginx, the rest = the recycling Functions host) — the small `email-body.txt`
  fails as collateral. NOT a 409/naming issue. **Follow-up ticket candidate:** box-fn upload route
  needs chunked/streaming upload (or a size cap + skip-with-warning) before this case's archive
  can be repaired.
- Post-fix live 409 window + the Postgres per-message-name spot-check remain to be gathered after
  the next organic multi-email case.
