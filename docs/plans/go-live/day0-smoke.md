# Day-0 smoke checks

The **first-hour smoke pack** — run immediately after the [runbook.md](./runbook.md) cutover completes,
before staff are told the system is live. Each check names its **exact command/route**, the **expected
result**, and a **what-if-fail** pointer into [support-playbook.md](./support-playbook.md). Work top to
bottom; a failure that can't be corrected forward means stop and consider [rollback.md](./rollback.md).

Live numbers, gate values, the mailbox set, Box root id and Graph subscription expiries are **not
re-embedded here** — read them from the registry
[`architecture/live-environment.md`](../../architecture/live-environment.md) (single source
[`LIVE_FACTS.json`](../../../LIVE_FACTS.json)) at smoke time.

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there); the browser checks
> run on **Windows** against the deployed SPA. State the platform per command.

## How to run each kind of check

- **DB reads MUST use `SET ROLE csadmin`.** The tables carry `FORCE ROW LEVEL SECURITY`; a read as any
  non-owner role (or as `cespk_app` without `app.role`) is **filtered to 0 rows** — you will think intake
  is dead when it isn't. `csadmin` (table owner) bypasses RLS, so it reads the true unfiltered state. Connect
  per the [postgres.md](../../azure/postgres.md) runbook (transient firewall rule → Entra `digital@` token →
  `psql` → `SET ROLE csadmin;`), and drop the firewall rule on exit.
- **Data-API routes (`/api/*`) are Bearer-only** (Entra JWT, `403`/`401` fail-closed). Drive them from a
  **signed-in SPA session** (a `CollisionSpike.User`/`Superuser` staff login on
  `https://proud-sky-04e318b03.7.azurestaticapps.net`) — read the value off the UI, or copy the request from
  browser DevTools. Raw `curl` needs a real MSAL access token (`aud = api://fa2fb28c…`); an unauthenticated
  `curl` returning `401` only proves the route is fail-closed, not that data is right.
- **Facade + keyed starters** (`cespkbox-fn-v76a47`, `POST /api/retro-case`) authenticate with a
  **function key**: `az functionapp keys list -g rg-collisionspike-dev -n <app> --query functionKeys.default -o tsv`,
  passed as the `x-functions-key` header.

---

## 1. Intake is alive — a real email creates a case

The load-bearing check: a live email lands as an `inbound_email` row and (for new work) a `case_`.

**Do it.** Send one test email to **each** intake mailbox in the production set (registry
[`live-environment.md`](../../architecture/live-environment.md)) from an address whose domain maps to a
known provider, with a PDF instruction + one image attached.

**Verify (WSL, `SET ROLE csadmin`):**
```sql
SET ROLE csadmin;
SELECT source_mailbox, received_on, category_code, case_id
FROM inbound_email
WHERE received_on > now() - interval '15 minutes'
ORDER BY received_on DESC;
```

**Expected:** one fresh row per test send (source_mailbox = the mailbox you hit), `category_code` a
sensible classification, and for the new-work send a non-null `case_id`. Cross-check the case:
```sql
SELECT case_po, status_code, work_provider_id, box_folder_id
FROM case_ WHERE id = '<case_id>';
```
`status_code` should be `new_email`/`ingested`, `work_provider_id` matched by sender domain, EVA fields
pre-filled with provenance, `box_folder_id` set (see check 3).

**If it fails:** zero rows as `csadmin` = intake genuinely not firing → [support-playbook.md](./support-playbook.md)
§ *Graph webhook / intake dead* (check the `graph-webhook` `499`/cold-start burst in App Insights and the
subscription health in check 2). Zero rows only when **not** `csadmin` = an RLS/role mistake, not an outage.

## 2. Graph subscriptions healthy + renewing

Intake rides **Graph PUSH change-notification subscriptions**, kept alive by the durable
`subscriptionMonitorOrchestrator` (a plain timer can't wake the scale-to-zero FC1 app).

**Verify — monitor is Running (WSL):**
```bash
curl -s -X POST "https://cespk-orch-dev.azurewebsites.net/api/graph-renew?code=$(az functionapp keys list -g rg-collisionspike-dev -n cespk-orch-dev --query functionKeys.default -o tsv)"
```
**Expected:** JSON with `monitor.status = "Running"` and one active subscription per production mailbox,
each `expirationDateTime` in the future (compare against the expiries in the registry
[`live-environment.md`](../../architecture/live-environment.md)).

**Verify — an *unattended* renew has fired (KQL, App Insights component `cespk-orch-dev`):**
```kql
customEvents | where name == "graph-renewal-success" | where timestamp > ago(24h) | order by timestamp desc
```
**Expected:** at least one `graph-renewal-success` at the ~6h durable-timer cadence with **no** matching
manual `graph-renew` HTTP call just before it (the operator watch-item from the renewal fix).

**If it fails:** `monitor.status` not Running, an expiry inside ~24h, or zero unattended renewals →
[support-playbook.md](./support-playbook.md) § *Graph subscription expiry / renewal*. Backstop lever: the
retained `graph-renew` timer + the manual `POST /api/graph-renew` above force a renew immediately.

## 3. Box folder-create + `FILE.UPLOADED` path

Every new case mints a Case/PO-named Box folder (additive one-way mirror; Postgres stays the record), and
an upload into its File Request must fire `FILE.UPLOADED` → the `box-webhook` Function → evidence row.

**Verify — folder minted (WSL):** confirm the check-1 case's `box_folder_id` resolves, and it appears under
the mirror root (the `BOX_FOLDER_ROOT_ID` gate value — registry):
```bash
BOXKEY=$(az functionapp keys list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --query functionKeys.default -o tsv)
curl -s "https://cespkbox-fn-v76a47.azurewebsites.net/api/box/folders/<BOX_FOLDER_ROOT_ID>/items" -H "x-functions-key: $BOXKEY"
```
**Expected:** HTTP 200; the listing contains a folder named exactly the case's `case_po`.

**Verify — upload → webhook → evidence:** upload one test image into that case's File Request (Box UI, or the
facade `POST /api/box/folders/<id>/files`). Then, as `csadmin`:
```sql
SET ROLE csadmin;
SELECT kind, source, created_on FROM evidence WHERE case_id = '<case_id>' ORDER BY created_on DESC LIMIT 5;
```
**Expected:** a new `evidence` row within a minute of the upload, an `box_upload_received` `audit_event`,
the case status re-evaluated, and the image visible on the case in the SPA.

**If it fails:** a 200 folder-list but no evidence row after upload = the `FILE.UPLOADED` webhook isn't
subscribed or the template File Request id is empty → [support-playbook.md](./support-playbook.md) §
*Box facade / webhook* (and [runbook.md](./runbook.md) step 6 — `BOX_FILE_REQUEST_TEMPLATE_ID` + the
webhook subscription). A non-2xx from the facade re-delivers on Box's own retry.

## 4. EVA drag-drop export

EVA REST stays gated (`EVA_API_ENABLED` absent — Minotaur one-principal-code limit); the live path is
**drag-drop 12-field JSON**.

**Do it.** Open the check-1 case in the SPA → export the 12-field EVA JSON → drag-drop it into EVA.

**Expected:** EVA accepts the payload. **Photo order is mandatory:** 2 preview photos first (vehicle
overview + main-damage closeup), then **all** photos in sequence **including those two again**; the overview
must show the **full registration**; any photo with a person's reflection is excluded.

**If it fails:** EVA rejects the JSON shape or the image set → [support-playbook.md](./support-playbook.md)
§ *EVA export*. The 12-field contract + photo rules are the [eva-sentry-api](../../adr/) reference; a
malformed export is a Data-API `parser-eva-fields` issue, not an EVA outage.

## 5. AI chat drawer answers a question

The read-only helper (`AI_CHAT_ENABLED=true`, keyless AOAI gpt-5, three read-only tools) is the Sparkles
drawer off the SPA AppShell header.

**Do it.** In a signed-in SPA session open the AI chat drawer and ask a grounded question, e.g. *"How many
cases are in the not-ready queue?"* and *"What does status ready_for_eva mean?"*

**Expected:** a streamed answer; the queue-count answer matches the dashboard (check 6); the glossary answer
is correct; the model **refuses** any mutation request (read-only by design). An `assistant_chat`
`audit_event` is written per exchange (lengths + tool calls, not transcripts).

**If it fails:** 500 or an empty stream → [support-playbook.md](./support-playbook.md) § *AI chat*. The
common cause is the api-app managed identity missing **Cognitive Services OpenAI User** on
`digital-3339-resource` (registry `foundry.miGrants`) or `AI_CHAT_ENABLED` not `true`
(`az functionapp config appsettings list -g rg-collisionspike-dev -n cespk-api-dev`).

## 6. Dashboard counts reconcile

The pipeline cards and the queue lists must show the **same** number for the same queue (the 123-vs-124
class of defect).

**Do it (signed-in SPA):** open the dashboard; note the NOT READY / needs-action counts on the pipeline
cards, then open each named queue (`/queue/not-ready`, etc.) and count the rows.

**Verify — the number is real (WSL, `csadmin`):**
```sql
SET ROLE csadmin;
SELECT status_code, count(*) FROM case_ GROUP BY status_code ORDER BY status_code;
```
**Expected:** the pipeline card, the queue list length, and the status rollup agree (NEW folds into NOT
READY per the single-source fix); no queue shows a different total in two places; same-VRM twins render as a
collapsed count chip, not silent duplicate rows.

**If it fails:** a card and its queue disagree, or a count doesn't match the DB rollup →
[support-playbook.md](./support-playbook.md) § *Dashboard / queue counts* (the `statusToStage` vs
`filterQueue` single-source contract).

## 7. Retro rung-1 links a billing email

`RETRO_CASE_ENABLED=true` — an unmatched billing/case_update/cancellation/query email carrying a provider
reference or VRM links to its case **whatever the case's status** (terminals included), ambiguity flagged
never guessed, failures audited `retro_reconstruction_failed`.

**Find a candidate (WSL, `csadmin`):**
```sql
SET ROLE csadmin;
SELECT id, source_mailbox, received_on FROM inbound_email
WHERE case_id IS NULL AND category_code IN (100000005,100000006)  -- case_update / cancellation
ORDER BY received_on DESC LIMIT 5;
```
**Drive it (keyed starter, WSL):**
```bash
ORCHKEY=$(az functionapp keys list -g rg-collisionspike-dev -n cespk-orch-dev --query functionKeys.default -o tsv)
curl -s -X POST "https://cespk-orch-dev.azurewebsites.net/api/retro-case?code=$ORCHKEY" \
  -H 'content-type: application/json' -d '{"inboundEmailId":"<id>"}'
```
**Verify:** re-run the SELECT for that `id` —

**Expected:** the row now carries a non-null `case_id` (linked to the case that owns its reference/VRM/thread),
**or** an honest `retro_reconstruction_failed` / ambiguity-flagged `audit_event` (never a wrong guess).

**If it fails:** the starter 500s, or a clearly-matchable billing email neither links nor records a failure →
[support-playbook.md](./support-playbook.md) § *Retro reconstruction*. Note the **Box reconstruction rung
stays dark** until the D11 archive roots + Case/PO sequence alignment land
([runbook.md](./runbook.md) step 5, [gated.md D11](../../gated.md)) — rung-1 linking does **not** depend on
it.

---

## Sign-off

All seven green (or each amber explained) = day-0 smoke passed; hand the system to staff and move to
steady-state [support-playbook.md](./support-playbook.md). Any red that can't be corrected forward →
[rollback.md](./rollback.md).

**After any live change made during smoke:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) (bump
`lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
`VERIFY_LIVE=1 node verify-all.mjs`.
