# boxFolderCreate terminal-400 retry loop — live diagnosis, 2026-07-21

Read-only diagnosis of `cespk-orch-dev` between 19:40Z and 20:10Z on 2026-07-21, plus an
authorised operator data fix at 21:01Z. All telemetry from the `cespk-orch-dev` Application
Insights component; all configuration read back live with `az`.

## Symptom

`boxFolderCreate` failing continuously against a terminal Box 400. A prior diagnostician saw
~120 failures at roughly ten-second spacing and still climbing at 18:46Z.

## The error

Two levels down (`exceptions | mv-expand details`; the top-level `outerMessage` is only the
useless `Exception while executing function: Functions.boxFolderCreate`):

```
fn GET box/folders/401801654393 → 400:
{"error": "Target is outside the allowed Box root (scope lock).", "status": 400}
```

## Volume and shape

`exceptions | where operation_Name == 'boxFolderCreate' | summarize count() by bin(timestamp, 30m)`
over 12h, plus a 6-day pass by `operation_Name`:

| Window (2026-07-21) | boxFolderCreate failures |
|---|---:|
| 08:30–14:00Z | 72, 120, 120, 82, 200, 198, 120, 146, 154, 150, 174, 192 |
| 14:00–18:00Z | 0 — the PLAN-015 database wipe cleared the outbox |
| 18:00–20:05Z | 36, 84, 48, then 22 in the 20:03–20:05Z burst |

Day totals on `cespk-orch-dev`: 1,896 `boxFolderCreate` + 632 `boxFolderCreateOrchestrator`
exceptions out of 3,630 exceptions total.

Distinct Box folder ids refused, 12h window (`extract('box/folders/([0-9]+)', 1, message)`):

| Folder id | Failures | First | Last |
|---|---:|---|---|
| 401801654393 | 168 | 18:21:26Z | 19:28:32Z (+22 more at 20:03–20:05Z) |
| 381242629710 | 312 | 08:41:38Z | 14:04:35Z |
| 391955949529 | 288 | 09:03:39Z | 13:42:40Z |
| 383517731837 | 240 | 10:12:21Z | 13:54:43Z |
| 351163979737 | 240 | 10:29:23Z | 14:09:19Z |
| 296824750965 | 216 | 10:36:27Z | 13:40:18Z |
| 382567071914 | 190 | 12:00:46Z | 14:18:49Z |
| 389542228193 | 120 | 13:18:35Z | 14:11:39Z |
| 388258771028 | 48 | 13:49:57Z | 14:06:57Z |

The pre-wipe set was eight simultaneously-stuck cases. Post-wipe only one case remained, so this
is not a one-off: it reproduces whenever a case is linked to a folder outside the pinned roots.

## Live configuration (read back 2026-07-21, `az functionapp config appsettings list`)

| App | Setting | Value |
|---|---|---|
| `cespkbox-fn-v76a47` | `BOX_ALLOWED_ROOT_ID` | `392761581105` |
| `cespkbox-fn-v76a47` | `BOX_READONLY_ROOT_IDS` | `3221031282` |
| `cespk-orch-dev` | `BOX_FOLDER_ROOT_ID` | `392761581105` |
| `cespk-orch-dev` | `RETRO_BOX_ARCHIVE_ROOT_IDS` | `3221031282` |
| `cespk-api-dev` | `BOX_FOLDER_ROOT_ID` | `392761581105` |

Configuration is self-consistent. Folder `401801654393` is under neither root, so the facade is
correct to refuse it.

## Why the facade returns 400, and why it is right to

`box_operations.py:193-206` — `get_folder` deliberately uses the **write-side** guard
(`_assert_in_scope`), not the broader readable-root guard, with the docstring: *"callers use it
before adopting an existing folder as a case's durable Archive link."* `function_app.py:136-140`
then maps `BoxScopeError` to HTTP 400 with the comment *"400 so it's never mistaken for a
transient retryable failure."*

The Python side had already made the terminal/transient distinction. The TypeScript caller threw
it away.

## Amplification arithmetic

`services/orchestration/src/adapters/functions-client.ts:37` mapped **every** non-2xx to a plain
`Error` and threw, with the comment *"throw so the Durable retry policy retries the calling
activity"* — no status inspection anywhere on the path. So one permanently-bad case produced:

- `box-folder-create.ts:237` — `callActivityWithRetry('boxFolderCreate', 5s ×3)` → 3 doomed calls
- `provider-archive-monitor.ts:50` — `callSubOrchestratorWithRetry(10s ×4, backoff 2)` → ×4

**12 activity executions and 12 Box API calls per case per monitor wake.** Confirmed in telemetry:
the 96 activity exceptions in the 19:00Z hour divide exactly by the 32 orchestrator exceptions
(3:1 at the activity layer), and the monitor logged seven `Archive ensure failed` cycles for the
one case between 18:23:50Z and 19:28:32Z.

## Why it never stopped

`provider-outbox-routes.ts` `defer` backs off `30 × 2^min(attempt_count, 6)` seconds capped at
3600 — so the "hot" ten-second cadence decays to hourly, but **never to zero**. The outbox row
stays `requested > completed` forever and is re-listed on every wake. Any fresh
`requestProviderArchive` resets `provider_archive_attempt_count = 0` and
`provider_archive_next_attempt_at = now()` (`archive-outbox.ts:18-20`), dropping it straight back
to a 30-second cadence.

Confirmed still live after the initial report: the 19:28:32Z burst was followed by a fresh
20:03–20:05Z burst (6 + 12 + 4 failures), exactly one backoff interval later. The
`provider-archive-monitor-singleton` orchestration was alive and continuing-as-new at 19:43:32Z.

## Provenance of the bad link

`audit_event` for case `13f1c47f-f337-48e7-8a2d-a43b3ff9e40e` (Case/PO `A.QDOS26229`, created
18:17:17Z):

```
Case reconstructed retroactively (box_eml): LL26ZZF · (EREF9) RTA on 19/07/2026 …
{"casePo":"A.QDOS26229","discoveredArchivePo":"A.QDOS261819","reconstructionSource":"box_eml",
 "boxFolderId":"401801654393", …}
```

Retro reconstruction minted the Case/PO correctly through the normal allocator
(`RETRO_ADOPT_ARCHIVE_PO_ENABLED=false`, so `A.QDOS261819` was only *recorded* as
`discoveredArchivePo`) — but it stamped the **discovered live-archive folder id** as the case's
durable `box_folder_id`. The PO adoption is gated; the folder adoption is not. That asymmetry is
the source of the poison and is tracked separately.

A later audit line — `archived 0/23 evidence file(s) to archive folder 401801654393` at
19:04:35Z — shows an upload attempt also aimed at the live folder. It wrote nothing
(`uploaded: 0`); the scope lock held. **No live-archive writes occurred.**

## Blast radius at time of diagnosis

All five cases in the post-wipe database, by `box_folder_id`:

| Case/PO | Folder id | State |
|---|---|---|
| A.QDOS26229 | 401801654393 | out of scope — looping |
| A.QDOS26230 | 401911345835 | fine |
| A.QDOS26231 | 401910645480 | fine |
| A.QDOS26232 | 401912517389 | fine |
| A.QDOS26233 | 401910556223 | fine |

Exactly one pending outbox row, at `provider_archive_attempt_count = 9` (backoff cap),
`next_attempt_at = 2026-07-21 21:15:16Z`, `last_error = 'Archive folder ensure failed'`.

## Cost and impact

- **Cost: negligible.** Every app is Flex Consumption (FC1) — ~2,500 sub-second executions/day.
- **Downtime: none.** The loop is contained to the provider-archive monitor.
- **Real damage:** provider recovery for the affected case can never complete, so the case keeps
  its `provider_archive_pending` hold indefinitely; and the noise destroys Application Insights
  as a health signal — 2,528 of the day's 3,630 orchestration exceptions were this one loop, so
  the "0 exceptions" checks the deploy runbooks lean on cannot distinguish healthy from broken.

## Same anti-pattern elsewhere on `cespk-orch-dev`

Eternal monitors retrying non-retryable failures are a family, not a one-off:

| Operation | Exceptions/day (16–21 Jul) |
|---|---|
| `archiveHoldingRecoverUploads` | 1,632 / 1,254 / 1,702 / 1,702 / 1,138 / 278 |
| `boxPurgeOne` | 334 (16th), 860 (17th) — see TKT-227 |
| `providerArchiveOutboxList` | 286 on the 21st (Data API 500s, 16:45–18:05Z) |
| `archiveMirrorOutboxList` | 160 on the 21st |
| `evidenceBackfillPublisherDrain` | 276 on the 21st |

Root causes for these are **not** established here; only the volumes are.

## Operator data fix applied 2026-07-21 21:01Z

Authorised by the operator ("The folder ID is wrong. It's pointing to the live folders instead of
minting the case separately and using the test folder. Clear the link.").

```sql
UPDATE case_
   SET box_folder_id = NULL, box_folder_url = NULL,
       provider_archive_attempt_count = 0,
       provider_archive_next_attempt_at = now(),
       provider_archive_last_error = NULL,
       updated_at = now()
 WHERE id = '13f1c47f-f337-48e7-8a2d-a43b3ff9e40e'
   AND box_folder_id = '401801654393';
-- UPDATE 1
```

Before: `box_folder_id = 401801654393`, `attempt_count = 9`, `next_attempt_at = 21:15:16Z`.
After: both folder columns NULL, `attempt_count = 0`, `next_attempt_at = 21:01:09Z`,
`on_hold_reason` still `provider_archive_pending`, `requested = 1`, `completed = 0`.

With the link cleared, the already-deployed activity takes the create branch instead of the
adopt branch and mints `A.QDOS26229` under the pinned test root `392761581105`. No deploy was
needed to stop the loop.

## Incidental finding

The Postgres firewall rule `dev-machine-1-2026-07-20` was pinned to `82.8.225.120` while the
operator workstation's public IP had been reassigned to `82.10.246.160`, so `psql` hung — exactly
the silent breakage `docs/operations/database.md` warns about. A second rule `dev-machine2` was
added for the current IP at operator request. The original rule was left in place.
