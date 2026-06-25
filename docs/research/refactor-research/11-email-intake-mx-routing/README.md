# 11 — Email Intake & MX Routing (the alternative to the Graph "tax")

> **Why this doc exists.** Folder [`10`](../10-outlook-m365-integration/README.md) closes with an open
> question: *must* a non-Microsoft target read the existing Outlook mailboxes via Microsoft Graph, or
> could you **MX-route a dedicated intake address straight to a non-Microsoft inbound-email service**
> and skip Graph entirely? This doc explains what MX routing is, the two intake architectures it
> enables, and when each is the right call for collisionspike.
>
> Provider facts below are verified against primary sources (June 2026); cited inline.

---

## What is MX routing?

**MX = "Mail eXchanger".** An **MX record** is a DNS record that tells the rest of the internet
*which mail server is responsible for receiving email for a domain.* It's the signpost at the front
door of a domain's email.

When someone sends mail to `claims@collisionengineers.co.uk`, the sender's mail server:

1. Looks up the **MX record** for `collisionengineers.co.uk` in DNS.
2. Gets back a hostname (e.g. `collisionengineers-co-uk.mail.protection.outlook.com` — Microsoft 365's
   inbound server) and a **priority** number (lower = preferred; extra MX records give failover).
3. Connects to that server over SMTP and delivers the message.

So **"MX routing" = deciding, via DNS, where a domain's incoming mail is delivered.** Today, Collision
Engineers' MX records point at **Microsoft 365 / Exchange Online** — which is *why* all mail lands in
Outlook. Change the MX records, and you change where mail goes.

### The one rule that shapes everything here

**MX records are per-DOMAIN (or per-SUBDOMAIN), not per-ADDRESS.** You cannot set an MX record for
just `intake@domain.com`. You can only route at the level of:

- the whole domain `collisionengineers.co.uk`, or
- a **subdomain** `intake.collisionengineers.co.uk` (which can have its own MX), or
- a separate domain `ce-intake.co.uk`.

This is the hinge: to send *only intake mail* somewhere other than Outlook **without disturbing staff
email**, you need a **dedicated subdomain or domain** for intake — you can't carve out a single
mailbox via MX.

---

## The two intake architectures

| | **A. Read the existing mailboxes** (folder 10) | **B. MX-route a dedicated intake address** (this doc) |
|---|---|---|
| Mail still lands in | Outlook / M365 (unchanged) | A non-Microsoft inbound-email service |
| Mechanism | Microsoft **Graph** subscription + webhook + 7-day renewal | New **MX record** on a dedicated subdomain → provider POSTs a webhook per email |
| Senders (work providers) | **Unchanged** — keep emailing the addresses they already use | **Must use the new address** (`cases@intake.…`) — a business-process change |
| Microsoft in the path? | Yes (mailboxes stay in M365) | **No** — fully decoupled from Microsoft for intake |
| Spam/malware filtering | M365 Exchange Online Protection keeps protecting it | **Becomes your problem** (you leave EOP) |
| Integration shape | Entra app + Graph + renewal loop | DNS change + a webhook handler; no Entra app, no renewal |
| Run-cost | ~$0 | ~$0 to a few $/mo |

**The trade is senders-vs-simplicity.** Option B removes the Graph "tax" entirely and cleanly
de-couples intake from Microsoft — *but* it only works if the people sending you cases (insurers /
work providers) will send to a **new address you control**. Option A leaves their behaviour
untouched, which is usually why it's the pragmatic default.

---

## When MX routing (Option B) makes sense for collisionspike

✅ **Good fit if:**
- You're moving to a non-Microsoft target (folders 03–08) **and** are willing to publish a dedicated
  intake address (`cases@intake.collisionengineers.co.uk`) and ask work providers to use it — or you
  already control how new instructions are addressed.
- You want the simplest possible integration: no Entra app, no Graph subscription renewal, no
  per-mailbox subscription limits — just "an email arrives → the provider POSTs JSON + attachments to
  your endpoint."
- Reducing Microsoft dependency for the *intake channel itself* is a goal (it's the one place Option A
  can't shed Microsoft).

❌ **Poor fit if:**
- Work providers email **established, human-monitored addresses** and can't be moved (very common) —
  forcing a new address is a real change-management cost, and mail sent to the old address would no
  longer be picked up.
- Staff also need to **see/triage the mail in Outlook** (Option B takes it out of the mailbox unless
  you also forward a copy).
- You don't want to own spam filtering / deliverability that M365 currently handles for free.

> **Hybrid middle path:** keep the existing mailboxes on M365 (senders unchanged) **and** add an M365
> **mail-flow / transport rule** that forwards a copy of intake mail to an external inbound-parse
> webhook. This avoids both the Graph renewal loop *and* the sender change — but it keeps Microsoft in
> the path (not really "leaving"), and **forwarding can mangle attachments/headers** (SRS rewrite,
> message wrapping) which matters for a parser that needs the original files. Note M365 **blocks
> external auto-forwarding by default** (anti-spam outbound policy), so this needs an explicit admin
> rule. Generally inferior to Option A's Graph read for a parser-driven pipeline.

---

## Inbound-email providers for Option B (MX target)

| Provider | Cost (small volume) | EU/UK residency | Notes |
|---|---|---|---|
| **AWS SES inbound** | ~$0.10/1,000 emails + $0.09/1,000 chunks | ⚠️ **eu-west-1 (Ireland) only — NOT London**; receiving isn't supported in eu-west-2/Frankfurt/Paris | MX → `inbound-smtp.eu-west-1.amazonaws.com`; receipt rule → S3 + Lambda/SNS. Natural fit for the AWS target ([03](../03-migration-to-aws/README.md)) but the London-residency gap is real |
| **Cloudflare Email Routing** | **Free** | EU routing; **requires the domain's DNS on Cloudflare**, adds MX to the **whole zone** (use a dedicated zone/subdomain) | Forward to an address *or* to an **Email Worker** (process inbound in code). Inbound only — doesn't send. Cleanest free option, esp. with the Cloudflare target ([06](../06-cloudflare/README.md)) |
| **SendGrid Inbound Parse** | Free–cheap | Twilio EU data residency available | MX → `mx.sendgrid.net`; POSTs a multipart webhook with parsed fields + attachments |
| **Mailgun Routes** | Free tier then usage | **EU region** (mailgun.eu) | MX → Mailgun; "Routes" POST inbound to your webhook; good EU story |
| **Postmark inbound** | Cheap | US-based historically — check before using for UK PII | Reliable inbound-parse webhook; confirm residency |

All five turn "an email arrived" into "a clean HTTP POST with the body + attachments" — which is
exactly what the parser/case-create step wants, and is simpler than Graph's change-notification model.

### Deliverability you must set up for a new intake (sub)domain

Moving intake mail off M365 means **you** now own its email reputation. For the dedicated
subdomain/domain, configure:

- **SPF** (authorise the provider's sending/receiving infrastructure),
- **DKIM** (signing keys from the provider),
- **DMARC** (alignment policy),
- and accept that **spam/malware filtering moves to you / the provider** — you lose Microsoft's
  Exchange Online Protection on that path. For an intake address that receives attachments from
  external parties, malware scanning matters.

---

## Recommendation for collisionspike

- **Default to Option A (Graph, folder 10)** unless there's a clear appetite to re-address intake.
  Work providers already email established shared mailboxes; Graph reads them in place, keeps EOP spam
  filtering, and keeps the mail visible to staff in Outlook. The cost is the Graph subscription +
  webhook + renewal — a known, contained build.
- **Choose Option B (MX routing)** if (a) you're going non-Microsoft *and* (b) you can publish a
  dedicated intake address (`cases@intake.collisionengineers.co.uk`) and get providers to use it. It
  then **eliminates the Graph tax** and fully decouples intake from Microsoft — at the price of a
  sender change-management exercise + owning deliverability/spam.
- **If on AWS**, weigh the **SES inbound = Ireland-only** residency point ([03](../03-migration-to-aws/README.md));
  **if on Cloudflare**, Email Routing → Email Worker is the cheapest, cleanest Option-B path
  ([06](../06-cloudflare/README.md)).
- This choice is worth settling **before** committing a target, because it changes the intake build
  on every non-Microsoft option — fold it into the [`README` "next step" spike](../README.md#suggested-next-step).

## Sources

- DNS MX records (concept) — https://developers.cloudflare.com/dns/manage-dns-records/how-to/email-records/ · https://learn.microsoft.com/microsoft-365/admin/get-help-with-domains/create-dns-records-at-any-dns-hosting-provider
- AWS SES email **receiving** region limits (eu-west-1 yes; eu-west-2/London no) — https://docs.aws.amazon.com/ses/latest/dg/regions.html · https://docs.aws.amazon.com/general/latest/gr/ses.html
- Cloudflare Email Routing (free, inbound, Email Workers, takes over zone MX, requires Cloudflare DNS) — https://developers.cloudflare.com/email-routing/ · https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/
- SendGrid Inbound Parse — https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook · Mailgun Routes — https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/
- M365 external auto-forwarding blocked by default — https://learn.microsoft.com/microsoft-365/security/office-365-security/outbound-spam-policies-external-email-forwarding
- Companion: reading existing Outlook mailboxes via Graph — [10-outlook-m365-integration](../10-outlook-m365-integration/README.md)
