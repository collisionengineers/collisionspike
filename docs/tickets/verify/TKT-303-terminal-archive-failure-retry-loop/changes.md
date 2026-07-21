# Changes — TKT-303

## Source

### `services/orchestration/src/adapters/functions-client.ts`

- Added `FocusedFnHttpError extends Error` carrying `status`. The message is **byte-identical** to
  the plain `Error` it replaces, so callers that regex the status out of the message
  (`boxDownloadFailure`, `blobDownloadFailure` in `box-classify-sweep.ts`, and the tests that
  construct `new Error('fn GET … → 413: …')` by hand) keep working untouched.
- Added `isTerminalUpstreamStatus(status)` — 4xx **except** 408 and 429 — and
  `isTerminalFnFailure(error)`.
- `includeBodyErrorMapper` now builds a `FocusedFnHttpError` instead of an `Error`.

### `services/orchestration/src/workflows/archive/box-folder-create.ts`

- Added `ArchiveLinkRefusal extends Error` and switched the four existing refusal throws to it:
  unpinned root (`assertPinnedTestArchiveRoot`), folder identity mismatch
  (`verifyFolderIdentity`), Archive-link-without-Case/PO, and both first-wins linkage conflicts.
  They still **throw**, so `ensureCaseArchiveFolder`'s refuse-loudly contract is unchanged and
  every pre-existing test passes without edit.
- Added `terminalArchiveFailure(error)` returning a `TerminalArchiveOutcome`
  (`{skipped: true, terminal: true, reason, detail}`) for an `ArchiveLinkRefusal` or a terminal
  facade status, and `null` for anything else.
- The `boxFolderCreate` **activity** now wraps `ensureCaseArchiveFolder` in try/catch and
  **returns** the terminal outcome rather than rethrowing. This is the fix: a returned value is
  recorded once in Durable history and replays deterministically, so neither the activity retry
  (3) nor the caller's sub-orchestrator retry (4) engages. Unclassified errors rethrow unchanged.

### `services/orchestration/src/workflows/archive/provider-archive-monitor.ts`

- The `boxFolderCreateOrchestrator` result is now captured and inspected. On `terminal`, the
  monitor logs, defers with `terminal: true`, and `continue`s — it never calls
  `providerArchiveOutboxComplete` for a terminal row.
- `providerArchiveOutboxDefer` activity input widened with optional `terminal`.

### `services/orchestration/src/adapters/provider-archive-api.ts`

- `defer()` takes an optional fourth `terminal` argument, sent only when true.

### `services/data-api/src/features/archive/provider-outbox-routes.ts`

- `internalProviderArchiveOutboxDefer` accepts `terminal` (strict `=== true`; any other value is
  a normal backoff defer). When set, `provider_archive_next_attempt_at` becomes
  `'infinity'::timestamptz`, which the pending slice's `next_attempt_at <= now()` filter excludes
  — the row is parked rather than re-listed forever. The row stays `pending` with its reason on
  `provider_archive_last_error`; `requestProviderArchive` resets `next_attempt_at = now()` and
  unparks it, so recovery needs no manual database edit. No migration: the column already exists.

## Tests

- `box-folder-create.test.ts` — new `terminalArchiveFailure` suite: the real scope-lock 400 string
  classifies terminal; `ArchiveLinkRefusal` classifies terminal; 500/502/503/408/429 and an
  unclassified transport fault stay retryable. Plus a case asserting refusals are raised as
  `ArchiveLinkRefusal` rather than a bare `Error`.
- `provider-archive-monitor.test.ts` — new case: a terminal outcome **returned** by the
  sub-orchestrator (not thrown) parks the row with `terminal: true` and never acknowledges
  completion.
- `provider-outbox-routes.test.ts` — existing backoff test updated for the new fourth query
  parameter; new cases for the infinity park and for `terminal: 'yes'` **not** parking.

Results: `@cs/orchestration` 656 passed (59 files), `@cs/api` 1115 passed (111 files). Both
services typecheck clean (`tsc -b --force`).

## Live operator fix (authorised, not a code change)

Case `13f1c47f-f337-48e7-8a2d-a43b3ff9e40e` (Case/PO `A.QDOS26229`) had `box_folder_id` pointing
at live-archive folder `401801654393`. Cleared to NULL with the attempt counter reset at
2026-07-21 21:01Z so the deployed create branch mints a fresh folder under the pinned test root.
Statement, before-state, and after-state are recorded in
[evidence/diagnosis-2026-07-21.md](./evidence/diagnosis-2026-07-21.md).

Postgres firewall rule `dev-machine2` added for `82.10.246.160` at operator request; the stale
`dev-machine-1-2026-07-20` rule was left in place.

## Not done here

Deployment. This ticket is code plus the authorised data fix; `cespk-orch-dev` and `cespk-api-dev`
still run the previous build. The loop is stopped by the data fix, not by the code — the code
stops the **next** one.
