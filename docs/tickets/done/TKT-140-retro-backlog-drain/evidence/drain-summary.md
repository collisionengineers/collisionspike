# TKT-140 drain summary — operator-authorized backlog drain (executed)

**Executed:** 2026-07-10 15:28–15:50Z (pilot batch 15:28–15:30, full run to 15:50) ·
**Authorization:** operator pre-authorized 2026-07-10 conditional on the dry-run go/no-go
criteria, all of which were met ([dryrun-summary.md](./dryrun-summary.md)).
**Mechanism:** the EXISTING keyed `POST /api/retro-case` starter only
([drive-drain.mjs](./drive-drain.mjs)) — the server-side ladder ran with all mint guards; no
new code, no deploys, no app-setting changes. **No mailbox mutations** (the ladder's Graph use
is read-only: id-lookup, `$search`, message fetch; persistence is Postgres/Blob only).
Pre-flight verified live before starting: `retro-case-start` deployed, `RETRO_CASE_ENABLED=true`
on BOTH apps, `RETRO_OUTLOOK_SEARCH_ENABLED=true` on orch.

## The numbers

| Measure | Value |
|---|---|
| Scope | **99 drainable rows** of the 118 enumerated (12 junk-only + 6 unlocatable-only + 1 mixed **withheld**, per the dry-run recommendation) |
| Batches | 10 × ≤10 rows, **sequential within batch** (terminal-status await), ~5s between starts; pilot batch reviewed before continuing |
| **Errors** | **0 / 99 (0.0%)** — no batch approached the 10% breaker; avg 8s/row, max 26s |
| **Held cases minted** (`created`) | **34** — every one `on_hold=true`, `case_po=NULL` |
| **Linked to existing case** (`linked` + `already_exists_linked`) | **30 + 7 = 37** |
| **Unable to locate** (`no_source`) | **6** — all 6 rows verified stamped `attention_reason='unable_to_locate'` |
| `not_eligible` at live re-classify | 3 (2 × `category_not_eligible:other`, 1 × `no_usable_key` — honest refusals) |
| `trigger_not_found` | **19** (trigger email no longer resolvable by `internetMessageId` in its recorded mailbox) |
| Distinct cases touched | 47 |

Row-level ledger: [drain-ledger.jsonl](./drain-ledger.jsonl) (99 rows: inbound id, message id,
mailbox, keys, instance id, runtime status, outcome, caseId/casePo, duration; durable
management URLs deliberately excluded — they embed a system key).

## Before / after un-cased backlog (read-only admin windows, rules trap-deleted — verified only `AllowAzureServices` remains)

| Measure | Before (dry-run window, 09:24Z) | After (16:0xZ) |
|---|---|---|
| `inbound_email` total | 867 | 988 (live intake ran concurrently) |
| Un-cased (`case_id IS NULL`) | 281 | **218** |
| The 118 enumerated rows linked to a case | 0 (by construction) | **71** (= 34 created + 30 linked + 7 already-exists) |
| Enumerated rows still un-cased | 118 | **47** = 19 withheld + 19 trigger_not_found + 3 not_eligible + 6 no_source |
| Enumerated rows stamped `unable_to_locate` | 3 (pre-existing) | 7 (6 drain no_source + 1 residual) |

Full transcript: [drain-after-context.txt](./drain-after-context.txt) (query source:
[drain-after.sql](./drain-after.sql), generated over the exact 118 enumerated row ids).

## Invariants verified live

1. **Held-only, no PO minted:** ALL 88 retro-channel cases (`intake_channel_kind_code=100000003`,
   includes pre-drain ones) have `on_hold=true` and `case_po IS NULL`; the 34 drain-window mints
   all landed `needs_review` (one advanced to `missing_images` by the post-create
   `statusEvaluate` recompute — `on_hold` retained; expected behaviour).
2. **Mint guard fired IN the drain:** two new `"Retro create refused — the located original is a
   'other' email, which never opens a case"` audits at **15:33:36Z** and **15:40:34Z** — the
   ladder located an original, the API refused it as ack/digest-family, and the row fell
   through to the visible Unable-to-locate outcome (these are among the 6 `no_source`).
3. **Ack semantics (TKT-119):** ack-trigger rows LINKED (pilot row 10: `non_actionable/
   acknowledgement` → linked to the case minted from its sibling query row) — no ack became a
   case source.
4. **Idempotency/dedup:** same-key row pairs produced exactly one mint + links
   (SG75WZD, SM21ZKW, SL24YOE, and 7 `already_exists_linked`); the resume run re-ran nothing
   (10 pilot rows skipped from the ledger).
5. **Unable-to-locate is visible:** 6/6 `no_source` rows stamped (TKT-119c path).

## Anomalies (report-only)

1. **`trigger_not_found` = 19 rows** — the enumerated trigger email could not be found by
   `internetMessageId` in its recorded source mailbox at drain time (likely purged/aged out of
   Deleted Items, or cross-mailbox delivery). These rows stay un-cased **and unstamped** (the
   ladder returns before the failure-record rung). Follow-up candidates: stamp an attention
   reason on this path too; fall back to searching all three intake mailboxes for the trigger id.
2. **Parser field quality on Held mints** (staff review will catch — all Held): VRM `JUL2026`
   (a date sniffed as a VRM) on the ENQ495023 mint; `EY12SSU` (parser) vs `YE12SSU` (trigger
   sniff) on 30144-01 — parser-confirmed wins by design but the discrepancy is worth staff eyes.
3. **Live re-classification drift:** 2 rows the enumeration held as retro-eligible (via
   persisted suggested category) re-classified `other` at drain time → honest `not_eligible`.
4. Some dry-run-locatable keys returned `no_source` at drain time (e.g. DF25LZE, WF69NDX) — a
   mix of the mint-guard refusals above, own-sent/uncorroborated picks, and `$search`
   result variance. All landed visibly.

## Checks for the verifier

1. Postgres (read-only window): re-run [drain-after.sql](./drain-after.sql) — expect
   retro-channel `on_hold=88+/88+`, `with_case_po=0`, enumerated-118 linkage ≥71, the 6
   `no_source` message ids stamped `unable_to_locate`.
2. Ledger cross-check: every `caseId` in [drain-ledger.jsonl](./drain-ledger.jsonl) exists in
   `case_` with `intake_channel_kind_code=100000003`, `on_hold=true`, `case_po IS NULL`.
3. App Insights (cespk-orch-dev component): `retroCaseOrchestrator` instances in
   15:28–15:50Z ≈ 89 startNew (+10 pilot), zero `Failed`; `retroCreatePersist` outcomes match.
4. Audit trail: `retro_case_created` last-12h ≥ 34 + `retro_case_linked` ≥ 37 events; the two
   15:33/15:40Z refusal audits present.
5. SPA spot-check: minted case `eca2f519…` (`ap.qdos261420`) shows Held/needs_review with its
   triage email linked; the 6 no_source inbox rows show the "Unable to locate" chip.

## No mailbox mutations — assertion

The drain exercised: `$filter` id lookup, whole-mailbox `$search`, message/attachment GETs
(Exchange-RBAC `Mail.Read` scope — the app holds no mailbox write grant on this path), and
Postgres/Blob writes via the Data API. Zero Graph POST/PATCH/DELETE against any mailbox. The
`OUTLOOK_MOVE` lane is not on the retro path.
