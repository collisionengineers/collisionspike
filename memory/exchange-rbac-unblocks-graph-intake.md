---
name: exchange-rbac-unblocks-graph-intake
description: Exchange RBAC for Applications grants the Graph intake app scoped mailbox perms without Global-Admin Entra consent — verified live
metadata:
  type: project
---

The Azure-migration Outlook intake was blocked because the Graph `Mail.Read` **application**
permission can only be admin-consented by Global Administrator or Privileged Role Administrator
(App/Cloud-App/AI Admin are explicitly excluded for *Microsoft Graph* app roles), and the tenant's
only GA is `admin@collisionengineers.onmicrosoft.com`. digital@ holds Application Administrator +
Exchange Administrator, neither of which can grant that Entra consent.

**Resolution (verified live 2026-06-26): RBAC for Applications in Exchange Online.** An **Exchange
Administrator** (digital@ has it) can grant an app **resource-scoped** Graph mailbox roles directly in
Exchange — `New-ServicePrincipal` + `New-ManagementScope` + `New-ManagementRoleAssignment` — which are
**independent of Entra consent** (no GA, no Entra `Mail.Read` grant). Roles cover the full intake need:
`Application Mail.Read` (read), `Application Mail.ReadWrite` (categorize/move), `Application Mail.Send`
(reply), or the bundle `Application Mail Full Access`. Multiple inboxes = scope to a mail-enabled
security group (`MemberOfGroup` filter; direct membership only). `Test-ServicePrincipalAuthorization`
returned `InScope: True` for `Mail.ReadWrite,Mail.Send` on `digital@collisionengineers.co.uk`.

**Live identifiers / config (left in place as the seed of the real setup):** app `CollisionSpike Graph
Intake` appId `5d37a155-2af8-4878-b96a-6faad5207137`, SP objectId `e25ca6f2-3eb2-4ea8-9953-229efcfd8893`;
EXO objects `CS-Intake-Test` (scope, filter `PrimarySmtpAddress -eq 'digital@…'`) + `CS-Intake-MailFull`
(role assignment). The app reg still lists an **unconsented** Entra Graph `Mail.Read` — leave it
unconsented (or remove from the manifest); per docs an *unscoped* Entra grant would defeat the RBAC
scoping. Test script: scratchpad `test-exo-rbac.ps1`. EXO connect needs `-Device` (WAM window-handle
error from bash). Permission-cache propagation to real Graph calls is ~30 min–2 hr; the test cmdlet
bypasses it.

**Why this matters:** removes the GA blocker that stalled the migration intake (D2 / risk in
migration/02). **How to apply:** intake should use **app-only Graph against these RBAC-scoped mailboxes**;
prefer **polling** (delta query) over a Graph push-subscription — the subscription-create path is the one
op not guaranteed to ride on RBAC-only, and polling also kills the <7-day renewal loop (migration risk
R5). The Logic-App + O365-connector path remains the no-code fallback. Related: [[live-services-boundary]].

**Playbook:** the canonical operational guide is [docs/azure/entra-graph.md](../docs/azure/entra-graph.md)
(routing + anti-churn, incl. the permission-cache STOP); this memory holds the deep detail it links back to.
