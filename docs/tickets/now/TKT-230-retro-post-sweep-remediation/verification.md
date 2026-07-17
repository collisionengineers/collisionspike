# TKT-230 — verification

## Pre-deploy (offline, run 2026-07-17 on the branch)

- data-api vitest (targeted 4-file run incl. `persistence.test.ts` and the TKT-230 describe in
  `internal-persist-routes.test.ts`): **52/52 passed**.
- orchestration vitest (`src/workflows/retro`, incl. NEW `retro-activities.test.ts` and
  `retro-case-postsweep.test.ts` plus the pre-existing provider-recovery / related-ingest /
  envelope suites proving no regression): **55/55 passed across 5 files**.
- `npm run build` (tsc -b) clean for both `services/data-api` and `services/orchestration`.
- Operational SQL created only — NOT executed (live mutation requires separate operator
  authorization; deploy-order step 5).

## Post-deploy probes (operator; bank outputs here)

- **Item 4 (stamps)** — run
  `database/operations/tkt230-clear-stale-unable-to-locate.sql` section 1 (pre expected 12 →
  post 0), bank both counts here. Then after the NEXT retro wave:

  ```sql
  SELECT count(*) FROM inbound_email
   WHERE case_id IS NOT NULL AND attention_reason = 'unable_to_locate';
  ```

  → STILL 0 (the upsert clear + attention-stamp guard hold).

- **Item 5 (multi-mailbox)** — force-relaunch a sample of the 61 `trigger_not_found` rows
  (TKT-223 `force=true` lever); record the found-rate delta here. Orchestration KQL (same-day):
  `traces | where message has "retroFindTrigger"` → per-mailbox probe warnings + the
  `mailboxesTried` count on residual misses. Residue → the retro-deleted-probe follow-up.

- **Item 6 (rung-1 mirror)** — next rung-1 link on a writable-folder case: the trigger's
  evidence rows gain `box_file_id`; the SPA "Not archived" indicator is gone; SWAN26007
  re-checked and its evidence mirrored. KQL: `traces | where message has
  "retroCaseFolderWritable"` shows the checkpointed decision; a case under the RO roots logs
  `readonly_archive_root` and is untouched.

- **Item 7 (surfacing)** — run the ops SQL section 2 (pre expected 21 → post 0 unsurfaced;
  cross-check count = pre count), bank the counts. SPA: the rows show the "Unable to locate"
  chip. Then drain one NEW receiving_work-classified trigger and confirm the chip appears via
  the orchestrator guard (audit `retro_reconstruction_failed` with
  `rungsTried: ['eligibility']`).

## Acceptance mapping

| Acceptance | Evidence |
|---|---|
| 1 stamps cleared + stay cleared | persistence tests; ops SQL section-1 counts; post-wave count 0 |
| 2 multi-mailbox found-rate | retro-activities tests; force-relaunch sample delta |
| 3 rung-1 writable mirror | activity matrix + generator walks; SWAN26007 re-check |
| 4 receiving_work visibility | generator walks; ops SQL section-2 counts; chip screenshot |
| 5 durable rules hold | generator walks (checkpointed probe, salvage paths); code review of gate placement |

## Live proof — 2026-07-17 ~05:00–05:30Z (post-deploy)
- **Operational SQL executed** (separately authorized, transient firewall rule):
  section 1 — stale stamps 12 → 0 (pre/post counts as scripted); section 2 —
  21 unsurfaced receiving_work instructions stamped (21 → 0 unsurfaced, 21 surfaced).
- **Multi-mailbox fallback proven on a 5-row sample** of the sweep's trigger_not_found
  pile (force re-drives): 1 `linked` (case 540108ca), 1 **`created` via a full Box-arm
  reconstruction** (case 91d1bbe3, source box_eml), 2 found-and-reclassified
  `receiving_work` (correctly refused auto-mint; now stamped by the new eligibility
  surfacing), 1 still `trigger_not_found`. KQL shows the fallback probing up to
  `mailboxesTried:3` with per-mailbox salvage. CAVEAT: the 5 CONCURRENT sample runs
  briefly tripped Graph `MailboxConcurrency` (429s salvaged as skipped probes — one
  not-found verdict is throttle-tainted); the full-pile re-drive runs SEQUENTIALLY
  (ledger: scratchpad redrive-tnf-ledger.jsonl, to be banked on completion).
- **retroCaseFolderWritable** ran live on the linked case (rung-1 mirror probe fired).
