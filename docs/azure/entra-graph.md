# Playbook — Entra app-reg / token audience / Graph intake / Exchange-RBAC

**When to use.** Anything touching the intake identity: Entra app registration, token audience/JWT
validation, Microsoft Graph mailbox access, Graph change-notification subscriptions or delta-poll, and the
Exchange-RBAC-for-Applications mailbox grant.

## Invoke first
1. **`azure:entra-app-registration`** — app registrations, OAuth, MSAL, API permissions.
2. **`microsoft-docs:microsoft-docs`** — authoritative Graph/Exchange behavior **before** retrying (this
   is the area where guessing burned the most time).
3. Token/audience fixes ship via [deploy.md](./deploy.md); secrets via [secrets-keyvault.md](./secrets-keyvault.md).

## The identities (this project)
- SPA MSAL client `30ff23e0…`; API app `fa2fb28c-fef6-40a4-8d3b-ae6725891d72`; **intake app**
  `CollisionSpike Graph Intake` appId `5d37a155-2af8-4878-b96a-6faad5207137` (SP oid
  `e25ca6f2-…`); tenant `858cf5b3-aa0a-47a6-9b40-4851fd0afa94`. Source: [`live-environment.md`](../architecture/live-environment.md).

## ⚠️ Poll vs push — a known doc conflict; verify against the deployed app
- [`live-environment.md`](../architecture/live-environment.md) + memory [exchange-rbac-unblocks-graph-intake](../../memory/exchange-rbac-unblocks-graph-intake.md)
  describe the intake auth model as **delta-POLL** ("poll, don't subscribe") and treat that as canonical.
- The **deployed `cespk-orch-dev`** ships `graph-renew` + `graph-webhook` (a **push/subscription** design),
  and [azure-orch-deploy](../../memory/azure-orch-deploy.md) notes the subscription path *does* ride on Exchange RBAC.
- **Do not assert one over the other from docs.** Check the live app
  (`az functionapp function list … -n cespk-orch-dev` → is `graph-renew`/`graph-webhook` present and what
  does it do?) and follow `live-environment.md` per the repo precedence rules. Either way, **mailbox access
  is Exchange-RBAC-scoped** and the cache gotcha below applies.

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
- **Trigger `graph-renew` on demand:** `POST https://cespk-orch-dev.azurewebsites.net/admin/functions/graph-renew`
  with `x-functions-key: <masterKey>` (`az functionapp keys list … --query masterKey`), body `{"input":""}` → 202.
- **Subscription lifetime** (if using push): Outlook `message` = **7 days** (rich/resource-data = 1 day);
  renew before expiry and handle **lifecycle notifications** (`reauthorizationRequired` / `subscriptionRemoved`
  / `missed` → delta-resync). Don't issue reauthorize POST + PATCH within a 10-min window.

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
`X` (200 `text/plain`).
