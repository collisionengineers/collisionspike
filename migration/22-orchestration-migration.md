# 22 — Orchestration migration

The 17 Power Automate flows → **Durable Functions + Storage Queues**, and the Outlook intake trigger →
a **Microsoft Graph change-notification subscription** on the shared mailbox. This is the operator's
chosen path (D2) — cheapest to run, at the cost of building the Graph plumbing the managed Outlook
connector gave for free. **Phase P4.** Lives in a second Flex Consumption Function App
(`cespk-orch-dev`), in **TypeScript/Node 20** (D10) so its activities import the same shared
domain/contract package (`@cs/domain`) the API + frontend import (workspace member `orchestration` per
[`21`](./21-backend-api-build.md) §Shared workspace package); it calls the existing **Python**
Functions over HTTP (function key today, managed identity later — [`31`](./31-auth-migration.md)) and the
new **Data API** ([`21`](./21-backend-api-build.md)) for every DB write.

**What the flows actually look like today (read of `flows/definitions/*.json`).** `intake.definition.json`
is the spine: an Outlook `When_a_new_email_arrives_V3` trigger, then it **inlines** provider-match
(`List_active_providers` → `Filter_exact_domain` → `Switch_match_count`) and **invokes child flows**
`Run_case_resolve`, `Run_classify_persist`, `Run_parse`, `Run_status_evaluate`, `Run_enrich`,
`Run_triage` in sequence. Each child flow (`provider-match`, `case-resolve`, `classify-persist`,
`parse`, `status-evaluate`, `enrich`) has a **`manual` (HTTP Request) trigger** and a terminating
`Response` action — i.e. they are already request/response services. That maps cleanly onto Durable
**activities**: the inlined provider-match becomes an activity, each child flow becomes an activity, and
`intake`'s sequence becomes the orchestrator body. Idempotency today rides on the Dataverse alternate
key `cr1bd_case_sourcemessageid_key` over `cr1bd_sourcemessageid`; in Postgres that is the
`UNIQUE(sourcemessageid)` backstop ([`20`](./20-data-and-schema-migration.md)).

---

## A. Intake trigger: Graph change notifications (replaces Outlook `OnNewEmailV3`)

The project has **three shared intake inboxes** (domain model). Create **one subscription per mailbox**;
everything below is per-mailbox. All four endpoints live in `cespk-orch-dev`.

**Two intake flows collapse into this one design.** `flows/definitions/` holds **two** intake flows:
`intake.definition.json` (the spine, above) and `intake-shared-mailbox.definition.json` — the
parameterized **per-inbox multi-mailbox** variant (trigger `SharedMailboxOnNewEmailV2`; params
`IntakeMailbox` + `MinIntakeDate`; the Phase-8 triage-first restructure). Both collapse into the **single**
Graph design here: **one change-notification subscription per mailbox** (§A.2) + **one `intakeOrchestrator`**
(§B). The two flow params map directly:
- **`IntakeMailbox`** → the per-subscription `resource` (`users/<mailbox>/mailFolders('Inbox')/messages`,
  §A.2) **and** the per-Case `source_mailbox` provenance stamp written by `fetchMessage` (so each Case
  records which of the three inboxes it arrived on, exactly as the variant flow stamped it).
- **`MinIntakeDate`** → the **go-live watermark** already used by the §A.6 `missed`/resync logic
  (`receivedDateTime ge {watermark}`). Seed each mailbox's watermark to its `MinIntakeDate` at
  subscription-create time so a freshly-subscribed mailbox **never ingests historical backlog** — only
  messages at/after go-live.

### A.1 App registration + permission (operator-gated, P1)
A daemon (no-user) app calling Graph with **application** permission:
- Register an Entra app `cespk-graph-intake`; create a **client secret** (or, better, a federated/MSI
  credential later) → store in Key Vault as `graph-client-secret` ([`11`](./11-secrets-and-keyvault.md)).
- Add **application** permission `Mail.Read` (Microsoft Graph) → **requires tenant-admin consent**
  (operator step; the daemon cannot self-consent). `Mail.ReadBasic` is insufficient (no body/attachments).
- **Scope it down (security):** application `Mail.Read` grants access to *every* mailbox by default.
  Apply an Exchange Online **ApplicationAccessPolicy** (`New-ApplicationAccessPolicy -AccessRight
  RestrictAccess -AppId <appId> -PolicyScopeGroupId <mail-enabled security group of the 3 inboxes>`) so
  the app can read **only** the intake mailboxes. This is a hard operator gate logged in
  [`docs/gated.md`](../docs/gated.md) equivalent / [`31`](./31-auth-migration.md).
- Token: client-credentials, scope `https://graph.microsoft.com/.default`, against the tenant.

### A.2 Subscription create
```http
POST https://graph.microsoft.com/v1.0/subscriptions
Content-Type: application/json
{
  "changeType": "created",
  "notificationUrl":          "https://cespk-orch-dev.azurewebsites.net/api/graph-webhook",
  "lifecycleNotificationUrl": "https://cespk-orch-dev.azurewebsites.net/api/graph-lifecycle",
  "resource": "users/digital@collisionengineers.co.uk/mailFolders('Inbox')/messages",
  "expirationDateTime": "2026-07-02T09:00:00Z",   // now + ~6d23h, strictly < 7 days
  "clientState": "<random 64-char secret from KV, ≤128 chars>",
  "includeResourceData": false
}
```
Verified on Microsoft Learn (**"Set up notifications for changes in resource data → Subscription
lifetime"** and **subscription resource type**):
- **Outlook `message` max lifetime = 10,080 minutes (under 7 days)** *without* resource data. With
  resource data (rich notifications) it drops to **1,440 minutes (under 1 day)**. We set
  `includeResourceData:false`, so **no encryption certificate / decryption is needed** — the
  notification carries only the message **id**; the webhook fetches the message + attachments via Graph.
  Pick the longer window: target `now + 6 days 23 h` (a safe margin under 10,080 min).
- Any `expirationDateTime` **under 45 minutes** from request time is auto-bumped to 45 min; any value
  **over** the resource max will (per Learn's note) be rejected — never exceed 10,080 min.
- `clientState` is a **required-by-us** verification string, **max 128 chars**; store the secret in KV
  and compare on every inbound notification.

### A.3 Validation handshake (`/api/graph-webhook`, on create)
Verified (**"Registration Validation"**, SharePoint/Graph webhooks): on create Graph POSTs to the
notificationUrl with `?validationToken=<opaque>`. The endpoint must reply **within 10 s**, **HTTP 200**,
`Content-Type: text/plain`, body = the **URL-decoded** `validationToken` and nothing else.

```ts
// src/functions/graph-webhook.ts  (HTTP trigger, anonymous; security is clientState + handshake)
import { app, HttpRequest, HttpResponseInit, InvocationContext, output } from "@azure/functions";

const intakeQueue = output.storageQueue({ queueName: "intake-messages", connection: "AzureWebJobsStorage" });

app.http("graph-webhook", {
  methods: ["POST"], authLevel: "anonymous", extraOutputs: [intakeQueue],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const validationToken = req.query.get("validationToken");
    if (validationToken) {                              // 1) handshake
      return { status: 200, headers: { "Content-Type": "text/plain" }, body: validationToken };
    }
    const body = await req.json() as { value: GraphNotification[] };
    const expected = process.env.GRAPH_CLIENT_STATE;    // KV-backed app setting
    const msgs: string[] = [];
    for (const n of body.value ?? []) {
      if (n.clientState !== expected) {                 // 2) reject spoofed notifications
        ctx.warn("clientState mismatch — dropping"); continue;
      }
      msgs.push(JSON.stringify({                         // 3) enqueue id, ack fast
        subscriptionId: n.subscriptionId,
        messageId: n.resourceData?.id ?? n.resource,
        tenantId: n.tenantId, receivedAt: new Date().toISOString(),
      }));
    }
    ctx.extraOutputs.set(intakeQueue, msgs);
    return { status: 202 };                             // Graph needs a prompt ack
  },
});
```
Rules: **echo handshake first**, **verify `clientState`**, **enqueue then 202** (do the real work off
the queue — Graph retries for up to 4 h but expects sub-second acks). Never call the Data API or fetch
the message inside this HTTP path.

### A.4 Webhook → queue → orchestration handoff
A **queue-triggered starter** drains `intake-messages` and starts one orchestration per message using
the durable **client** binding (Node v4 model: `df.app.client()` / the `durableClient` input). It is the
de-dup choke point: start with a **deterministic instance id** derived from the message id so a
re-delivered notification cannot launch a second orchestration.

```ts
// src/functions/intake-starter.ts
import { app, InvocationContext } from "@azure/functions";
import * as df from "durable-functions";

app.storageQueue("intake-starter", {
  queueName: "intake-messages", connection: "AzureWebJobsStorage",
  extraInputs: [df.input.durableClient()],
  handler: async (item: unknown, ctx: InvocationContext) => {
    const msg = JSON.parse(item as string) as { messageId: string };
    const client = df.getClient(ctx);
    const instanceId = `intake-${msg.messageId}`;       // dedup at the orchestration layer
    const existing = await client.getStatus(instanceId);
    if (existing && existing.runtimeStatus !== "Failed" && existing.runtimeStatus !== "Terminated") return;
    await client.startNew("intakeOrchestrator", { instanceId, input: msg });
  },
});
```

### A.5 Renewal timer (R5 — the price of D2)
Verified (**subscription resource type → renew via PATCH**; lifetime table): renew before the <7-day max
by PATCHing `expirationDateTime` forward. Timer-triggered, **every 12 h** (well inside the 7-day window;
12 h gives ~13 renewal attempts before any single subscription could lapse).
```ts
// src/functions/graph-renew.ts  (timer: 0 0 */12 * * *)
app.timer("graph-renew", { schedule: "0 0 */12 * * *", handler: async (_t, ctx) => {
  const token = await getGraphToken();                  // client-credentials, .default
  for (const subId of await listOurSubscriptionIds()) { // tracked in a Postgres table or queried from Graph
    const next = new Date(Date.now() + (6 * 24 + 23) * 3600_000).toISOString(); // <7d
    await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expirationDateTime: next }),
    });
    ctx.log(JSON.stringify({ evt: "graph-renewal-success", subId, next })); // heartbeat signal (A.7)
  }
}});
```
If a PATCH 404s (subscription already gone), recreate it (same path as A.2) — the lifecycle
`subscriptionRemoved` handler covers the same case.

### A.6 Lifecycle endpoint (`/api/graph-lifecycle`)
Verified (**"Reduce missing subscriptions and change notifications"**): three lifecycle event types, all
delivered to `lifecycleNotificationUrl`. For Outlook **message** **all three are supported**
(`reauthorizationRequired` is supported for *all* resources; `subscriptionRemoved` and `missed` are
explicitly supported for Outlook `message`). Same validation handshake as the data webhook (echo
`validationToken`).
| Lifecycle event | Cause | Handler |
|---|---|---|
| `reauthorizationRequired` | access token about to expire / sub about to expire / admin revoked permission | re-acquire token, **PATCH-renew** the subscription (A.5); if renew 401s, re-consent gate |
| `subscriptionRemoved` | Graph dropped the subscription | **recreate** it (A.2) and resync (A.6 `missed` logic) |
| `missed` | Graph couldn't deliver some notifications | **resync**: `GET …/messages?$filter=receivedDateTime ge {lastWatermark}&$orderby=receivedDateTime` and enqueue each id; advance the watermark |
The `missed`/recreate resync is the reason the orchestrator must be idempotent on `sourcemessageid`
(A.4 + B): replaying recent messages must not create duplicate cases.

### A.7 Heartbeat alert (mandatory — the safety net the managed connector made unnecessary)
The renewal timer logs a custom event `graph-renewal-success` (A.5); the webhook logs a
`graph-notification-received` event. Wire an **Azure Monitor scheduled-query (log) alert** on the
orchestration app's Application Insights:
- **Alert 1 (renewal stalled):** `customEvents | where name == "graph-renewal-success" | summarize
  count()` over the last **26 h** == 0 → fire. (12 h cadence + margin.)
- **Alert 2 (intake silent):** no `graph-notification-received` over a business-hours window — softer,
  warning-only (legitimately quiet at night).
Action group → operator email/SMS. Without this, a silently-expired subscription stops intake with no
visible error (Power Automate's run-history UI is gone — D2 trade, see §D).

---

## B. The intake pipeline: Durable Functions (replaces the 7 live flows)

> Flow accounting: **17 total** = the **7 live** flows mapped here (`intake` + the 6 child flows
> `provider-match`/`case-resolve`/`classify-persist`/`parse`/`status-evaluate`/`enrich`) **+ 1** intake
> variant (`intake-shared-mailbox`, folded into §A) **+ 9 gated** (§C). 7 + 1 + 9 = 17.

A **Durable orchestrator** runs the chain as activities (function-chaining pattern). Each activity calls
the **Data API** for DB writes and the existing Functions for compute. The orchestrator is deterministic
and does **no I/O** itself (Durable code-constraint, verified) — all I/O is in activities.

```
intake-messages queue ─(starter, dedup instanceId)─> intakeOrchestrator(input = {messageId}):
  A0. fetchMessage         activity → Graph: GET message + attachments (bytes → Blob cespkevidstdev01)
  1.  providerMatch        activity → Data API: match sender domain → work-provider          [was: inlined in intake]
  2.  caseResolve          activity → Data API: VRM merge / ADR-0010 dedup ladder            [flow: case-resolve]
  3.  classifyPersist      activity → Data API: classify attachments + persist evidence rows [flow: classify-persist]
  4.  parse                activity → parser Function, gate PDF_MAPPER_ENABLED               [flow: parse]
  5.  statusEvaluate       activity → Data API: EVA-readiness + status machine               [flow: status-evaluate]
  6.  enrich               activity → enrichment Function, gate ENRICHMENT_ENABLED           [flow: enrich]
```

```ts
// src/functions/intakeOrchestrator.ts  (Node v4 model)
import * as df from "durable-functions";

const retry = new df.RetryOptions(/*firstRetryMs*/ 5000, /*maxAttempts*/ 3);
retry.backoffCoefficient = 2; retry.maxRetryIntervalInMilliseconds = 60_000;

df.app.orchestration("intakeOrchestrator", function* (ctx) {
  const { messageId } = ctx.df.getInput() as { messageId: string };

  // A0 — fetch + land bytes; returns the normalized inbound envelope
  const inbound = yield ctx.df.callActivityWithRetry("fetchMessage", retry, { messageId });

  // 1 — provider-match (idempotent read; safe to retry)
  const provider = yield ctx.df.callActivityWithRetry("providerMatch", retry, inbound);

  // 2 — case-resolve (UNIQUE(sourcemessageid) backstop makes the create idempotent)
  const resolved = yield ctx.df.callActivityWithRetry("caseResolve", retry,
    { inbound, providerId: provider.workProviderId, matchState: provider.matchState });
  if (resolved.outcome === "already_ingested") return { skipped: true, caseId: resolved.caseId };

  // 3 — classify + persist evidence
  yield ctx.df.callActivityWithRetry("classifyPersist", retry, { caseId: resolved.caseId, inbound });

  // 4 — parse (gate read inside the activity; no-op when PDF_MAPPER_ENABLED=false)
  yield ctx.df.callActivityWithRetry("parse", retry, { caseId: resolved.caseId });

  // 5 — status-evaluate (EVA-readiness + status machine)
  const status = yield ctx.df.callActivityWithRetry("statusEvaluate", retry, { caseId: resolved.caseId });

  // 6 — enrich (gate ENRICHMENT_ENABLED; no-op when off)
  yield ctx.df.callActivityWithRetry("enrich", retry, { caseId: resolved.caseId });

  return { caseId: resolved.caseId, status: status.value };
});
```

```ts
// src/functions/activities/parse.ts  — pattern shared by every "call an existing Python Function" activity
import * as df from "durable-functions";
import { gates } from "@cs/domain/gates";   // the SAME centralised gate module the API + SPA use (10-settings §1.4)

df.app.activity("parse", { handler: async (input: { caseId: string }, ctx) => {
  if (!gates.pdfMapper()) { ctx.log("parse skipped (gate off)"); return { skipped: true }; }
  const res = await fetch(`${process.env.PARSER_FN_URL}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-functions-key": process.env.PARSER_FN_KEY! },
    body: JSON.stringify({ caseId: input.caseId }),
  });
  if (!res.ok) throw new Error(`parser ${res.status}`);   // throw → Durable retry kicks in
  return res.json();
}});
```

Notes:
- **At-least-once / idempotent activities (verified, "Programming model → Activities"):** activities can
  re-run after a mid-flight failure, so every DB-writing activity must **upsert**, not insert — exactly
  the `UNIQUE(sourcemessageid)` + survivor-merge behaviour the flows already encode (ADR-0010).
- **Evidence bytes** continue to land in Blob `cespkevidstdev01`; Postgres holds the metadata + blob
  path (as today). `fetchMessage` writes the bytes; later activities reference the path.
- **Gates** are read by the activities through the **single centralised `gates` module** shared with the
  API + SPA — `import { gates } from "@cs/domain/gates"`, then the named sync accessors
  (`gates.pdfMapper()`, `gates.enrichment()`, `gates.boxApi()`, …) defined in [`10`](./10-settings-migration.md)
  §1.4 over `process.env`. Same gate names, same default-off semantics as the flows
  (`PDF_MAPPER_ENABLED`, `OCR_SCANNED_PDF_ENABLED`, `ENRICHMENT_ENABLED`, `EMAIL_AI_ENABLED`, etc.).
  The `gates` accessor must be exported as a `@cs/domain/gates` subpath in the package barrel ([`21`](./21-backend-api-build.md)
  §Shared workspace package) so all three apps (SPA, API, orchestration) resolve the one module.
- **Errors/retries (verified, "Handle errors and retries"):** `callActivityWithRetry` gives per-activity
  exponential backoff; an exhausted activity bubbles a JS exception the orchestrator can `try/catch` to
  route the case to a Held/error state rather than crash the run.

---

## C. The 9 gated/offline flows → orchestrations (keep gated)

All nine keep their existing gate, default **off**, read inside the activity/orchestration (never
hard-coded). Exact gate names per `dataverse/environment-variables.json`:

| Flow (`flows/definitions/`) | Trigger today | New home | Gate (unchanged, stays off) |
|---|---|---|---|
| `finalize-eva-box` | manual (`When_submit_requested`) | Durable orchestration: EVA submit + Box folder-augment | `EVA_API_ENABLED`, `BOX_API_ENABLED` |
| `chaser-draft` | manual | Activity (compose + create draft) | — (draft-only; no send gate needed) |
| `chaser-send` | manual | Activity behind a gate guard | `CHASER_SEND_ENABLED` |
| `triage-classify` | manual | Activity calling the parser `ClassifyEmail`/classifier op | `EMAIL_AI_ENABLED` |
| `box-folder-create` | manual | Box orchestration → box-webhook Function facade | `BOX_FOLDER_AT_INTAKE_ENABLED` (+ `BOX_API_ENABLED`) |
| `box-file-request-copy` | manual | Box orchestration → box-webhook facade | `BOX_FILEREQUEST_ENABLED` (+ `BOX_API_ENABLED`) |
| `box-blob-purge` | `Recurrence` | **Timer**-triggered orchestration | `BOX_API_ENABLED` |
| `case-disposition` | `Recurrence` | **Timer**-triggered orchestration (retention/erasure, ADR-0017) | `CASE_DISPOSITION_ENABLED` |
| `jobsheet-import` | manual | HTTP/manual-triggered orchestration (per-principal fan-out) | — |

Mapping detail:
- **Recurrence → timer.** `box-blob-purge` and `case-disposition` use Power Automate `Recurrence`; in
  Durable these become **timer-triggered** starters (`app.timer(...)`) that kick a short orchestration —
  same cadence, gate read first, no-op when off.
- **`finalize-eva-box`** stays a single orchestration so EVA-submit and the Box folder-augment remain one
  atomic unit (its house pattern). Both gates must be on for it to do anything.
- **`jobsheet-import`** today does `List_principals_rows` → `Apply_to_each_principal`; that becomes a
  fan-out/fan-in orchestration (`Promise.all` over per-principal activities) or a simple loop — manual
  trigger preserved as an HTTP starter.
- **The Box facade (CCG token mint) stays inside the `box-webhook` Function (unchanged).** Read of
  `functions/box-webhook/function_app.py` confirms it already exposes the full facade the orchestration
  needs: `POST box/folders` (create folder), `POST box/file-requests/{id}/copy`, `PUT
  box/{files|folders}/{id}/shared-link`, `GET box/folders/{id}/items`, `POST box/webhooks`, plus webhook
  & File-Request lifecycle. The Box orchestrations **call these HTTP routes**; they do **not** re-mint Box
  tokens or re-implement CCG auth. `BOX_*` stay off through the whole migration (R5/Box latent risk).

---

## D. What is deliberately NOT rebuilt
- **The custom connectors** — orchestration calls the Functions/Data API directly (function key →
  managed identity); the `cr1bd_*` connector layer is dropped entirely ([`90`](./90-deprovision-power-platform.md)).
- **The Dataverse-connector DB actions** (`CreateRecord`/`ListRecords`/`UpdateRecord`/`GetItem` seen all
  over the flows) — replaced by **Data API** calls ([`21`](./21-backend-api-build.md)).
- **The visual run-history** — Durable gives a code-level orchestration history (`statusQueryGetUri`,
  instance status) + App Insights end-to-end traces; there is **no** Power Automate run-history UI. This
  was an accepted trade in D2 — and the reason the §A.7 heartbeat alert is mandatory.

---

## Build & deploy

### Hosting facts (verified on Microsoft Learn)
- **Flex Consumption → one app per plan** (verified, "Flex Consumption plan → Considerations"). `cespk-api-dev`
  and `cespk-orch-dev` each get their **own** Flex plan.
- **Durable on Flex Consumption:** only **Azure Storage** and **Durable Task Scheduler** are supported
  storage providers (verified). Use the default **Azure Storage** provider (cheapest; no extra resource).
  Follow the Flex recommendations: set **always-ready instances = 1** for the orchestration group and
  `maxQueuePollingInterval = 1s` in `host.json` to cut latency (note: lower polling raises storage
  transaction cost slightly — acceptable at this volume).
- **Non-.NET apps on Flex** must use **extension bundle `[4.0.0, 5.0.0)`** (verified) — set in `host.json`.
- **Node v4 + Durable** needs the **`durable-functions` v3.x** npm package (the v4 programming model;
  verified). Triggers are registered in code via `df.app.orchestration/activity` + `df.input.durableClient`
  — no `function.json`.

### `host.json`
```json
{
  "version": "2.0",
  "extensionBundle": { "id": "Microsoft.Azure.Functions.ExtensionBundle", "version": "[4.0.0, 5.0.0)" },
  "extensions": { "durableTask": { "storageProvider": { "maxQueuePollingInterval": "00:00:01" } } }
}
```

### Create + publish (Node 20, verified command shape)
```bash
# storage: a dedicated account holds the Durable task hub + the intake-messages queue + deployment container
az storage account create -g rg-collisionspike-dev -n cespkorchstdev01 -l uksouth --sku Standard_LRS

# verified flex create command (Learn: flex-consumption-how-to, JS/TS pivot) — always-ready set inline.
# `durable` is the reserved per-function-scaling group for ALL Durable triggers (orchestration/activity/entity);
# always-ready durable=1 cuts intake-orchestration cold-start latency. It does NOT warm the plain timer
# trigger `graph-renew` (its own per-function group) — and need not: a renewal-timer cold start is harmless
# at the 12 h cadence inside the under-7-day (10,080-min) window. To warm it too, add function:graph-renew=1.
az functionapp create \
  --resource-group rg-collisionspike-dev \
  --name cespk-orch-dev \
  --storage-account cespkorchstdev01 \
  --flexconsumption-location uksouth \
  --runtime node --runtime-version 20 \
  --always-ready-instances durable=1
#  (Flex only supports runtime v4.x — no --functions-version needed)

# to adjust always-ready on the existing app later (verified command — Learn: "Set always ready instance counts"):
#   az functionapp scale config always-ready set -g rg-collisionspike-dev -n cespk-orch-dev --settings durable=1
# (optionally also warm the renewal timer: --settings function:graph-renew=1 — usually unnecessary)

# managed identity + Key Vault references for graph-client-secret / GRAPH_CLIENT_STATE / function keys (11-secrets)
az functionapp identity assign -g rg-collisionspike-dev -n cespk-orch-dev

func azure functionapp publish cespk-orch-dev   # from the orch project root (TypeScript build first)
```
App settings the activities need (set via `az functionapp config appsettings set`, secrets as KV
references — [`11`](./11-secrets-and-keyvault.md)): `PARSER_FN_URL`/`PARSER_FN_KEY`,
`ENRICH_FN_URL`/`ENRICH_FN_KEY`, `BOXWEBHOOK_FN_URL`/`BOXWEBHOOK_FN_KEY`, `DATA_API_URL`,
`GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`/`graph-client-secret`, `GRAPH_CLIENT_STATE`, plus the gate config
([`10`](./10-settings-migration.md)). Key Vault reference syntax:
`@Microsoft.KeyVault(SecretUri=https://cespkenrichkvgi62sd.vault.azure.net/secrets/<NAME>/)` with the
app's managed identity granted **Key Vault Secrets User**.

### Operator-gated steps (P1 / P7)
1. **Admin consent** for Graph application `Mail.Read` (operator/tenant-admin only) — A.1.
2. **ApplicationAccessPolicy** scoping the app to the 3 intake mailboxes (Exchange Online PowerShell) — A.1.
3. **Create the subscriptions** (A.2) in **P7** against the production mailboxes — single-consumer cutover
   (the old intake flow and the new subscription must not both run; disable the Power Automate intake flow
   first, [`99`](./99-verification-and-cutover.md)).

---

## Done-when (P4 gate)
A test email to a shared intake mailbox produces a Graph notification → `graph-webhook` 202 → queue →
`intake-starter` (deduped instance id) → `intakeOrchestrator` → a correctly-staged Case in Postgres with
evidence bytes in Blob; a **re-sent** message is deduped (no second case); the **renewal timer** PATCH and
all three **lifecycle** handlers (`reauthorizationRequired` / `subscriptionRemoved` / `missed`-resync) are
proven; and the **heartbeat alert** (Alert 1, renewal-stalled) is wired to an action group. All 9 gated
orchestrations deploy with their gates **off** and no-op when invoked.
