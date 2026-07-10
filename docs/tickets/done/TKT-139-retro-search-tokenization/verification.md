# Verification — TKT-139: Retro Outlook $search misses spaced-ref variants (Graph tokenization: PHA5007 vs PHA 5007)

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below; orchestrator
data-pass W1 results appended). The live proof this ticket was waiting for was captured by the
TKT-140 dry-run (2026-07-10): docs/tickets/now/TKT-140-retro-backlog-drain/evidence/tkt139-search-pair.json.

## Evidence
- Offline: `retro-envelope.test.ts` `refSearchVariants` suite pins both measured miss
  directions (compact→spaced and spaced→compact) plus VRM/Case-PO shapes; orch suite 234
  passed. Deployed to `cespk-orch-dev` 2026-07-09 (71 functions re-verified).

## Pending / gaps
- Acceptance line 1 needs a LIVE drain or a recorded Graph query pair: a retro locate for
  a ref stored spaced, requested compact (or vice versa), returning the message via the
  variant union. No live Outlook mutation was made this wave (hard rule) — the proof
  rides the next natural retro drain (`POST /api/retro-case` keyed starter) or a
  verifier-run read-only query pair.

## How to re-verify
Trigger the keyed retro drain for a known spaced-form ref citing it compact (e.g. the
PHA5007 family) and check the `retroOutlookLocate` App Insights event (`found: true`,
`matchedKey`) on the orch component; or record the two raw `$search` responses
(compact + spaced) showing the union covers what the single form missed.

---

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

### Evidence
**Acceptance line 1 — "A ref stored spaced is located by a compact-ref retro request (and vice
versa) — proven by a live drain or a recorded Graph query pair":**
- The acceptance's named proof form exists and is genuine:
  `docs/tickets/now/TKT-140-retro-backlog-drain/evidence/tkt139-search-pair.json` (captured
  2026-07-10T09:26:34Z, read-only, intake app client-credentials token). Same ref, same whole mailbox
  (engineers@): compact "PHA5007" → 0 hits; spaced "PHA 5007" → 2 hits (raw Graph responses verbatim;
  subjects `RE: Our ref: PHA 5007 - Reg: MT25 FXW`, 2026-05-20 + 2026-07-08, both hasAttachments true).
  The measured tokenization miss live, and the union recovering it: `refSearchVariants('PHA5007')` →
  `['PHA5007','PHA 5007']`.
- Call shape provably the live rung's (verifier's independent cross-check): `graph.ts:371`
  `searchMessages` builds exactly `GET /users/{mbx}/messages?$search=<phrase>&$select=id,subject,receivedDateTime,from,hasAttachments&$top=25`,
  `kqlPhrase` (graph.ts:347) wraps in double quotes — matching the artifact's searchPhrase values
  character-for-character. The rung `retroOutlookLocate` (retro-case.ts:954-1012) loops mailbox ×
  refSearchVariants (line 974), unions deduped by (mailbox, message id), per-variant failures
  warn+continue.
- Deployed + enabled + executing: `deploy/orch/main.cjs` contains refSearchVariants (grep count 2);
  registry shows RETRO_CASE_ENABLED=true + RETRO_OUTLOOK_SEARCH_ENABLED=true and engineers@ in the
  mailbox set. Verifier's own KQL: 2026-07-10T12:45:41Z `Executed 'Functions.retroOutlookLocate'
  (Succeeded, 135ms)` emitting `{"evt":"retroOutlookLocate","found":true,"mailbox":"desk@…",
  "matchedKey":"external_ref","candidates":1}` — the post-TKT-139 bundle running the variant-union
  loop in production today.
- Scale corroboration (dryrun-summary.md): 149 refSearchVariants strings across 88 keys, 0 errors;
  10 probed keys hit only via a variant.

**Acceptance line 2 — "Variant generation unit-tested":**
- `orchestration/src/lib/retro-envelope.test.ts:141-170` — the 6-test refSearchVariants suite.
  Executed by the verifier today: `npx vitest run src/lib/retro-envelope.test.ts` → 20/20 passed.

### Pending / gaps
- The recorded pair captures ONE live direction (stored spaced, missed compact, recovered by the
  spaced variant). The literal vice-versa is pinned offline by the symmetric unit test and rides the
  identical union — the acceptance's proof clause ("a recorded Graph query pair") is satisfied as
  written.
- The pair was captured by a read-only replication of the rung's call, not emitted from inside a
  retroOutlookLocate execution; the rung's telemetry does not attribute hits per-variant — the queued
  TKT-140 drain will produce such locates naturally. The acceptance does NOT require persist-rung
  provenance.
- Adjacent observations for the loop (out of scope, already flagged): retro-deleted-probe still issues
  single-form $search in code (the dry-run driver expanded variants itself); the pair's hits return
  Exchange-DN `from` addresses that selectOutlookOriginal's SMTP own-mailbox filter would not drop
  (follow-up candidate).

### Confidence + unread surfaces
High. Pair authenticity anchored by four independent cross-checks (source call-shape match,
deployed-bundle grep, live App Insights execution, offline test run) plus the registry. Unread: live
Postgres this pass (queued, corroborative only); the durable instance input for the 12:45:41Z locate
(App Insights redacts activity output — immaterial).

## Orchestrator data-pass W1 (2026-07-10, batched transient-FW window, trap-deleted — only AllowAzureServices remains)

- **(a) PHA5007 Held case:** `87e79f62-0218-4bfc-8957-0c285536ad6e` — VRM MT25FXW, case_ref PHA5007,
  case_po NULL (never minted), status 100000002, on_hold=t, source engineers@. ✓ (the earlier drain's
  Held case, exactly the TKT-119/140 semantics)
- **(b) audit trail:** `2026-07-09 04:36:35Z — Case reconstructed retroactively (outlook): MT25FXW ·
  RE: Our ref: PHA 5007 - Reg: MT25 FXW` on that case. ✓
