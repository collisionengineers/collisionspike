# Verification — TKT-303

Deploy window 2026-07-21 21:26–21:32Z.

**Deployed source identity: `services/` tree `0b1b9cf063cf869f72ad18ee6a23ca7d722ed15e`.** A git
tree hash is used here rather than a commit id on purpose: the artifacts were built from a working
tree whose commit (`73d23248`) was later rewritten when that commit was split — it had accidentally
swallowed this ticket's source changes under an unrelated review-docs message. The tree hash is
content-addressed and therefore survives the rewrite, so it still identifies exactly what was
published. Verify with `git rev-parse <commit>:services`.

## Build and test evidence (offline)

| Check | Result |
|---|---|
| `npm run test --workspace @cs/orchestration` | 656 passed, 59 files |
| `npm run test --workspace @cs/api` | 1115 passed, 111 files |
| `npm run build:api` / `build:orch` (`tsc -b --force`) | clean |
| `check:tickets`, `check:docs`, `check:live-facts` | OK |
| `check:route-authority`, `check:runtime-contract`, `check:guard-register`, `check:source-size`, `check:layout`, `check:forbidden` | OK |
| `check:inventory`, `check:reconciliation`, `check:tree` | OK |

`npm run verify:offline` could not run: it fails at its first step with `spawnSync npm ENOENT`, a
pre-existing Windows tooling fault in `scripts/verify-offline.mjs` unrelated to this change. The
individual suites it wraps were run directly instead, as listed above.

## Deploy

`npm run package:deploy`, then `func azure functionapp publish <app> --javascript` from each
artifact directory. Artifact preconditions from the runbook confirmed before publishing:

- `data-api`: `@azure/functions`, `@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64` all present.
- `orchestration`: `@azure/functions`, `durable-functions` present.
- Fix present in the built bundles: 5 `FocusedFnHttpError`/`archive_scope_refused` occurrences in
  `orchestration/main.cjs`, 1 `infinity'::timestamptz` in `data-api/main.cjs`.

Post-deploy, 21:31–21:32Z:

| Probe | Result |
|---|---|
| `cespk-api-dev` state / function count | Running / 146 raw (= 144 reconciled, unchanged) |
| `cespk-orch-dev` state / function count | Running / 109 (unchanged) |
| `cespk-orch-dev` requests since 21:26Z | 55 total, 55 successful |
| `cespk-api-dev` requests since 21:26Z | 28 total, 28 successful |
| exceptions on either app since 21:25Z | **none** |
| provider-archive monitor | cycle completed 21:28:32Z on the new build, `ContinuedAsNew: True` |

Counts unchanged is the expected result: this is a code-only change to existing functions and
registers no new function.

## Acceptance

| Line | Status | Evidence |
|---|---|---|
| A Box facade 400 during folder ensure produces one recorded terminal outcome, not a retry cascade | **not yet proven live** | No case has hit the condition since the deploy — the one that could was repaired at 21:01Z. Proven offline by the `terminalArchiveFailure` suite against the exact live 400 string. See "Outstanding" below. |
| 408/429/5xx/transport faults still retry | **proven offline** | `box-folder-create.test.ts` — 500, 502, 503, 408, 429 and an unclassified `Error` all classify `null` (retryable). |
| A terminally-parked row stops appearing in `pending` and is never acknowledged complete | **proven offline** | `provider-outbox-routes.test.ts` asserts `'infinity'::timestamptz` in the UPDATE and the parameter vector; the pending slice already filters `next_attempt_at <= now()`. `provider-archive-monitor.test.ts` asserts `providerArchiveOutboxComplete` is never called on a terminal outcome. |
| Re-requesting provider recovery for a parked case makes it eligible again | **proven by inspection** | `requestProviderArchive` (`archive-outbox.ts:18-20`) unconditionally sets `provider_archive_next_attempt_at = now()` and `attempt_count = 0`. |
| `cespk-orch-dev` shows zero `boxFolderCreate` exceptions across ≥2 monitor cycles | **PROVEN LIVE** | 20:38–21:23Z: **9** completed monitor cycles (`ContinuedAsNew: True`), **zero** `boxFolderCreate` exceptions. Extended past the deploy: still zero through 21:32Z with a further cycle at 21:28:32Z. |

## The loop is stopped — live proof

Last failure burst 20:40:00–20:43:16Z (32 exceptions). Operator data fix at 21:01Z. Then:

```
2026-07-21T21:03:21.9225887Z
{"evt":"boxFolderCreate","caseId":"13f1c47f-f337-48e7-8a2d-a43b3ff9e40e",
 "folderId":"401933843879","outcome":"created","applied":true}
```

Database read-back immediately after: `box_folder_id = 401933843879`, `on_hold_reason` empty,
`provider_archive_requested_generation = provider_archive_completed_generation = 1`,
`attempt_count = 0`, `last_error` empty. The outbox row is complete and no longer pending.

The case minted its own folder under the pinned test root rather than adopting the live-archive
folder — the intended behaviour.

## Retro case creation disabled (same session, operator-directed)

`RETRO_CASE_ENABLED` flipped `true → false` on **both** `cespk-orch-dev` and `cespk-api-dev` at
21:21:55Z; settings for both apps backed up first and read back independently after. This is the
master switch — every retro activity and every `/api/internal/retro/*` route reads it and returns
an honest gated-off result.

Scoped to that one name after checking all eleven `RETRO_*` names in source:

- `RETRO_OUTLOOK_SEARCH_ENABLED` left **true** — it is also the kill switch for the
  evidence-backfill Graph `$search` fallback (`evidence-backfill.ts:271`), an unrelated feature.
- `RETRO_RELATED_INGEST_ENABLED` left **true** — layered under the master, inert while it is off.
- `RETRO_BOX_ARCHIVE_ROOT_IDS` left `3221031282` — must stay aligned with the Box facade's
  `BOX_READONLY_ROOT_IDS`.
- `RETRO_ADOPT_ARCHIVE_PO_ENABLED` already absent/false.

No retro timer or sweep exists (retro is intake-triggered plus a keyed manual starter) and no retro
orchestration had run since 19:00Z, so nothing was in flight.

This also suppresses the TKT-304 source condition for as long as it stays off.

## Outstanding

The first acceptance line is not yet proven **live**: no case has hit a terminal Box 400 since the
deploy, so the returned-terminal-outcome path has not executed in production. It cannot be proven
without either a case in that state or a deliberately-constructed one. With retro disabled the
condition is unlikely to arise on its own. Ticket therefore moves to `verify`, not `done`.

A clean live proof would be: take a disposable case, point `box_folder_id` at an out-of-scope
folder, request provider archive, and confirm one `boxFolderCreate` terminal log line, zero
exceptions, and `provider_archive_next_attempt_at = infinity`. That needs operator authorisation
for the setup write.
