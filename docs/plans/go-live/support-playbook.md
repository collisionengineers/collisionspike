# Support / on-call playbook

Day-2 steady-state triage: **common live failure → the KQL/`az` that confirms it → the fix.** This takes
over once [day0-smoke.md](./day0-smoke.md) has passed and the system is in staff hands. Each entry names
the exact query or command and the owning fix; deeper procedure lives in the Azure playbooks
[docs/azure/diagnose.md](../../azure/diagnose.md) (triage flow) and
[docs/azure/logs-kql.md](../../azure/logs-kql.md) (reading App Insights).

Live numbers, gate **values**, the mailbox set, Box root id and Graph subscription expiries are **not
re-embedded here** — read them from the registry
[architecture/live-environment.md](../../architecture/live-environment.md) (single source
[LIVE_FACTS.json](../../../LIVE_FACTS.json)) when triaging. This doc names gate/resource **identifiers**,
not their current values.

> **Anti-churn doctrine (from [CLAUDE.md](../../../CLAUDE.md)).** Two strikes → stop: if the same `az`/KQL
> op fails twice, invoke the matching `azure:*` skill or `microsoft-docs` to learn *why* before a third try.
> For anything multi-step, dispatch the read-only **azure-diagnostician** agent rather than debugging in the
> main loop.

## Before you query — the two traps

- **Platform routing.** `az` / KQL / `psql` run from **WSL2 Ubuntu** (az logged in there). Exchange-RBAC
  admin is **Windows PowerShell** only. State the platform per command.
- **Windows `az.cmd` mangles inline KQL** (parens, `length(@)`). **Write the query to `q.kql` and pass it
  by reference**, or use `mcp__azure__monitor`:
  ```bash
  az monitor app-insights query --app <component> -g rg-collisionspike-dev --analytics-query "@q.kql"
  ```
- **Each app has its OWN App Insights component** (registry `appInsightsComponents`): `--app cespk-api-dev`
  for Data-API telemetry, `--app cespk-orch-dev` for orchestration/intake, `--app cespike-parser-ai-dev`
  for the parser + retained Python functions, `--app cespkocr-ai-dev` for OCR. Querying the wrong component
  returns nothing and looks like an outage — confirm the component name against the registry first.
- **"Missing" rows are usually sampling**, not a real gap (Free-SKU Log Analytics also ages out in ~24–48h).
  Query soon; don't conclude "it didn't run" from an empty result — see
  [logs-kql.md](../../azure/logs-kql.md).
- **DB reads MUST use `SET ROLE csadmin`.** The tables carry `FORCE ROW LEVEL SECURITY`; a read as any
  non-owner (or `cespk_app` without `app.role`) is filtered to **0 rows** and looks like data loss. Connect
  per [postgres.md](../../azure/postgres.md) (transient firewall rule → Entra `digital@` token → `psql` →
  `SET ROLE csadmin;`), drop the firewall rule on exit.

---

## Intake stopped — no new cases (Graph webhook / intake dead · subscription expiry / renewal)

The single highest-severity page. Intake rides **Graph PUSH change-notification subscriptions** kept alive
by the durable `subscriptionMonitorOrchestrator` (a plain timer can't wake the scale-to-zero FC1 app; the
`graph-renew` NCRONTAB timer is only a backstop). Two distinct causes:

### Cause A — subscriptions lapsed / not renewing

**Symptom.** No `inbound_email` rows for an unusually long window; nothing arriving from any mailbox.

**Confirm — monitor Running + subscriptions in-date (WSL):**
```bash
curl -s -X POST "https://cespk-orch-dev.azurewebsites.net/api/graph-renew?code=$(az functionapp keys list -g rg-collisionspike-dev -n cespk-orch-dev --query functionKeys.default -o tsv)"
```
Expect JSON `monitor.status = "Running"` and one active subscription per production mailbox, each
`expirationDateTime` in the future (compare to the expiries in the registry). Then confirm an **unattended**
renew has fired (`q.kql`, `--app cespk-orch-dev`):
```kusto
customEvents | where name == "graph-renewal-success" | where timestamp > ago(24h) | order by timestamp desc
```

**Fix.** The `POST /api/graph-renew` above **is** the immediate lever — it runs `runSubscriptionMaintenance`
(create-missing + renew-all) synchronously. If `monitor.status` is not Running, that call re-bootstraps the
singleton. Belt-and-braces (cost-flagged, not enabled by default) is the always-ready lever in the registry
`subscriptionRenewalRisk.note`. **Known gap:** a mailbox *removed* from `GRAPH_INTAKE_MAILBOXES` is **not**
auto-pruned — its old subscription must be deleted by hand (Graph `DELETE /subscriptions/{id}`) until the
prune step lands ([gated.md B / GO_LIVE_SPRINT_PLAN P7](../../gated.md)).

### Cause B — `graph-webhook` 499 / cold-start aborts

**Symptom.** Intake is *mostly* flowing but some notifications are dropped; intermittent gaps.

**Confirm** (`q.kql`, `--app cespk-orch-dev`):
```kusto
requests | where timestamp > ago(1h) | where name has "graph-webhook"
| summarize count() by resultCode, bin(timestamp, 5m) | order by timestamp desc
```
A burst of `499` / Kestrel `BadHttpRequestException` on cold start is the **known residual** (present in the
pre-deploy baseline — not a regression; registry `appInsightsComponents.note`).

**Fix.** No action for isolated misses — **Graph re-delivers** on a non-2xx, so the message is absorbed on
retry. Only escalate if the 499 rate climbs sustainedly (→ always-ready-instance decision, cost note in
GO_LIVE_SPRINT_PLAN P7). Cross-check the case actually failed to land with the day-0 intake query in
[day0-smoke.md](./day0-smoke.md) § 1 before treating a single 499 as a lost case.

**Deeper triage:** [diagnose.md](../../azure/diagnose.md) (note: *orch registered 0 functions* is a
different failure — the esbuild ESM→CJS crash, fixed via `build-orch.cjs`; confirm the live function count
against the registry, `0` is the crash signature).

---

## A case stuck in a status (parser / enrichment 5xx · the un-wrapped enrich tail)

**Symptom.** A case was created but never advances past `ingested` / `needs_review`; EVA fields blank or
enrichment (make/model, MOT mileage) missing.

**Confirm — find the run, then its errors.** Get the orchestration id, then trace it end-to-end
(`q.kql`, `--app cespk-orch-dev`):
```kusto
traces | where operation_Id == "intake-<safeMessageId>" | order by timestamp asc
```
Parser / enrichment 5xx surface in their **own** component (`--app cespike-parser-ai-dev`):
```kusto
requests   | where timestamp > ago(1h) | where cloud_RoleName in ("cespike-parser-dev","cespkenrich-fn-gi62sd") | where toint(resultCode) >= 500
exceptions | where timestamp > ago(1h)
```

**Fix by symptom:**
- **`enrich` is the un-wrapped tail step** of `intakeOrchestrator` (step 6): a sustained enrichment 5xx
  fails the instance *after* the case is created, and a restart short-circuits on `already_ingested` — so
  the case exists but enrichment never ran. Re-trigger enrichment for that case manually (per the case's
  admin action / the driver's per-child retry); it is **not** an intake outage.
- **Parser returns empty `accident_circumstances`** on legacy table-heavy `.doc` (FC1 can't host
  LibreOffice) — the orchestration email-body supplement bridges QDOS; a genuinely empty parse is a
  document-format limit ([ROADMAP Later — parser container](../../../ROADMAP.md)), not a stuck-status bug.
- **Status logic** (`new_email → ingested → needs_review → ready_for_eva → eva_submitted`) lives in the
  Data API status machine; if the case has ≥2 EVA images incl. an `overview`+`damage_closeup` but won't
  reach `ready_for_eva`, check the evidence rows landed (Box path below) before suspecting the machine.

---

## Box facade / webhook — 4xx from `cespkbox-fn-v76a47`

The `box-webhook` Function mints its own Box token (JWT Server Auth; whole `Config.JSON` in Key Vault
`cespkboxkvv76a47/box-config-json`) and is **scope-locked** to the mirror root (`BOX_FOLDER_ROOT_ID` gate,
value in the registry). Box is an additive one-way mirror — Postgres stays the record.

**Confirm — reproduce the call (WSL):**
```bash
BOXKEY=$(az functionapp keys list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --query functionKeys.default -o tsv)
curl -s -i "https://cespkbox-fn-v76a47.azurewebsites.net/api/box/folders/<BOX_FOLDER_ROOT_ID>/items" -H "x-functions-key: $BOXKEY"
```
And its own telemetry (`q.kql`, `--app cespike-parser-ai-dev` — the box-webhook fn logs there):
```kusto
requests | where timestamp > ago(1h) | where cloud_RoleName has "box" | where toint(resultCode) >= 400
```

**Fix by status code:**
- **401 (token mint failed).** The `Config.JSON` KV secret is unreadable or the keypair was rotated
  Box-side. Confirm the box-fn managed identity still resolves `cespkboxkvv76a47/box-config-json`
  ([secrets-keyvault.md](../../azure/secrets-keyvault.md)); re-check the app is Admin-authorized in the Box
  Developer Console.
- **403 (scope lock).** The requested folder id is **outside** the allowed root — by design. Re-check the
  target id against the `BOX_FOLDER_ROOT_ID` / read-only-root gate values in the registry; the lock is a
  guard, not a bug.
- **409 on folder create = silent adoption.** `box_client.py create_folder()` returns the *existing*
  folder id on `item_name_in_use` (`outcome='reused'`) — a replayed/duplicate case can attach evidence to a
  stale folder. If a case's evidence looks mis-filed, verify `case_.box_folder_id` is a fresh folder and not
  a reused one under a holding folder.
- **Upload fired but no evidence row** = the `FILE.UPLOADED` webhook isn't subscribed or
  `BOX_FILE_REQUEST_TEMPLATE_ID` is empty (File-Request copy no-ops) — [runbook.md](./runbook.md) step 6 +
  [gated.md D2](../../gated.md). A non-2xx from the facade re-delivers on **Box's own retry**.

Reference: the `box-rest-api` skill (op contract, HMAC webhook order, limits).

---

## EVA export

EVA **REST stays gated** (`EVA_API_ENABLED` absent — Minotaur's Sentry API routes only **one** principal
code per submission). The live path is **drag-drop 12-field JSON**, so a failure here is almost never an EVA
outage — it is the payload we produced.

**Symptom.** EVA rejects the dragged JSON, or rejects the image set.

**Confirm.** There is no server call to trace — the export is built by the Data API `parser-eva-fields`
layer and dropped into EVA by hand. Re-open the case in the SPA, re-export, and inspect the 12-field JSON
shape against the contract (the `eva-sentry-api` skill / ADR reference).

**Fix.**
- **Shape rejected** → a `api/src/lib/parser-eva-fields.ts` mapping issue (a field missing/mis-typed for
  that provider), not EVA. The `EVA (Engineers)` mislabel class is fixed (parser `engine-v2.6` +
  Data-API denylist + the D9 no-op data leg) — if it recurs, it is a new provider row, not the old bug.
- **Image set rejected** → **photo order is mandatory**: 2 preview photos first (vehicle overview +
  main-damage closeup), then **all** photos in sequence **including those two again**; the overview must
  show the **full registration**; any photo showing a person's reflection is **excluded**. A short/mis-ordered
  set is the usual cause.

Switching EVA REST on later is operator item [gated.md D1](../../gated.md) (supply the EVA test creds first).

---

## AI chat — errors are honest by design (`AI_CHAT_ENABLED`)

The read-only helper (`POST /api/assistant/chat`, gate `AI_CHAT_ENABLED`) calls the **keyless** AOAI gpt-5
deployment on `digital-3339-resource` with three read-only tools. It is built to **surface the real error**
rather than fabricate an answer — an error in the drawer is the feature working, not a silent-wrong-answer.

**Symptom.** The drawer shows an error / empty stream, or the gate probe is off.

**Confirm — gate + route (WSL):**
```bash
az functionapp config appsettings list -g rg-collisionspike-dev -n cespk-api-dev --query "[?name=='AI_CHAT_ENABLED']"
curl -s -i https://cespk-api-dev.azurewebsites.net/api/gates/ai-chat   # aiChatGate; 401 unauth = fail-closed, not broken
```
Errors (`q.kql`, `--app cespk-api-dev`):
```kusto
exceptions | where timestamp > ago(1h) | where operation_Name has "assistant"
traces     | where timestamp > ago(1h) | where message has "assistantChat" | where customDimensions.LogLevel == "Error"
```

**Fix by cause:**
- **429 / throttle** (gpt-5 GlobalStandard TPM/RPM limits — headroom in registry `foundry.quotaHeadroomUksouth`).
  Transient; the drawer surfaces it honestly. Only escalate on sustained 429 → request a quota bump
  (`azure:microsoft-foundry`). Cost at staff concurrency is trivial.
- **401/403 to AOAI (auth).** The api-app managed identity (principal `51dcdd5f-…`) must hold **Cognitive
  Services OpenAI User** on `digital-3339-resource` (registry `foundry.miGrants`; granted 2026-07-05). If
  missing, re-grant via `azure:azure-rbac`. Keyless by design — there is no key setting to check.
- **Route 500 vs 401.** `401` unauth is correct fail-closed behaviour (Bearer-only, `aud = api://fa2fb28c…`).
  A `500` on a signed-in call = a real server error → the exceptions query above.

> **Data residency (restate when asked):** gpt-5 is a **Global** deployment — inference may process outside
> the UK; data-at-rest stays in-region. Accepted for `EMAIL_AI_ENABLED`, same posture here.

---

## 403 for a staff user (app-role not assigned)

**Symptom.** A specific staff member gets **403** on every `/api/*` call / can't load the app, while others
work. This is **not** an outage — it is the enforced Entra app-role.

**Confirm.** The SPA/API authorise via two enforced app roles, **`CollisionSpike.User`** and
**`CollisionSpike.Superuser`** (Superuser = full privilege; legacy `CollisionSpike.Admin` still accepted).
Only assigned principals get in; everyone else 403s. The user's decoded token simply won't carry a role
claim.

**Fix** ([gated.md C1](../../gated.md), Entra directory op — operator only):
1. Entra → **Enterprise applications** → the `cespk-api-dev` / `CollisionSpike` API app (v2 tokens carry
   `aud` = the API client-id GUID `fa2fb28c…`).
2. **Users and groups → Add user/group** → pick the person → assign **`CollisionSpike.User`** (or
   **`CollisionSpike.Superuser`** for a full-privilege admin). Do **not** assign the placeholder
   `CollisionSpike.Engineer` for access — it's defined but not enforced.
3. Have them **sign out/in** so a fresh token carries the role; confirm the app loads without 403.

---

## DB-auth failure — every page 500 (KV secret / versioned ref)

**Symptom.** Auth itself is fine (`401` on no-auth) but **every** signed-in page returns `500
{error:internal}` — a whole-app data failure, not one route.

**Confirm** (`q.kql`, `--app cespk-api-dev`):
```kusto
exceptions | where timestamp > ago(30m) | where outerMessage has_any ("password authentication","28P01","ECONNREFUSED","role")
```
A Postgres `28P01 password authentication failed` for `cespk_app` is the signature.

**Fix.** The Data API connects as the non-owner login **`cespk_app`** whose password is a **Key Vault
reference** `cespk-pg-kv-dev/cespk-app-password` (resolved by the api-app managed identity; the DB app-role
is set per-connection via `-c app.role=staff` / `PGAPPROLE`). The footgun: a **version-pinned** KV reference
keeps serving the **old** password after a rotation → login fails → 500. Ensure the app setting uses a
**versionless** `@Microsoft.KeyVault(...)` reference (or the current version is the one enabled), then
restart `cespk-api-dev` so it re-resolves — [secrets-keyvault.md](../../azure/secrets-keyvault.md).

Two related whole-app-500 causes (from [diagnose.md](../../azure/diagnose.md)): a `jose` token error
mapped to 500 instead of 401 (token-audience hardening), and — after a deploy — **every route 404** =
the zip shipped without `node_modules` (fix in [deploy.md](../../azure/deploy.md)). For **operator** DB
access, note the separate stale-rotation footgun on `csadmin` `pg-admin-password` (two versions) — auth via
the Entra `azure_pg_admin` path instead ([postgres.md](../../azure/postgres.md)).

---

## Dashboard / queue counts disagree

**Symptom.** A pipeline card and its named queue show **different** totals for the same queue (the
123-vs-124 class), or same-VRM twins render as duplicate rows.

**Confirm — the real number (WSL, `csadmin`):**
```sql
SET ROLE csadmin;
SELECT status_code, count(*) FROM case_ GROUP BY status_code ORDER BY status_code;
```

**Fix.** This is a **single-source** contract, not a live-data bug: `statusToStage`
(`api/src/functions/dashboard.ts`) must agree with `filterQueue` (`packages/domain/src/model/queues.ts`) —
`new_email`/`ingested` fold into NOT READY in both. If a card and its `/queue/*` list disagree after the P4
single-source fix, it's a regression in one of those two, not a DB problem. Twins collapse to a count chip
(`openVrmTwins`); duplicate rows = the collapse regressed. The DB rollup above is the arbiter of the true
number.

---

## Retro reconstruction — a link that didn't happen

**Symptom.** An unmatched billing / case_update / cancellation / query email that clearly belongs to a case
neither links nor records a failure. `RETRO_CASE_ENABLED` is on; rung-1 any-status linking is **acting**.

**Confirm / drive (WSL).** Find the candidate, then run the keyed starter:
```sql
SET ROLE csadmin;
SELECT id, source_mailbox, received_on FROM inbound_email
WHERE case_id IS NULL AND category_code IN (100000005,100000006) ORDER BY received_on DESC LIMIT 5;
```
```bash
ORCHKEY=$(az functionapp keys list -g rg-collisionspike-dev -n cespk-orch-dev --query functionKeys.default -o tsv)
curl -s -X POST "https://cespk-orch-dev.azurewebsites.net/api/retro-case?code=$ORCHKEY" -H 'content-type: application/json' -d '{"inboundEmailId":"<id>"}'
```

**Fix / expectation.** The row should gain a non-null `case_id` (matched on `case_ref`/`vrm`/thread,
**any** status incl. terminals — the billing-email fix), **or** an honest `retro_reconstruction_failed` /
ambiguity-flagged `audit_event` (never a wrong guess). A starter 500 → trace `--app cespk-orch-dev` for
`retroCaseOrchestrator`. The **Box reconstruction rung stays dark** until the D11 archive roots + Case/PO
sequence alignment land ([gated.md D11](../../gated.md),
[case-po-sequence-cutover.md](../case-po-sequence-cutover.md)) — rung-1 linking does **not** depend on it.

---

## Standing environment risk (not a per-incident fix)

The subscription is on the **Azure Free Trial** and **disables the entire stack** at the ~30-day mark unless
upgraded to Pay-As-You-Go ([gated.md A1](../../gated.md)) — the 12-month free Postgres allowance survives the
upgrade. If multiple resources go unreachable at once with no code change, check the subscription state
(`az account show`) before triaging any single service.

---

## Escalation & after-action

- Multi-step / unclear root cause → dispatch the read-only **azure-diagnostician** agent (it pulls
  KQL/AppLens/health and returns root-cause + fix; it applies nothing) rather than looping `az`.
- Confirm any Microsoft behaviour/limit/error against `microsoft-docs` **before** a third retry.
- **After any live change made during triage:** update [LIVE_FACTS.json](../../../LIVE_FACTS.json) (bump
  `lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
  `VERIFY_LIVE=1 node verify-all.mjs`.

Related: [day0-smoke.md](./day0-smoke.md) (first-hour checks that map each failure back here) ·
[runbook.md](./runbook.md) (cutover) · [rollback.md](./rollback.md) (undo a bad step) ·
[readiness-matrix.md](./readiness-matrix.md) (gate state).
