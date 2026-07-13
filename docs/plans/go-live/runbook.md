# Go-live cutover runbook

The **ordered, scripted cutover procedure** — each step names its exact command or portal path and a
verify. Do the steps **in order**; each has a hard dependency on the one before. Live numbers, gate
values and function counts are **not** re-embedded here — read them from the registry
[`docs/architecture/live-environment.md`](../../architecture/live-environment.md) (single source
[`LIVE_FACTS.json`](../../../LIVE_FACTS.json)) at cutover time.

Companion docs in this set: **[readiness-matrix.md](./readiness-matrix.md)** (every gate × target ×
owner), **[day0-smoke.md](./day0-smoke.md)** (the post-cutover smoke), **[rollback.md](./rollback.md)**
(back-out). The exhaustive operator inventory (with the same commands) is
[`docs/gated.md`](../../gated.md); the sprint that produced this is
[`GO_LIVE_SPRINT_PLAN.md`](./README.md).

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there); Exchange-RBAC admin
> is **Windows PowerShell**; Box CLI + git + node run on **Windows**. State the platform per command.

---

## Precondition — data correction (IN-PLACE reprocess), not a mailbox wipe

The DB is the **complete record** (the intake Inboxes hold only ~⅓ of the processed emails — the rest
are in Deleted Items), so the go-live data-correction step is an **in-place reprocess** of the existing
rows through the fixed classifier — **NOT** a mailbox wipe-and-rebuild (that was proven non-viable and
abandoned). This reprocess is **BLOCKED on the P2 classifier fix-wave** (a naive reprocess-diff
mis-demotes obvious new-work because `evidence.source_message_id` is always NULL). Do **not** begin the
cutover below until the reprocess has run green and the SPA shows correct data — see
[`GO_LIVE_SPRINT_PLAN.md`](./README.md) (P2 → P3 in-place reprocess → P3V). Until
then this runbook is provisional.

---

## 1. Subscription on Pay-As-You-Go — *hard dated deadline; do first*

Azure portal → **Subscriptions → `e6076573-…` → Upgrade** (or **Cost Management + Billing**), convert
the Free Trial to **Pay-As-You-Go**; the 12-month free Postgres allowance survives. Until this is done
the whole stack disables at the ~30-day trial mark and every step below is provisional
([gated.md A1](../../gated.md)).

**Verify:** `az account show` prints subscription `e6076573-…`, state **Enabled**, and quotaId is no
longer `FreeTrial_2014-09-01`.

## 2. Staff app-role roster ([gated.md C1](../../gated.md))

Only one staff principal is app-role-assigned; everyone else `403`s until assigned.

- Entra → **Enterprise applications** → the API app (`cespk-api-dev` / `CollisionSpike`, v2 `aud` =
  API client-id `fa2fb28c…`) → **Users and groups → Add user/group**.
- Assign **`CollisionSpike.User`** to each staff member (**`CollisionSpike.Superuser`** for
  full-privilege admins). Do **not** assign `CollisionSpike.Engineer` (defined, not enforced).

**Verify:** each person signs out/in and loads the SPA
(`https://proud-sky-04e318b03.7.azurestaticapps.net`) without a `403`.

## 3. Provider corpus completion ([gated.md D3/D4](../../gated.md))

Fill the remaining domainless providers and the **PHA (Parkhouse) principal code** so sender-domain
auto-matching is complete before intake volume ramps.

- Operator supplies the real business domain (or "none") for the remaining providers (Fairway, Regent,
  Castle, Stallion, Relay, …) and the public-domain case (NETWORK HD UK / YM Law → `gmail.com`), plus
  the **PHA principal code** (its insert is held commented in
  `migration/assets/schema/seed/916_provider_domain_corrections.sql`).
- Apply as a reviewed additive seed delta via the **[postgres.md](../../azure/postgres.md)** runbook
  (transient firewall rule → Entra `digital@` → `SET ROLE csadmin` → `\i` the delta → drop the rule).
  Domains serving >1 active provider must stay ambiguity-guarded (intermediary path, never a match key).

**Verify:** the delta's header SELECTs show each provider's `known_email_domains` populated and the PHA
row active; corpus count moves in the registry
[`live-environment.md`](../../architecture/live-environment.md).

## 4. Case/PO floor seeding + placeholder renumber — BLOCKED future window

The live mint restarted near 001 after the 2026-06-30 reset while the real archive numbering is far
ahead. This section is not authority to execute. TKT-178 first requires the signed/checksummed job
spreadsheet, authenticated/verified production EVA, the exact approved production Archive target and
write scope, backup/restore proof, a frozen approved dry-run hash and a named window. After those gates
pass, take over the sequence per the full procedure in
[`case-po-sequence-cutover.md`](../case-po-sequence-cutover.md) (§ "Future cutover window"). **This gates the
retro Box rung in step 5** ([gated.md D11 step 1](../../gated.md)).

1. **Freeze staff minting** — from here the system is the only allocator.
2. **Collect real maxima** per (marker, principal, year) from the approved production Archive inventory
   and authenticated/verified EVA evidence retained by TKT-178. A test/mirror/Viewer-only root or a
   blocked EVA path is not an acceptable substitute.
3. **Seed the floors:** on Windows
   `node scripts/cutover/case-po-floor-from-folders.mjs names.txt > seed.sql`
   ([`scripts/cutover/case-po-floor-from-folders.mjs`](../../../scripts/cutover/case-po-floor-from-folders.mjs)
   — unparseable names are REPORTED on stderr, never guessed). Review `seed.sql`, resolve every
   reported variant, then apply via the [postgres.md](../../azure/postgres.md) runbook (`SET ROLE
   csadmin`). Intake numbering now continues the real sequence (`GREATEST(db max, floor)+1`).
4. **Renumber the placeholders:** for each open, non-terminal case whose `case_po` was system-minted
   pre-cutover (implausibly low sequence), in created order either stamp a fresh number via the
   case-page Set-Case/PO edit (`PATCH /api/cases/{id}` `casePo`) or clear it (`casePo: ''`) and let
   the next EVA-add assign. Trial cases already stamped with real numbers are left alone.

**Verify:** `GET /api/cases/next-po?principal=<X>` returns `source: 'floor'` (or a DB max above it) for
every active principal; confirm the next naturally created, operator-designated genuine case lands
above the approved production Archive max. Do not mint a disposable live case for proof.

## 5. Archive roots + retro gate flips ([gated.md D11 steps 2–4](../../gated.md))

`RETRO_CASE_ENABLED=true` already (rung-1 any-status linking is acting). This activates the **Box
reconstruction rung** — do it **only after step 4** (sequence alignment).

1. **Read the real archive root id(s)** from the Box web app URL
   (`https://app.box.com/folder/<id>` — the historical archive, NOT the live mirror root). Multiple
   per-year/per-provider roots are fine (comma-separated).
2. **Grant the Box service account Viewer** on each root: Box Admin Console → the folder → **Share** →
   invite the service-account email from the app's `Config.JSON`. Read-only by scope lock (list/search/
   download — never create/upload/delete).
3. **Set the settings** (WSL):
   - `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings RETRO_BOX_ARCHIVE_ROOT_IDS=<id,id,…>`
   - `az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_READONLY_ROOT_IDS=<id,id,…>`
   - *(Optional, R3 mailbox-search rung — its own kill switch, needs nothing else):*
     `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings RETRO_OUTLOOK_SEARCH_ENABLED=true`
4. **Sanity checks before trusting it:** eyeball 5–10 archive folders — are they named EXACTLY the
   Case/PO (suffixed variants like `CCPY26050 - Smith` need a flagged prefix-match arm)? Do they
   reliably contain the original instruction `.eml`?

**Verify:** `az functionapp config appsettings list` readback shows the ids on both apps; a facade
`box/search` under a configured root returns 200; a known un-linked archived case reconstructs.

## 6. File Request template id + `BOX_FILE_REQUEST_TEMPLATE_ID`

`BOX_FILEREQUEST_ENABLED` is already true on both apps, but the template id is empty → the
File-Request copy no-ops. Hand-build the template File Request in the Box UI (per
[`docs/azure/box-activation.md`](../../azure/box-activation.md) §5), read its id, then (WSL):

- `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev --settings BOX_FILE_REQUEST_TEMPLATE_ID=<id>`
- `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings BOX_FILE_REQUEST_TEMPLATE_ID=<id>`

Also subscribe the **`FILE.UPLOADED` webhook** if not already live (facade
`POST box/webhooks` → `.../api/box-webhook`; see [box-activation.md](../../azure/box-activation.md) and
[`GO_LIVE_SPRINT_PLAN.md`](./README.md) P6).

**Verify:** a new intake case gets a File Request copied onto its Box folder; an upload into it fires
`FILE.UPLOADED` → the webhook registers an evidence row → the case advances.

## 7. EVA drag-drop live procedure ([gated.md D1](../../gated.md))

**EVA REST stays gated** (`EVA_API_ENABLED` absent) — Minotaur's Sentry API accepts only **one
principal code** per submission, so it can't route the different work-provider codes; REST waits on
Minotaur's patch. The live path is **drag-drop 12-field JSON**:

- Staff open the case in the SPA and export the 12-field EVA JSON, then drag-drop it into EVA.
- **Photo order (mandatory):** upload **2 preview photos first** (vehicle overview + main-damage
  closeup), then **all** photos in sequence **including those two again**; the overview must show the
  **full registration**; any photo with a person's reflection is excluded.
- When Minotaur ships the patch, switch on REST via D1 (supply the EVA **test** Client ID/Secret to Key
  Vault, flip `EVA_API_ENABLED` in test, pass one test case, then point at live).

**Verify:** one real case round-trips into EVA with the photo order above and the registration visible
on the overview.

## 8. Day-0 smoke

Run **[day0-smoke.md](./day0-smoke.md)** end-to-end (send a test email to each of info@ + engineers@ +
desk@ → Case created → provider matched → parse + EVA fields → Box folder + File Request → staff review
→ EVA export). Confirm the durable `subscriptionMonitorOrchestrator` shows an **unattended** renew
(App Insights `graph-renewal-success`, no manual trigger) — Graph subscription expiries are in the
registry.

## 9. Rollback

If any step fails its verify and can't be corrected forward, stop and follow
**[rollback.md](./rollback.md)** (gate-flip reversals + the pre-cutover pg_dump restore). Every gate set
above is individually reversible with the same `az functionapp config appsettings set` (set back to the
prior value / `delete` the setting); manual case-create remains available throughout.

---

**After any live change here:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) (bump
`lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
`VERIFY_LIVE=1 node verify-all.mjs`.
