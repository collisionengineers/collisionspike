# Rollback procedures

How to **reverse** each go-live action if its verify fails and can't be corrected forward. Every cutover
action in [runbook.md](./runbook.md) is designed to be **bounded and reversible with no data loss** — a
gate flips back, a bundle redeploys, a seed clears. This doc is the back-out map: for each thing the
runbook changes, the exact command to undo it and how to confirm the undo took.

Live numbers, gate values and function counts are **not** re-embedded here — read them from the registry
[`architecture/live-environment.md`](../../architecture/live-environment.md) (single source
[`LIVE_FACTS.json`](../../../LIVE_FACTS.json)). Deploy mechanics: [`docs/azure/deploy.md`](../../azure/deploy.md);
DB mechanics: [`docs/azure/postgres.md`](../../azure/postgres.md).

> **Platform routing.** `az` / `psql` / `pg_restore` run from **WSL2 Ubuntu** (az logged in there);
> node/npm/esbuild/git + `func publish`'s build steps + `swa deploy` run on **Windows**. State the
> platform per command.

> **Standing safety net.** **Manual case-create stays available throughout** — if any intake-plane change
> misbehaves, staff keep working while you roll it back. No rollback below touches the live mailboxes or
> the real Box archive (the Graph grant is `Mail.Read`; the archive roots are scope-locked read-only).

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
| 5 — archive roots | `RETRO_BOX_ARCHIVE_ROOT_IDS` (orch), `BOX_READONLY_ROOT_IDS` (box-webhook app) | `delete` both → the retro Box rung goes dark (no archive scanned); `RETRO_CASE_ENABLED` R1 linking is unaffected |
| 5 — optional R3 | `RETRO_OUTLOOK_SEARCH_ENABLED` (orch) | set `false` or `delete` |
| 6 — File Request | `BOX_FILE_REQUEST_TEMPLATE_ID` (api + orch) | `delete` on both → the File-Request copy simply **no-ops** (harmless; no error) |

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

## 4. Case/PO floor seed ([runbook step 4](./runbook.md))

The floor is **additive and non-destructive by construction**: `mintCasePo` / the `next-po` preview
allocate `GREATEST(db max, floor) + 1` (`api/src/lib/case-po.ts`), so an **empty `case_po_floor` table = the
original db-max behaviour**. Rolling back the seed is therefore just **clearing the floor rows** — no case
data is affected.

```bash
# WSL — postgres.md runbook: transient firewall rule → Entra digital@ → SET ROLE csadmin, then:
DELETE FROM case_po_floor;                          -- clear all seeded floors (reverts to db-max)
-- …or DELETE FROM case_po_floor WHERE marker='…' AND principal_code='…';  -- surgical revert
```

Follow the full connect/firewall/`SET ROLE csadmin`/drop-rule sequence in
[`docs/azure/postgres.md`](../../azure/postgres.md) (the app login `cespk_app` can't run this — it doesn't
own the table). **Placeholder renumbering done in step 4 does not need reverting** — a real Case/PO stamped
on a case is valid business data; leave it. Only the *floor* comes out.

**Verify:** `GET /api/cases/next-po?principal=<X>` no longer reports `source: 'floor'` (it falls back to the
DB max) for the cleared principals; a fresh mint lands at db-max + 1, not above the archive.

---

## 5. Data-correction reprocess ([runbook precondition](./runbook.md))

The go-live data step is an **in-place reprocess** of existing DB rows through the fixed classifier — **not**
a mailbox wipe-and-rebuild (that was proven non-viable and abandoned; the DB is the complete record). It is
designed **non-destructive and idempotent**: it re-derives classification/status on rows in place and can be
**re-run** — so the first "rollback" for a bad reprocess is usually a **corrected re-run**, not a restore.

**Backstop (only if a re-run can't recover it):** restore from the **pre-cutover `pg_dump`** taken before
the reprocess (the full `-Fc` dump from the runbook precondition / [P0 rehearsal in the sprint
plan](../../../GO_LIVE_SPRINT_PLAN.md)):

```bash
# WSL — postgres.md runbook (transient firewall rule + Entra token), restore as the owner:
pg_restore -l pre-cutover.dump          # confirm tables + row counts first (guards the FORCE-RLS zero-rows trap)
pg_restore --host=cespk-pg-dev.postgres.database.azure.com --username=<entra-admin> \
           --dbname=collisionspike --role=csadmin --clean --if-exists pre-cutover.dump
```

Restore is the **nuclear option** — it rewinds all derived state to the dump instant, discarding anything
intake wrote since. Prefer the corrected re-run. Whichever you do, keep the pre-cutover dump until go-live
is signed off. Row-count / RLS caveats (a FORCE-RLS dump can silently carry **zero** rows if taken as the
wrong role): [`docs/azure/postgres.md`](../../azure/postgres.md).

**Verify:** the SPA shows correct category/status distributions again (match against the pre-reprocess
baseline saved in P0); queue counts agree; no rows lost vs the dump's counts.

---

## 6. The rest of the runbook — reversibility at a glance

| Runbook step | Rolls back by | Notes |
|---|---|---|
| 1 — PAYG upgrade | *not reversed* (and no reason to) | a billing offer change; leave it |
| 2 — staff app-roles | Entra → **Enterprise applications** → the API app → **Users and groups** → remove the assignment | the person then `403`s again — expected |
| 3 — provider corpus | additive seed: deactivate the added rows / clear the added `known_email_domains` via the [postgres.md](../../azure/postgres.md) `SET ROLE csadmin` runbook | data-only; matching falls back to the intermediary path |
| 5 — retro Box rung | § 1 gate table above (`delete` the archive-root settings) | archive is read-only by scope lock — nothing to un-write |
| 6 — File Request / webhook | clear `BOX_FILE_REQUEST_TEMPLATE_ID` (§ 1); **delete the `FILE.UPLOADED` webhook** via the facade `DELETE box/webhooks/{id}` (id in [LIVE_FACTS](../../../LIVE_FACTS.json)) | copy no-ops without the template id; the webhook stops firing |
| 7 — EVA drag-drop | nothing to roll back (manual staff action; EVA REST stays gated) | — |

---

**After any rollback that changed live Azure state:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json)
(bump `lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
`VERIFY_LIVE=1 node verify-all.mjs`. Companion docs: [runbook.md](./runbook.md) ·
[readiness-matrix.md](./readiness-matrix.md) · [day0-smoke.md](./day0-smoke.md). Doc conventions:
[`docs/MAINTENANCE.md`](../../MAINTENANCE.md).
