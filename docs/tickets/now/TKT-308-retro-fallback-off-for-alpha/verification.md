# Verification — TKT-308

## Gate read-back — PASS (2026-07-22T10:19:22Z)

Live `az functionapp config appsettings list`, resource group `rg-collisionspike-dev`,
subscription `e6076573-23a5-46a8-acef-7e22d264e5db`:

| App | `RETRO_CASE_ENABLED` |
|---|---|
| `cespk-orch-dev` | `false` |
| `cespk-api-dev` | `false` |

Command used (per app):

```
az functionapp config appsettings list -n <app> -g rg-collisionspike-dev \
  --query "[?name=='RETRO_CASE_ENABLED'].value" -o tsv
```

Read-only. No configuration was changed by this verification — the gate was already
`false` on both apps when read.

### Adjacent RETRO_* settings, recorded for completeness

`cespk-orch-dev`: `RETRO_OUTLOOK_SEARCH_ENABLED=true`, `RETRO_RELATED_INGEST_ENABLED=true`,
`RETRO_BOX_ARCHIVE_ROOT_IDS=3221031282`.
`cespk-api-dev`: `RETRO_BOX_ARCHIVE_ROOT_IDS=3221031282`.

These two `true` values do **not** weaken the result. `retroCase` is the master switch and
is checked first at every retro entry point, verified by code read on this branch:

- `retro-activities.ts` — `gates.retroCase()` at lines 42, 85, 131, 189, 360; the
  `retroOutlookSearch()` check at 190 is subordinate to the `retroCase()` check at 189.
- `retro-box-activities.ts` — lines 50, 86, 176.
- `retro-case.ts` line 124; `retro-deleted-probe.ts` line 39.
- `retro-related-activities.ts` — `retroCase()` at 47 and 288. The bare
  `retroRelatedIngest()` check at 237 is inside the `retroLinkRelated` activity
  (declared line 35, next activity at 275), so it sits behind the line-47 master check.
- `retro-reconstruct.ts` registers **no** activity, orchestration, or HTTP route — it
  exports only generator functions (`finishPersisted`, `prepareOutlookOriginal`,
  `createMinimalAnchor`, `createFromOutlook`, `createFromBox`) called by the gated
  activities above. It is not independently reachable.

With the master gate `false`, every retro entry point returns `{ skipped: 'gate_off' }`.

## Still open

The second acceptance criterion — *no new `reconstructionSource` audit event for the
remainder of the alpha window* — is a forward-looking watch and is **not** discharged by
this read-back. Note App Insights' free-tier KQL window collapses intra-day, so the
durable check is the `audit_event` table rather than a log query.
