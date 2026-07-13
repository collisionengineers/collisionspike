# Consolidated operator checklist

The flat "**what's left for you**" list — every action only the operator can do (supply a secret, click a
button in a live Azure/Entra/Box/Exchange account, grant a role, or make a business decision), each with
the **exact command or portal path** and a verify. The live tracker with the full rationale behind each
item is [`docs/gated.md`](../../gated.md) (item ids **A/B/C/D/E**); the ordered go-live-day subset is
[`runbook.md`](./runbook.md); the gate-state snapshot is [`readiness-matrix.md`](./readiness-matrix.md).

Live numbers, gate values, function counts, the mailbox set and Box/Graph state are **not re-embedded
here** — read them from the registry [`architecture/live-environment.md`](../../architecture/live-environment.md)
(single source [`LIVE_FACTS.json`](../../../LIVE_FACTS.json)) at the time you act.

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there); Exchange-RBAC admin
> is **Windows PowerShell** (`ExchangeOnlineManagement`); Box CLI / Box web / git / node run on
> **Windows**; portal actions are any browser. Each command below is prefixed with its platform.

---

## Legend

- **[MUST]** — do before go-live (blocks the cutover or blocks staff/intake correctness).
- **[FOLLOW]** — safe to do after go-live; the system runs correctly without it (an enhancement, a
  chaser nicety, or a gated-off future path).

---

## MUST — before go-live

### 0. Sign off the data-correction reprocess  ·  **[MUST]** — the gate on the whole cutover

**What / why you:** the DB is the complete record (the Inboxes hold only ~⅓ of processed emails — the
rest are in Deleted Items), so the go-live data fix is an **in-place reprocess** of existing rows through
the fixed classifier, **not** a mailbox wipe-and-rebuild (that was proven non-viable and abandoned). The
reprocess is **blocked on the P2 classifier fix-wave** and must run green with the SPA showing correct
data before any cutover step runs. Sign-off is a **judgement call only you can make** (does the corrected
data look right).

**Do (you, reviewing):** after the agents report P2 green + the reprocess complete, spot-check the SPA
dashboard/inbox/queues against a handful of known cases; confirm no obvious misclassification remains.
Context: [`GO_LIVE_SPRINT_PLAN.md`](./README.md) (P2 → in-place reprocess → P3V).

**Verify:** you are satisfied the on-screen data is correct per current logic — then, and only then, start
step 1.

---

### 1. Upgrade the subscription to Pay-As-You-Go  ·  **[MUST]** — [gated.md A1](../../gated.md)

Standing hard deadline (not a cutover step, but it gates everything): the subscription is an **Azure Free
Trial** (`quotaId FreeTrial_2014-09-01`) and the whole stack disables at the ~30-day mark unless upgraded;
the 12-month free Postgres allowance survives the upgrade.

**Portal:** Azure portal → **Subscriptions → `e6076573-…` → Upgrade** (or **Cost Management + Billing**) →
convert Free Trial to **Pay-As-You-Go**, add a payment method.

**Verify (WSL):** `az account show` prints subscription `e6076573-…`, state **Enabled**, and `quotaId`
is no longer `FreeTrial_2014-09-01`; every resource in `rg-collisionspike-dev` is running.

---

### 2. Assign staff app-roles  ·  **[MUST]** — [gated.md C1](../../gated.md)

Only one staff principal is app-role-assigned; everyone else `403`s until you assign them.

**Portal:** Entra → **Enterprise applications** → the API app (`cespk-api-dev` / `CollisionSpike`; v2
tokens carry `aud` = API client-id `fa2fb28c…`) → **Users and groups → Add user/group** → pick each staff
member → assign **`CollisionSpike.User`** (or **`CollisionSpike.Superuser`** for full-privilege admins).
Do **not** assign `CollisionSpike.Engineer` (defined, not enforced).

**Verify:** each person signs out/in and loads the SPA
(`https://proud-sky-04e318b03.7.azurestaticapps.net`) without a `403`.

---

### 3. Complete the provider corpus — domains + PHA principal  ·  **[MUST]** — [gated.md D3/D4](../../gated.md)

Sender-domain auto-matching is complete only once the remaining domainless providers and the **PHA
(Parkhouse) principal code** are supplied — business knowledge only you hold.

**Do (you supply):**
- The real business domain (or "none") for the remaining domainless providers (**Fairway, Regent, Castle,
  Stallion, Relay**, …) and the public-domain case (**NETWORK HD UK / YM Law → `gmail.com`**).
- The **PHA/Parkhouse principal code** — its insert sits commented in
  `migration/assets/schema/seed/916_provider_domain_corrections.sql`.

**Apply (WSL, via the [postgres.md](../../azure/postgres.md) runbook):** as a reviewed additive seed
delta — transient firewall rule → connect as Entra `digital@` → `SET ROLE csadmin` → `\i` the delta →
drop the rule. A domain serving >1 active provider stays ambiguity-guarded (intermediary path, never a
match key).

**Verify:** the delta header SELECTs show each provider's `known_email_domains` populated and the PHA row
active; the corpus count moves in the registry [`live-environment.md`](../../architecture/live-environment.md).

---

### 4. Confirm the production Box root id  ·  **[MUST]** — [TKT-004](../../tickets/blocked/TKT-004-case-po-generation/TKT-004-case-po-generation.md)

New case folders currently mint under the **dev mirror root `392761581105`**. Before go-live, confirm the
**real production Box root folder** where live case/PO folders should be created (the Case/PO allocator
also uses it as the folder-scan fallback for a brand-new provider).

**Do (you, Box web):** open the intended production root in the Box web app, read the id from the URL
(`https://app.box.com/folder/<id>`), and confirm the Box service account (email in the app's `Config.JSON`)
is a collaborator with **create/upload** on it.

**Apply (WSL) — set the mint root on both apps:**
```
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev  --settings BOX_FOLDER_ROOT_ID=<prod-root-id>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings BOX_FOLDER_ROOT_ID=<prod-root-id>
```

**Verify:** a new intake case mints its Case/PO folder under the production root, not `392761581105`.

---

### 5. Supply the Case/PO real maxima for floor seeding  ·  **[BLOCKED FUTURE WINDOW]** — [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)

The live mint restarted near 001 after the 2026-06-30 reset while the real archive numbering is far ahead.
Full procedure: [`case-po-sequence-cutover.md`](../case-po-sequence-cutover.md) (§ "Future cutover
window"). Do not run the commands below until TKT-178 has the signed/checksummed job spreadsheet,
authenticated/verified production EVA, the exact approved production Archive target plus proven write
scope, backup/restore proof, a frozen approved dry-run hash and a named operator window.

**Do (you supply for that future window):** the approved production Archive inventory and the
authenticated/verified EVA evidence. Test, mirror, configured-default and Viewer-only roots do not
satisfy the production target/write gate.

**Apply (Windows, then WSL):**
```
# Windows — turn the folder listing into reviewable seed SQL (unparseable names are REPORTED, never guessed)
node scripts/cutover/case-po-floor-from-folders.mjs names.txt > seed.sql
```
Review `seed.sql` (resolve every stderr-reported variant), then apply `seed.sql` via the
[postgres.md](../../azure/postgres.md) runbook (`SET ROLE csadmin`). Then **renumber placeholders**:
for each open, non-terminal case whose `case_po` was system-minted pre-cutover, in created order, stamp a
real number via the case-page Set-Case/PO edit (`PATCH /api/cases/{id}` `casePo`) or clear it
(`casePo: ''`) so the next EVA-add assigns it. During the trial, stamp the real number whenever you EVA-add
a case the old way.

**Verify:** `GET /api/cases/next-po?principal=<X>` returns `source: 'floor'` (or a DB max above it) for
every active principal; confirm the next naturally created, operator-designated genuine case lands
above the approved production Archive max. Do not mint a disposable live case for proof.

---

### 6. Finish Outlook filing — cache wait + live move test  ·  **[MUST]** — [gated.md B4](../../gated.md)

The `Application Mail.ReadWrite` Exchange-RBAC grant landed 2026-07-03 and `OUTLOOK_MOVE_ENABLED=true` on
both apps; only the permission-cache wait and **your own live test** remain (you asked to test this
yourself — no automated live move will be run).

**Do (you):**
1. **Wait** for the Exchange-RBAC permission cache (~30 min–2 h; leave the app idle, don't poll). A move
   clicked too early `403`s / reports `failed` — retry after the wait.
2. **Live-test:** click "File to …" on a test row in the SPA inbox.

**Verify:** the email moves in Outlook, the row reads "Filed to …" and flips to Handled, and `audit_event`
carries `outlook_move_requested` → `outlook_moved`. Record the result in
[TKT-054/verification.md](../../tickets/done/TKT-054-ui-work/verification.md).

---

### 7. Enable the agent UI verification sweep  ·  **[MUST]** — sprint P4 gate ([GO_LIVE_SPRINT_PLAN.md](./README.md) §P4)

The P4 "UI is actually CLEAN" mandate runs a full browser sweep of the deployed SPA (all routes + drawers)
via **claude-in-chrome**. The agent can drive the browser only if you **pick/connect a Chrome browser** and
grant the extension site permission — a one-time human enablement.

**Do (you, Windows Chrome):**
1. Open Chrome with the **claude-in-chrome** extension installed, and **sign in to the SPA**
   (`https://proud-sky-04e318b03.7.azurestaticapps.net`) with a role-assigned staff account (from step 2).
2. In the extension, **grant site-level permission** for `proud-sky-04e318b03.7.azurestaticapps.net` so the
   agent can open tabs and read the page.
3. Tell the agent which connected browser to use when it starts the sweep.

> **Safety:** the sweep is read-only against a live SPA — the agent will **never** submit the remove-case
> dialog (open/cancel only) and makes no destructive clicks; "dismiss" writes a DB triage state only.

**Verify:** the agent reports the browser connected and completes the 11-route sweep with screenshots.

---

## FOLLOW — safe after go-live

### 8. Box archive reconstruction — root ids + Viewer grant + listing  ·  **[FOLLOW]** — [gated.md D11 steps 2–4](../../gated.md)

Rung-1 any-status linking already acts (`RETRO_CASE_ENABLED=true`). This activates the additional **Box
reconstruction rung** (R2) — do it **only after** the Case/PO sequence alignment in step 5, and it can
follow go-live.

**Do (you, Box web + Admin Console):**
1. **Read the real archive root id(s)** from the Box web app URL (`https://app.box.com/folder/<id>` — the
   historical archive, NOT the live mirror root). Multiple per-year/per-provider roots are fine
   (comma-separated).
2. **Grant the Box service account Viewer** on each root: Box Admin Console → the folder → **Share** →
   invite the service-account email from the app's `Config.JSON` (read-only by scope lock: list/search/
   download — never create/upload/delete).
3. **Sanity-check 5–10 folders:** are they named EXACTLY the Case/PO (a suffixed `CCPY26050 - Smith`
   variant needs a flagged prefix-match arm)? Do they reliably contain the original instruction `.eml`?

**Apply (WSL):**
```
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev     --settings RETRO_BOX_ARCHIVE_ROOT_IDS=<id,id,…>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_READONLY_ROOT_IDS=<id,id,…>
# optional R3 mailbox-search rung — its own kill switch, needs nothing else:
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev     --settings RETRO_OUTLOOK_SEARCH_ENABLED=true
```

**Verify:** `az functionapp config appsettings list` readback shows the ids on both apps; a facade
`box/search` under a configured root returns 200; a known un-linked archived case reconstructs. Tracker:
[TKT-058/verification.md](../../tickets/done/TKT-058-retro-case-creation/verification.md).

---

### 9. Build the File Request template + wire its id  ·  **[FOLLOW]** — [gated.md D2](../../gated.md)

`BOX_FILEREQUEST_ENABLED` is already true, but the template id is empty → the File-Request copy no-ops
(image-chaser nicety, not a blocker).

**Do (you, Box web):** hand-build the template File Request per
[`box-activation.md`](../../azure/box-activation.md) §5, read its id.

**Apply (WSL):**
```
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev  --settings BOX_FILE_REQUEST_TEMPLATE_ID=<id>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings BOX_FILE_REQUEST_TEMPLATE_ID=<id>
```
(The **`FILE.UPLOADED` webhook** subscription is created by the agent via the facade — [box-activation.md](../../azure/box-activation.md) §5 / [GO_LIVE_SPRINT_PLAN.md](./README.md) P6.)

**Verify:** a new intake case gets a File Request copied onto its Box folder; an upload into it fires
`FILE.UPLOADED` → the webhook registers an evidence row → the case advances.

---

### 10. Supply EVA test credentials  ·  **[FOLLOW]** — [gated.md D1](../../gated.md)

The **live EVA path is drag-drop 12-field JSON** and needs **no credentials** — staff export from the SPA
and drag-drop into EVA (photo order: **2 preview photos first** [vehicle overview + main-damage closeup],
then **all** photos in sequence **including those two again**; full registration visible on the overview;
any photo with a person's reflection excluded). The Sentry **REST** path stays gated
(`EVA_API_ENABLED` absent) because Minotaur's API accepts only **one principal code** per submission — it
waits on Minotaur's patch, so the creds are a follow-up.

**Do (you), when REST unblocks:** place the EVA **test** Client ID + Secret in the EVA Function's Key Vault
(never in code), flip the EVA gate on in **test** only, submit one test case and confirm the photo order,
then point at **live** EVA.

**Verify:** one real case round-trips into EVA with the correct photo order and visible registration.

---

### 11. Policy / legal inputs + evidence-store hardening  ·  **[FOLLOW]** — [gated.md E1/E2](../../gated.md)

Business/legal decisions only you can make; they keep the data-protection posture open but block **no**
runtime intake. Supply the **retention period** (+ anonymise-vs-delete policy), the **lawful basis** for
DVSA/DVLA enrichment + valuation, the **legal-hold** rule, **ICO registration** + DVLA data-use terms, and
the **per-AI-gate production sign-off** for any future AI gate. Before any purge/disposition job is armed,
harden the evidence store `cespkevidstdev01` (blob soft-delete + versioning + container-delete-retention)
and the Key Vaults (purge-protection) — a privileged live change ([gated.md E1](../../gated.md)).

---

> **After any live change above:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) (bump
> `lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
> `VERIFY_LIVE=1 node verify-all.mjs`.
