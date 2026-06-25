# 10 — Outlook / Microsoft 365 Integration (cross-cutting)

> **Why this doc exists.** The intake pipeline's front door is **3 Outlook shared mailboxes**, and
> email intake is **live today**. This is easy to under-weight: re-platforming the *app* off Power
> Platform does **not** move the *mailboxes*. **Microsoft 365 / Outlook stays** — staff use it for all
> their email. So the real question for every target is: *how does the app read (and write) the
> existing Outlook shared mailboxes from its new home?* This factor cuts across all of folders 01–09
> and **corrects** the earlier "AWS → SES inbound" / "GCP → Gmail API" framing, which wrongly assumed
> relocating the company's email.
>
> Facts below are from Microsoft Learn (June 2026) and are cited inline.

---

## The core fact

**You are migrating the app, not the email system.** Outlook/M365 remains the system of record for
mail. The intake integration therefore becomes: *a background service that watches the 3 shared
mailboxes and pulls new messages + attachments into the case pipeline* — and, for chasers, *creates
drafts / sends mail back through those mailboxes.*

There are two ways to do that, and which one you get **depends entirely on the target**:

| | **Stay Microsoft-adjacent (Azure)** | **Any non-Microsoft target** |
|---|---|---|
| Mechanism | **Office 365 Outlook connector** (the *same* `When a new email arrives (V3)` trigger Power Automate uses) in **Logic Apps**, or **Microsoft Graph** from a Function with **managed identity** | **Microsoft Graph API** only |
| Effort | **Near lift-and-shift** (Logic Apps connector is identical) | **New build**: Entra app + Graph subscriptions + webhook receiver + renewal loop |
| Auth | Connection / managed identity (no secret juggling) | Entra app registration + client secret/cert in your secrets store |

This is the single biggest *Microsoft-flavoured* integration in the system. By contrast **EVA, DVSA,
DVLA, Box and postcode.io are already plain REST** and move unchanged everywhere — Outlook is the one
that makes "leave Microsoft entirely" cost more than the raw infra suggests.

---

## What the non-Microsoft path actually requires (Microsoft Graph)

Every target in folders **03 (AWS), 04 (GCP), 05 (Supabase), 06 (Cloudflare), 07 (VPS), 08 (PaaS)**
reads the shared mailboxes the same way — via Graph. The build:

1. **Entra app registration** in the company tenant, with **application permission `Mail.Read`**
   (read) and, for moving/flagging messages or creating chaser drafts, **`Mail.ReadWrite`** (and
   `Mail.Send` if sending directly). Admin consent required.
   - ⚠️ **Use the *application* permission, not delegated `.Shared`.** The delegated `Mail.Read.Shared`
     / `Mail.ReadWrite.Shared` permissions **cannot subscribe to change notifications** on shared
     folders — only the **application permission `Mail.Read`** supports webhook subscriptions on
     another user's / shared mailbox. ([outlook-share-messages-folders](https://learn.microsoft.com/graph/outlook-share-messages-folders))
2. **Scope the app to ONLY the 3 intake mailboxes.** By default `Mail.Read` (application) grants
   access to **every mailbox in the organisation** — unacceptable for claimant PII. Lock it down with
   **RBAC for Applications in Exchange Online** (the modern replacement for the legacy
   `New-ApplicationAccessPolicy`): put the 3 mailboxes in a mail-enabled security group and restrict
   the app to that group. ([application-rbac](https://learn.microsoft.com/exchange/permissions-exo/application-rbac) ·
   [auth-limit-mailbox-access](https://learn.microsoft.com/graph/auth-limit-mailbox-access))
3. **A public HTTPS webhook receiver** (the box-webhook Function already proves this pattern is in
   the team's repertoire) to receive Graph **change notifications** on
   `/users/{mailbox}/mailFolders('inbox')/messages`.
4. **A subscription-renewal loop.** Graph mail subscriptions are **short-lived**: max **10,080 minutes
   (~7 days)** without resource data, or **1,440 minutes (~1 day)** if you request the message body in
   the notification ("rich" notifications). They **must be renewed before expiry**, and you should
   also subscribe to **lifecycle notifications** to recover missed events. Max **1,000 active
   subscriptions per mailbox**. ([change-notifications-overview#subscription-lifetime](https://learn.microsoft.com/graph/change-notifications-overview#subscription-lifetime) ·
   [outlook-change-notifications-overview](https://learn.microsoft.com/graph/outlook-change-notifications-overview))
   - *Alternative:* skip webhooks and **poll with a delta query** every minute or two. Simpler, no
     public endpoint, no renewal loop — but adds latency and, on a per-execution-billed workflow
     engine (e.g. n8n cloud), the polling cadence is itself a cost driver (see
     [09](../09-other-setups-nocode-hybrid/README.md) — the "execution trap").
5. **Attachment retrieval:** `GET …/messages/{id}/attachments` → feed bytes to the parser. Standard.

**Cost: ~$0.** Graph is included with the M365 licences staff already hold; **shared mailboxes under
50 GB need no licence of their own.** The cost is **engineering effort + an Entra app + webhook
reachability + the renewal/lifecycle lifecycle**, not a bill.

---

## Per-target summary (corrections folded in)

| Target | Outlook intake mechanism | Effort | Notes |
|---|---|---|---|
| **01 Azure PaaS** | **Logic Apps Office 365 connector** (same trigger as today) *or* Graph via managed identity | **Lowest** — near lift-and-shift | Strong reason Azure PaaS is the least-effort target |
| **02 Desktop + backend** | Backend does app-only Graph (as 03–08), *or* desktop client uses delegated `Mail.Read.Shared` as the signed-in operator | Medium | A desktop client can read as the logged-in user who already has shared-mailbox rights |
| **03 AWS** | **Microsoft Graph → API Gateway/Lambda webhook** | New build | ~~SES inbound~~ **corrected**: SES would mean relocating the mail domain — don't. Use Graph. (SES is fine only for *outbound* notifications you originate.) |
| **04 GCP** | **Microsoft Graph → Cloud Run webhook** | New build | ~~Gmail API + Pub/Sub~~ **corrected**: that assumes Gmail, but the company is on Outlook. Use Graph. |
| **05 Supabase** | Graph → Edge Function / your container webhook | New build | Supabase has no mail trigger; Graph + a webhook handler |
| **06 Cloudflare** | Graph → Workers webhook | New build | Workers can host the HTTPS receiver fine; parser still runs elsewhere |
| **07 VPS** | Graph → your own HTTPS endpoint | New build | You own the endpoint + renewal cron; no platform help |
| **08 PaaS (Fly/Render/Railway)** | Graph → container webhook | New build | Same as VPS but the platform handles TLS/deploys |

---

## How this nudges the recommendation

- It **adds weight to Azure PaaS (01)** as the least-effort target: the Outlook trigger is the *same
  connector* in Logic Apps, on top of the 6 Functions already being zero-port. The two
  most-Microsoft-flavoured pieces of the system (Functions + the Outlook intake trigger) both carry
  over with little change.
- It **raises the true cost of the non-Microsoft targets** (03–08) by one well-defined but non-trivial
  workstream — the Graph subscription + webhook + renewal integration — that the headline infra cost
  doesn't show. It does **not** change their ~flat monthly *run-cost* (Graph is ~$0), only the
  *rebuild* effort.
- It does **not** rescue the hybrid keep-Dataverse option, and it does **not** change the cost
  ranking — every non-Microsoft target pays the same Graph tax, so they stay ranked by infra cost +
  lock-in as before.
- **Open question worth confirming with the operator:** is moving *off Outlook itself* ever on the
  table (e.g. a dedicated intake domain on AWS SES / a provider's inbound parse)? The whole analysis
  above assumes **no** — staff keep Outlook — which is almost certainly correct, but it's the
  assumption the Graph tax rests on. If a dedicated intake address could be **MX-routed** to a
  non-Microsoft inbound-email service, the non-Microsoft targets get a *cheaper, simpler* intake path
  and lose this disadvantage. **That alternative is worked through in
  [11-email-intake-mx-routing](../11-email-intake-mx-routing/README.md).**

## Sources

- Outlook change notifications (subscriptions, lifecycle, 1000/mailbox limit) — https://learn.microsoft.com/graph/outlook-change-notifications-overview
- Subscription lifetime table (Outlook message = 10,080 min / ~7 days; rich = 1,440 min / ~1 day) — https://learn.microsoft.com/graph/change-notifications-overview#subscription-lifetime
- Shared/delegated folder access; application `Mail.Read` required for subscriptions, delegated `.Shared` can't subscribe — https://learn.microsoft.com/graph/outlook-share-messages-folders
- Mail permissions reference (`Mail.Read`/`Mail.ReadWrite`/`Mail.Send` application vs delegated) — https://learn.microsoft.com/graph/permissions-reference
- Scope app to specific mailboxes — RBAC for Applications (modern) https://learn.microsoft.com/exchange/permissions-exo/application-rbac · legacy ApplicationAccessPolicy https://learn.microsoft.com/graph/auth-limit-mailbox-access
