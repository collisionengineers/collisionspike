# Rollback procedures

How to recover when a go-live verify fails. Before EVA dispatch, approved cutover actions use a bounded
typed inverse journal. EVA acceptance—or a lost response that may have been accepted—is an irreversible
business-event boundary and requires forward recovery. This doc maps both cases; it does not claim every
external action can be erased without consequence.

Live numbers, gate values and function counts are **not** re-embedded here — read them from the registry
[`architecture/live-environment.md`](../../architecture/live-environment.md) (single source
[`LIVE_FACTS.json`](../../../LIVE_FACTS.json)). Deploy mechanics: [`docs/azure/deploy.md`](../../azure/deploy.md);
DB mechanics: [`docs/azure/postgres.md`](../../azure/postgres.md).

> **Future-window material only.** No rollback command here authorises a cutover or compensating production
> write. TKT-178 must first have all three global inputs (signed/checksummed spreadsheet, authenticated
> contract-verified production EVA API evidence, and exact production Archive root with proven explicit
> write/rename/merge/retarget authority), backup/restore proof, the frozen approved ledger hash and a named
> window. Any Archive compensation must itself be precomputed in that ledger and remain inside the approved
> scope; while those gates are absent, there is nothing to cut over or roll back.
>
> **Command text is not rollback authority.** A compensation write requires the same named run/fence plus a
> specific pre-approved typed inverse from the signed journal. Do not renew/change Graph subscriptions, call
> an ad hoc retro starter, mutate Outlook, create a case, write database/Archive/configuration state, or call
> EVA merely because a command appears here. Outside an active approved inverse, all checks are read-only.

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there);
> node/npm/esbuild/git + `func publish`'s build steps + `swa deploy` run on **Windows**. State the
> platform per command.

> **Standing safety net.** While the TKT-178 fence is held or rollback is incomplete, manual/UI/API/admin
> case creation and both allocators remain blocked. Graph webhook acknowledgement/enqueue and subscription
> renewal stay alive so new arrivals wait durably; no rollback touches the live mailboxes. A future
> TKT-178 production Archive compensation may act only on objects listed in the frozen approved inverse
> ledger, through the recorded identity and approved write scope; no general or improvised Archive write is
> permitted.

---

## 1. Gate flips (app-settings)

Every gate the runbook sets is a Function **app-setting** on `cespk-api-dev` and/or `cespk-orch-dev` (and
`cespkbox-fn-v76a47` for the Box read-only roots). To reverse, set it back to its prior value — or
**delete** the setting to return to default-off / dark:

```bash
# WSL — set back to the prior value on each app that carries it:
az functionapp config appsettings set -g rg-collisionspike-dev -n <app> --settings <KEY>=<prior-value>
# …or remove it entirely (returns the gate to its unset/default-off state):
az functionapp config appsettings delete -g rg-collisionspike-dev -n <app> --setting-names <KEY>
```

> ⚠️ **An app-settings change recycles the app** (brief restart) — same as setting it did; expect a few
> seconds' cold start and flip off-hours where you can. Set the **same** gate on **every** app that carries
> it (most `BOX_*` / `RETRO_*` / `EVA_*` gates are twinned api+orch — check the
> [readiness-matrix](./readiness-matrix.md) for which apps hold each).

**Per-gate reversal for the runbook's flips:**

| Runbook step | Gate(s) set | Reverse with |
|---|---|---|
| 5 — production write/mint root | `BOX_ALLOWED_ROOT_ID` (box-webhook) + `BOX_FOLDER_ROOT_ID` (api + orch) | while the write fence is held, restore all three exact checksum-recorded pre-window values; never clear or guess a root id, and abort on mixed readback |
| 5 — archive roots | `RETRO_BOX_ARCHIVE_ROOT_IDS` (orch), `BOX_READONLY_ROOT_IDS` (box-webhook app) | `delete` both → the retro Box rung goes dark (no archive scanned); `RETRO_CASE_ENABLED` R1 linking is unaffected |
| 5 — optional R3 | `RETRO_OUTLOOK_SEARCH_ENABLED` (orch) | set `false` or `delete` |
| 5.6/6 — File Request | `BOX_FILE_REQUEST_TEMPLATE_ID` (api + orch) + production-target webhook | restore each app's exact prior value (delete only when its journal says prior absence); delete only a webhook whose checkpoint proves this run created that exact ID/target from prior absence, otherwise preserve/restore prior state |

**Verify:** `az functionapp config appsettings list -g rg-collisionspike-dev -n <app> --query "[?name=='<KEY>']"`
readback shows the prior value / empty; the dependent behaviour stops (e.g. a facade `box/search` under a
former archive root now returns nothing / 4xx). Any gate already `true` **before** go-live day (see the
[readiness-matrix](./readiness-matrix.md)) is **not** part of this cutover — don't flip it in a rollback.

---

## 2. Bad Function deploy (api / orch)

Both apps ship as a **single esbuild bundle** (`deploy/api/main.cjs`, `deploy/orch/main.cjs`) with a
committed `node_modules` — so rollback is **redeploy the prior bundle**. Recent bundle rebuilds are
committed (e.g. `0804f58 build(deploy): rebuilt api/orch esbuild bundles`), so the last-good artifact is in
git history.

```bash
# Windows — restore the prior-good built bundle + shipped deps from the last-good commit:
git checkout <last-good-commit> -- deploy/api        # (or deploy/orch)
# local smoke BEFORE publishing — must list functions, NOT crash:
node -e "require('./deploy/api/main.cjs')"
```

```bash
# WSL — republish from the restored folder (see docs/azure/deploy.md for the full procedure):
cd /mnt/c/Users/PC/Documents/GitHub/collisionsuite/active/collisionspike/deploy/api
func azure functionapp publish cespk-api-dev --javascript   # orch: cespk-orch-dev
```

> 🔴 **The 0-functions crash signature.** A host that reports **`state: Running` with 0 functions** is the
> esbuild ESM→CJS `import.meta.url` bundle crash (missing the `build-{api,orch}.cjs` banner), **not** a
> healthy deploy — and `remotebuild=false` means a bundle shipped **without** `node_modules` 404s every
> route. The local `node -e require(...)` smoke catches both before you publish. Details + the other deploy
> footguns: [`docs/azure/deploy.md`](../../azure/deploy.md) § Gotchas.

**Verify:** the app's function count matches the registry
[`live-environment.md`](../../architecture/live-environment.md) (**0 = the crash signature**, not a healthy
roll-back); `no-auth → 401`; one real route `200`. Don't `func publish` in a loop — run the local smoke and
check the 0-functions / `node_modules` gotchas first (the `azure-churn-guard` will stop a retry loop).

---

## 3. Bad SPA deploy

The SPA is static `dist/` on Static Web App `cespk-spa-dev`. Rollback is **rebuild the prior commit and
redeploy** — there is no server state to unwind.

```bash
# Windows — rebuild the last-good SPA and redeploy:
git checkout <last-good-commit> -- mockup-app
npm run build --prefix mockup-app
copy mockup-app\staticwebapp.config.json mockup-app\dist\   # CSP + SPA fallback — see gotcha
# deploy dist/ (swa deploy / az staticwebapp — see docs/azure/deploy.md § SPA)
```

> 🔴 **CSP-in-dist gotcha.** The strict CSP + SPA navigation fallback live in
> `mockup-app/staticwebapp.config.json`, **not** in the Vite output — a bare-`dist/` upload silently ships
> the app **without its CSP**. **Copy that file into `dist/` before deploying.** Also: the four public
> `VITE_*` values must come from the committed `mockup-app/.env.production` (a build without them bakes
> `undefined` into rest-client/MSAL → **blank at first paint**). Both were real outages — see
> [`docs/azure/deploy.md`](../../azure/deploy.md) § SPA.

**Verify:** load `https://proud-sky-04e318b03.7.azurestaticapps.net`, **hard-refresh** (the SWA edge
caches), confirm assets `200`, API calls `200/401` (not CORS-blocked), and the **CSP header is present** on
the live URL.

---

## 4. Case/PO floor seed ([runbook step 5](./runbook.md))

The floor influences every future allocation, and prior rows may already exist. Rollback restores each
ledger-listed prefix's exact prior row/value and the allocator-mode checkpoint; it never clears the table.

```bash
# WSL — illustrative typed inverse generated from the journal; never substitute ad hoc values:
# prior row existed: restore exact floor_seq/note/updated_at under its run-written exact-old predicate
INSERT INTO case_po_floor(prefix, floor_seq, note, updated_at)
VALUES ('<prefix>', <prior-floor>, '<prior-note>', '<prior-updated-at>')
ON CONFLICT (prefix) DO UPDATE SET floor_seq=EXCLUDED.floor_seq, note=EXCLUDED.note,
  updated_at=EXCLUDED.updated_at
WHERE case_po_floor.floor_seq=<run-floor> AND case_po_floor.updated_at='<run-updated-at>';
# prior row was absent: delete only the exact row/version created by this run
DELETE FROM case_po_floor
WHERE prefix='<prefix>' AND floor_seq=<run-floor> AND updated_at='<run-updated-at>';
```

Follow the full connect/firewall/`SET ROLE csadmin`/drop-rule sequence in
[`docs/azure/postgres.md`](../../azure/postgres.md) (the app login `cespk_app` can't run this — it doesn't
own the table). Do not decide ad hoc that a Case/PO renumber is permanent or reversible: the frozen TKT-178
ledger must name every intended mapping and its approved compensation before the window. Every statement
must assert the expected row count and stop on mismatch. Restore the allocator-mode entry at its actual LIFO
position, but never disable fail-closed floor reads while any authoritative floor remains. Leave genuine
post-window business data untouched unless that exact inverse was approved.

**Verify:** every listed prefix byte-matches its prior row/absence and allocator health/mode matches the
approved prior state without exposing a prefix to fallback below an authoritative floor. Do not mint a
disposable production case for verification.

---

## 5. Scoped database + production Archive compensation (TKT-178 future window)

Before the window, the zero-write reconciliation must pair every proposed database Case/PO, merge, status,
relationship/link or audit-preserving change and every Archive rename, merge, move or root retarget with its
immutable ids, full before-state, expected post-state and an explicit inverse. Archive rows also retain
parent/name/checksum or inventory proof. Rehearsal on a non-production copy must prove those scoped inverses
without treating a Viewer-only or test root as production authorization. A whole-database restore is not the
normal compensation because unrelated intake may have advanced since the snapshot.

Before EVA dispatch, if a verify fails, keep or reacquire the scoped fence, stop cutover workers and load the
durable inverse stack for the exact run/ledger hash. Pop one typed checkpoint at a time in strict LIFO order,
apply only its approved inverse, verify its exact postcondition, then pop the next. Database, Archive and
configuration checkpoints may be interleaved: never hard-code “DB first” or “Archive first.” Restore the Box
Function and app roots only when their actual stack entries are reached. Treat an immutable, verified
`mergedInto` lineage after response loss as idempotent success; do not blind-retry into `409`. On any failed
inverse, stop with the fence held. Preserve conflicting/newer content and escalate it; never overwrite, merge
or delete it to make the ledger balance. Restore queues/allocators/manual create last, only after every
inverse and invariant passes. Record each compensation result against the same ledger hash.

**Genuine canary compensation is preservation, not deletion.** If the ingress lease already created a real
case/folder/evidence or staff edits before the EVA boundary, never erase them to force snapshot equality.
Checkpoint every byte and identity, then either requeue/hold the case idempotently at the prior processing
boundary or rebind/move it to the approved pre-window root/state using its specific inverse, while preserving
all genuine content and audit. Pre-existing cutover rows return to approved pre-window state; the canary is
separately balanced as preserved/held/rebound with no lost work.

### EVA irreversible boundary

Before the first production EVA dispatch, the LIFO path above remains available. Once EVA returns accepted,
or a response is lost and acceptance is unknown, do not reverse identity-bearing Case/PO/Archive state or
resubmit blindly as though no business event occurred. Query/status-check by the persisted operation and
vendor correlation, reconcile the existing Case/PO/Archive identity forward, and retain the original
request/response evidence. A vendor cancellation or business compensation needs separate explicit authority;
flipping `EVA_API_ENABLED` only prevents another call and does not undo the first one.

**Verify:** pre-existing database/Archive rows match their approved pre-window state; unrelated/newer records
and objects are unchanged; all three root settings match their prior values; and every genuine canary byte,
edit and identity is accounted as preserved/held/rebound. Durable queues resume from the saved checkpoint
without duplication. A failed or incomplete inverse leaves the fence/window stopped and TKT-178 blocked—it
is not a reason to broaden write scope.

---

## 6. Data-correction reprocess ([runbook precondition](./runbook.md))

The go-live data step is an **in-place reprocess** of existing DB rows through the fixed classifier — **not**
a mailbox wipe-and-rebuild (that was proven non-viable and abandoned; the DB is the complete record). It is
designed **non-destructive and idempotent**: it re-derives classification/status on rows in place and can be
**re-run** — so the first "rollback" for a bad reprocess is usually a **corrected re-run**, not a restore.

**Whole-database disaster recovery is outside TKT-178 authority.** This cutover document intentionally
contains no executable whole-store restore command: such a restore can discard unrelated work created after
the snapshot. A separately declared and approved disaster-recovery incident must use its own change freeze,
impact approval, independently verified snapshot and the governed PostgreSQL procedure in
[`docs/azure/postgres.md`](../../azure/postgres.md). TKT-178 always uses the exact scoped inverse ledger in
§5; for a bad reprocess, prefer a corrected idempotent re-run. Keep the pre-cutover dump until independent
go-live sign-off, but its existence never expands cutover rollback authority.

**Verify:** the SPA shows correct category/status distributions again (match against the pre-reprocess
baseline saved in P0); queue counts agree; no rows lost vs the dump's counts.

---

## 7. The rest of the runbook — reversibility at a glance

| Runbook step | Rolls back by | Notes |
|---|---|---|
| 1 — PAYG upgrade | *not reversed* (and no reason to) | a billing offer change; leave it |
| 2 — staff app-roles | Entra → **Enterprise applications** → the API app → **Users and groups** → remove the assignment | the person then `403`s again — expected |
| 3 — provider corpus | additive seed: deactivate the added rows / clear the added `known_email_domains` via the [postgres.md](../../azure/postgres.md) `SET ROLE csadmin` runbook | data-only; matching falls back to the intermediary path |
| 4/5 — scoped database + production Archive/root work | before EVA dispatch, pop the durable typed inverse stack in actual reverse checkpoint order; DB/Archive/config steps may interleave (§5) | preserve unrelated/conflicting/newer content; no whole-DB rewind, improvised write or delete |
| 5.6/6 — File Request / webhook | restore exact prior template values; delete only the immutable webhook checkpointed `created_by_run=true`, otherwise preserve/restore prior subscription state | registry facts are evidence, never inverse authority |
| 7 — production EVA API reconciliation | before dispatch, use the approved inverse stack; after accepted/unknown, disable further dispatch if authorised and recover forward by persisted operation/correlation | a gate flip does not undo EVA; never blind-resubmit or replace proof with drag-drop |

---

**After any rollback that changed live Azure state:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json)
(bump `lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
`VERIFY_LIVE=1 node verify-all.mjs`. Companion docs: [runbook.md](./runbook.md) ·
[readiness-matrix.md](./readiness-matrix.md) · [day0-smoke.md](./day0-smoke.md). Doc conventions:
[`docs/MAINTENANCE.md`](../../MAINTENANCE.md).
