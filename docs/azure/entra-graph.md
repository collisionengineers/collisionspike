# Playbook — Entra app-reg / token audience / Graph intake / Exchange-RBAC

**When to use.** Anything touching the intake identity: Entra app registration, token audience/JWT
validation, Microsoft Graph mailbox access, Graph change-notification subscriptions or delta-poll, and the
Exchange-RBAC-for-Applications mailbox grant.

**Platform ([routing table](./README.md)):** SPLIT. The **Exchange-RBAC half is Windows PowerShell
only** — `ExchangeOnlineManagement` cmdlets (`Connect-ExchangeOnline`, `New-ManagementScope`,
`New-ServicePrincipal`, `Test-ServicePrincipalAuthorization`) have no bash/WSL equivalent; advise the
operator accordingly. The **Entra/Graph half** (`az ad …`, `az rest --uri https://graph.microsoft.com/…`,
subscription CRUD smoke calls) runs from **WSL**, where az is installed and logged in.

## Invoke first
1. **`azure:entra-app-registration`** — app registrations, OAuth, MSAL, API permissions.
2. **`microsoft-docs:microsoft-docs`** — authoritative Graph/Exchange behavior **before** retrying (this
   is the area where guessing burned the most time).
3. Token/audience fixes ship via [deploy.md](./deploy.md); secrets via [secrets-keyvault.md](./secrets-keyvault.md).

## The identities (this project)
- SPA MSAL client `30ff23e0…`; API app `fa2fb28c-fef6-40a4-8d3b-ae6725891d72`; **intake app**
  `CollisionSpike Graph Intake` appId `5d37a155-2af8-4878-b96a-6faad5207137` (SP oid
  `e25ca6f2-…`); **MCP Flow A client** `CollisionSpike MCP Client` appId `88589edc-527a-4d84-83da-a2ddb8664f08`
  (public client PKCE, delegated `access_as_user` on the API — TKT-110/ADR-0023);
  tenant `858cf5b3-aa0a-47a6-9b40-4851fd0afa94`. Source: [`live-environment.md`](../architecture/live-environment.md).

## Deployed transport

The production mailbox set uses Graph **push change-notification subscriptions**, with durable renewal;
it is not a delta-poll intake. Treat subscription IDs, expiries and mailbox counts as volatile and use
[`live-environment.md`](../architecture/live-environment.md) for the current registry. Mailbox access is
Exchange-RBAC-scoped and the cache gotcha below still applies.

## TKT-009 immutable-ID replacement — plan only, execution blocked

This section strengthens the future TKT-009 rollout and TKT-178 final-cutover plan. It does **not**
authorize or record a deployment, subscription mutation, mailbox mutation, EVA query, database change,
production Archive write or root retarget. TKT-009 deployment, subscription replacement and signed-in
Chrome proof remain **PENDING**.

An equivalent legacy subscription and immutable-ID replacement cannot be relied on to coexist. Do not
promise create-before-delete or claim that a failed replacement leaves the old subscription alive. The
future approved operation is a controlled, bounded **delete then recreate** sequence with intake paused
and the notification gap reconciled before intake resumes.

Final production execution must not begin until all of these gates pass:

1. A dated job spreadsheet is signed off, checksum-recorded and mapped to the exact ordered operation.
2. The production Archive root is independently confirmed and explicit permission is recorded for the
   proposed production writes and final root retarget. Until then, Archive activity is test-root-only.
3. A deterministic zero-write dry-run ledger is frozen, its SHA-256 hash is recorded and a named
   operator approves that exact hash. Changed inputs or output require a new dry-run and approval.
4. Checksum-verified database and Archive inventories/backups exist, and a non-production restore
   rehearsal proves the documented recovery path.
5. The EVA API is currently blocked/unavailable. The dry-run records `not queried` plus the reason and
   makes no request. Before execution, the API must be available, authenticated and verified against
   the expected production contract; **the final production cutover remains blocked until EVA passes
   this gate**.
6. The operator explicitly approves the frozen job, bounded intake pause, subscription delete/recreate,
   and every listed database/Archive mutation.

Outlook is read-only throughout this work and the future cutover: reads may establish evidence, but no
message may be sent, moved, deleted, categorized or marked. This planning pass allows only offline
fixtures and the approved Archive test root; production Archive retargeting or writes cannot occur now.

### Approved future sequence

After every gate above passes, the runbook must make each step and checkpoint explicit:

1. Record the legacy subscription's mailbox/resource, notification and lifecycle URLs, expiry,
   client-state reference, request options and last processed intake watermark. Never record a client
   secret or raw client-state value in the runbook.
2. Quiesce intake for the approved bounded window and record its start time/watermark.
3. Delete the legacy subscription, then create the immutable-ID replacement from the reviewed
   definition. Record the new ID and expiry in the restricted operational evidence store.
4. Validate the webhook challenge, callback version, renewal path and a permitted read-only delivery
   sample before resuming intake.
5. Resume the persisted pre-delete Inbox delta link and reconcile every change in the paused/gap
   interval through a durable, idempotent outbox. Keep Outlook read-only. Prove the delta endpoint,
   acknowledged outbox entries and resulting database identities agree before intake resumes; a
   timestamp/current-folder scan is not sufficient because moved or deleted gap mail can disappear.
6. Resume intake only after an independent operator accepts the replacement and gap reconciliation.

### Offline rehearsal and rollback

- Rehearse the state machine with production-shaped fixtures only; do not call subscription CRUD.
  Cover successful replacement, create failure, webhook-validation failure, response loss, renewal
  failure, duplicate delivery and interruption at every checkpoint.
- Run the ledger twice from canonical inputs and require identical ordered output and SHA-256 hash.
  Include duplicated Internet-Message-Ids across mailboxes and an EVA `not queried` fixture, but keep
  production execution blocked until real EVA authentication and availability are proven.
- Prove rollback with the Archive test root and a non-production database copy. Compare restored row,
  relationship and file hashes with the pre-rehearsal manifest; a procedural claim is not restore proof.
- A deleted Graph subscription ID cannot be restored. If replacement creation or validation fails,
  keep intake paused, recreate the recorded previous **supported definition**, validate callback and
  renewal, reconcile the whole gap, and end the cutover as blocked for review.
- If any spreadsheet, root, deployment, backup manifest, dry-run output or hash changes, invalidate the
  approval and return to preflight. Do not improvise a production write or silently broaden the ledger.

## Gotchas (load-bearing)
- **Exchange-RBAC permission cache — the ~50-min 403.** After the grant, Graph `POST /subscriptions` and
  even `GET /users/{mbx}/messages` return **403 `ExtensionError … Access is denied`** while
  `Test-ServicePrincipalAuthorization` shows `InScope: True` (the test cmdlet bypasses the cache). App-perm
  changes are cached **30 min – 2 h**; an **idle** app resets at 30 min, an **active** app keeps the stale
  "deny" alive up to 2 h. **CORRECT: grant → leave the app totally idle ≥30 min (no token probes, no
  `graph-renew`) → fire it once.** Polling/probing *prevents* the reset. Ref [azure-orch-deploy](../../memory/azure-orch-deploy.md) +
  MS Learn "RBAC for Applications in Exchange Online → Limitations §5".
- **Exchange-RBAC grant needs `Connect-ExchangeOnline -Device`** in a **real terminal** (not the `!`
  prefix) — WAM browser auth fails "A window handle must be configured." Script:
  `C:\Users\Alex\grant-exo-rbac-intake.ps1`. `New-ServicePrincipal` / `New-ManagementScope` /
  `New-ManagementRoleAssignment`; `Application Mail.Read` = Graph `Mail.Read` (do **not** use
  `Mail.Read.Shared`); **no Global Admin / no Entra consent** — leave the unconsented Entra `Mail.Read` off.
- **`GRAPH_INTAKE_MAILBOXES` is JSON, not CSV** — `[{"mailbox":"…","minIntakeDate":"…Z"}]`; a plain string
  JSON-parse-throws → **zero mailboxes, silently**. Set via `--settings @file`. Ref [azure-orch-deploy](../../memory/azure-orch-deploy.md).
- **Token audience:** v2 tokens carry `aud` = bare client-id GUID, not `api://…` — see [deploy.md](./deploy.md).
- **Trigger `graph-renew` on demand (operational reference, not authorization):** `POST
  https://cespk-orch-dev.azurewebsites.net/admin/functions/graph-renew` with
  `x-functions-key: <masterKey>` (`az functionapp keys list … --query masterKey`), body `{"input":""}` →
  202. Do not run this as part of a documentation pass, offline rehearsal or unapproved cutover.
- **Subscription lifetime** (if using push): Outlook `message` = **7 days** (rich/resource-data = 1 day);
  renew before expiry and handle **lifecycle notifications** (`reauthorizationRequired` / `subscriptionRemoved`
  / `missed`). There is no persisted delta baseline today, so do not claim automatic delta recovery:
  keep intake/cutover state fail-closed and run the reviewed bounded catch-up/reconciliation path. Don't
  issue reauthorize POST + PATCH within a 10-min window.

## Best-practice refs (Microsoft Learn)
- Subscription lifetime: <https://learn.microsoft.com/graph/change-notifications-overview#subscription-lifetime>
- Lifecycle notifications: <https://learn.microsoft.com/graph/change-notifications-lifecycle-events>
- Outlook change notifications: <https://learn.microsoft.com/graph/outlook-change-notifications-overview>
- Webhook delivery (clientState validation, respond 202 first): <https://learn.microsoft.com/graph/change-notifications-delivery-webhooks>

## Anti-churn checkpoint
A 403 right after an Exchange-RBAC grant is **the cache, not a wrong grant** (the test cmdlet already says
`InScope: True`). **Stop calling Graph and wait ≥30 min idle** — do not loop `graph-renew`. Read the MS
Learn limitation before any further attempt.

## Verify
`Test-ServicePrincipalAuthorization -Identity <appId> -Resource <mbx>` → `InScope: True`; after the idle
window, `graph-renew` returns 202 and the first Graph read 200s; `graph-webhook?validationToken=X` echoes
`X` (200 `text/plain`). These are operational checks, not evidence that TKT-009 has been deployed or
that its legacy subscription has been replaced. That verdict also requires the approved sequence above,
notification-gap reconciliation and signed-in Chrome proof for each production mailbox.
