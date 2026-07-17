# TKT-230 — changes

## Code

- `services/data-api/src/features/inbound/persistence.ts` (item 4)
  - Exported pinned `INBOUND_ATTENTION_CLEAR_ON_LINK_SQL` (CASE: clear exactly on the
    unlinked→linked transition, else preserve).
  - Emitted into the ON CONFLICT SET **only when** `tableColumns('inbound_email')` contains
    `attention_reason` (schema-tolerance — the column is not in the INSERT list; an older DB
    would 500 the whole upsert and silently drop primary-intake triage rows).
  - The TKT-226 `INBOUND_SUBTYPE_PAIR_REFRESH_SQL` CASE and the human-mode freeze are
    byte-identical (pinned by test).
- `services/data-api/src/features/evidence/internal-persist-routes.ts` (item 4 hardening)
  - `internalInboundAttention` adds `AND case_id IS NULL` to the UPDATE for
    `reason='unable_to_locate'` ONLY.
- `services/orchestration/src/workflows/retro/retro-activities.ts` (items 5, 6)
  - `retroFindTrigger`: probes the stored mailbox first, then every other configured intake
    mailbox (case-insensitive dedup), per-mailbox try/catch salvage; additive `mailbox` return
    field; found:false logs `mailboxesTried`.
  - NEW activity `retroCaseFolderWritable`: gate reads inside (retroCase + boxApi +
    boxFolderAtIntake — the boxArchiveEvidence pair); `dataApi.getCaseBoxFolder` → folder id;
    no RO roots configured → writable; otherwise facade `box.getFolder` `path_collection`
    ancestry vs `archiveRootIds()`; fail-closed `folder_unreadable` on any read failure.
- `services/orchestration/src/workflows/retro/retro-case.ts` (items 6, 7)
  - Rung-1 branch: after `statusEvaluate`, inside the existing best-effort try, checkpointed
    `retroCaseFolderWritable` probe; `boxArchiveEvidence` (idempotent) scheduled only on
    `writable: true`. The G7 comment updated: D8 now extends to rung 1 via the probe.
  - Item 7: both eligibility early-returns (`!decision.attempt` drain path; `no_usable_key`)
    schedule best-effort `retroRecordFailure` (`rungsTried: ['eligibility']`) ONLY for
    `receiving_work`; a stamp failure never alters the `not_eligible` outcome.
- `database/operations/tkt230-clear-stale-unable-to-locate.sql` — NEW documented operator
  procedure, two sections (item 4 clear expected 12; item 7 surface expected 21) with pre/post
  checks, csadmin wrapper, BEGIN/COMMIT, receiving_work code resolved from
  `choice_inbound_category`. **Created only — never executed by this implementation.**

## Tests

- `persistence.test.ts`: pins the fragment SQL; behavioural presence (column present) /
  absence (older DB) via mocked `tableColumns` + captured upsert SQL; asserts the TKT-226
  pair-refresh CASE and human freeze are undisturbed.
- `internal-persist-routes.test.ts` (TKT-230 describe): the UPDATE carries
  `AND case_id IS NULL` for unable_to_locate and NOT for images_no_match.
- NEW `retro-activities.test.ts`: retroFindTrigger (stored-first order, second-mailbox hit
  returns that mailbox's resource, throwing mailbox skipped, all-miss → found:false, gate
  refusal); retroCaseFolderWritable full matrix (gate refusals, folder-unreadable fail-closed,
  no_folder, no-RO-roots fast path without a Box call, folder IS an RO root, RO-root ancestor,
  RW subtree, Box read failure fail-closed).
- NEW `retro-case-postsweep.test.ts` (generator walks): rung-1 schedules the probe after
  statusEvaluate and mirrors only on writable:true; writable:false skips the mirror; a faulted
  probe or mirror is salvaged (outcome `linked` unchanged); attachment-less trigger unchanged;
  item 7 — receiving_work not_eligible schedules retroRecordFailure (drain and keyless forms),
  a failed stamp never alters the outcome, non-receiving_work stays silent.

## Deviations from the plan (recorded)

1. **Item 7 ops SQL NULL-tolerance**: the plan's `triage_state NOT IN ('actioned','dismissed')`
   silently excludes `triage_state IS NULL` rows (NULL NOT IN → NULL). NULL maps to 'new' in
   the triage views, so the file uses
   `(triage_state IS NULL OR triage_state NOT IN ('actioned','dismissed'))`.
2. **Item 6 adapter names**: the plan flagged `dataApi.getCaseBoxFolder` / `box.getFolder` as
   guesses — both verified to exist with exactly those names and shapes; used unchanged (no
   new adapter call was needed in `services/orchestration/src/adapters/data-api.ts`).
3. The probe logs a structured `retroCaseFolderWritable` trace on the ancestry decision
   (additive observability; not in the plan's snippet).
