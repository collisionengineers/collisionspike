# Email intake — activation checklist (operator, ~5–10 min)

> **✅ STATUS 2026-06-18: Email intake is LIVE and verified.** The `CS Intake` flow trigger was rebuilt to
> **`When a new email arrives (V3)`** (monitors the connected `digital@` mailbox, folder `Inbox`,
> concurrency = 1) and published through the make.powerautomate.com designer — a test email now creates a
> real `cr1bd_cases` row. The checklist below is kept for re-creating the setup elsewhere. **Key
> corrections vs the original text:** the live trigger is **V3 on the connected mailbox**, *not* the
> shared-mailbox V2 trigger, and V3 has **no `IntakeMailbox`/mailboxAddress** parameter. A connection-webhook
> trigger **cannot** be armed via the Dataverse `clientdata` API — it must be (re)published in the
> designer; rebuilding a corrupt trigger needs concurrency re-added (`CannotDisableTriggerConcurrency`).
> See memory `flow-webhook-trigger-provisioning`.

> **Why this is yours, not Claude's.** Every step here is an **interactive sign-in to your Microsoft 365 /
> mailbox** (browser + MFA + consent) or a **flow-activation** setting. There is no headless/API path for it:
> creating an Office 365 Outlook connection requires *you* to authenticate, and `IntakeMailbox`/`MinIntakeDate`
> are **flow parameters** (verified live — not Dataverse environment variables), set when the flow turns on.
> This is also the live-inbox boundary the project reserves for the operator (DEPLOY-RUNBOOK §7).
> Claude *can* run the domain seed (`15-seed-emaildomains.ps1`) once you supply the list — that's Dataverse data.

Do everything at **make.powerapps.com** with the **`Collision Engineers - Dev`** environment selected (top-right).
Do **one mailbox first**.

## Step 1 — Create 4 connections  (left nav → **Connections → + New connection**)

| Connection | What to enter | Tier |
|---|---|---|
| **Office 365 Outlook** | Sign in as an account that can read the shared mailbox (member, or delegate/Read access). | Standard |
| **Microsoft Dataverse** | Sign in (usually one click). | Premium |
| **Azure Blob Storage** | The **evidence storage account** (from the Functions infra) — account name + access key (or SAS/Entra). If none exists, create a storage account + a container first. | Premium |
| **CE Parser** (under **Custom connectors** → it's listed → **+ New connection**) | API key prompt → paste the parser **function key**:<br>`A31IJ9kySfjhR-9bizHWvjWoXk7uDvEuLfDcd1gkJnWxAzFuzYZHaA==`<br>(host `https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net`). Non-sensitive dev key. | Premium |

Skip Box / EVA Sentry / EVA Validation / DVSA / Excel — later phases.

## Step 2 — Bind the connection references  (**Solutions → `CollisionSpikeFlows` → Connection references**)

Open each, **Edit**, pick the Step-1 connection:

| Connection reference | Bind to |
|---|---|
| `cr1bd_sharedmailbox_office365` | Office 365 Outlook |
| `cr1bd_dataverse` | Microsoft Dataverse |
| `cr1bd_evidenceblob` | Azure Blob Storage |
| `cr1bd_ceparser` | CE Parser |

(Shortcut: the first time you turn a flow **On** it offers to fix unbound connections inline — same result.)

## Step 3 — Point it at ONE mailbox

**Live reality (2026-06-18):** the `CS Intake` trigger is **`When a new email arrives (V3)`** — operationId
`OnNewEmailV3`, which monitors the **connected account's own mailbox** (so whatever `digital@…` the
Office 365 connection is signed in as). Parameters: `folderPath = Inbox`, `fetchOnlyWithAttachment = false`
(fires on **all** inbound mail — narrow this before real traffic), `includeAttachments = true`,
concurrency = 1. There is **no `IntakeMailbox`/mailboxAddress** parameter on V3 — to change which mailbox is
watched, change the **connection**, not a flow parameter. The `MinIntakeDate` go-live guard
(`2026-06-17`) is an in-flow action, not a trigger parameter.

> ⚠️ To re-create in a new env (or if the trigger ever stops firing — `/triggers` API returns 500, zero
> runs): open the flow in the **designer**, **delete** the trigger, **re-add** `When a new email arrives
> (V3)`, set Folder = `Inbox`, re-enable **Concurrency control → 1** (else save fails
> `CannotDisableTriggerConcurrency`), then **Save**. A fresh trigger node forces a fresh webhook
> subscription. Editing via the Dataverse `clientdata` API will **not** register the subscription.

## Step 4 — Turn flows ON (this order, one mailbox)  (**Solutions → `CollisionSpikeFlows`**)

`intake` → `classify-persist` → `parse` → `provider-match` → `case-resolve`

Leave OFF: `status-evaluate` (needs an EVA-validation connector not deployed yet), `enrich`, `finalize-eva-box`,
`chaser-draft`, `jobsheet-import` (later phases).

## Step 5 — DLP, then test

- **DLP:** all these connectors must sit in the **same DLP data group** in the Dev environment or the flows
  won't run (Office 365 Outlook = Standard; Dataverse/Blob/CE Parser = Premium/custom).
  Admin center → Policies → Data policies.
- **Test:** email yourself → that mailbox with 1 instruction PDF + 2 photos (overview with a legible plate +
  a damage closeup). Within the trigger poll (a few minutes) a **Case appears** in the Code App Dashboard
  (`new_email → ingested`, fields parsed).

## Two gates on the result
1. **Auto-match needs domains (Layer 2).** The Case appears regardless, but only **auto-matches to a provider**
   if that sender domain is in `WorkProvider.knownemaildomains`. Fill `dataverse/.build/email-domains.csv`
   and run `15-seed-emaildomains.ps1` (dry-run first). Until then, Cases land **unmatched** in review.
2. **Premium licence** — the flow owner needs Power Apps/Automate Premium (already required for the Code App).

## Adding the OTHER intake inboxes (multi-inbox)

The steps above wire the **single** connected `digital@` mailbox (V3 trigger). The domain model is **3
shared inboxes**. To add the remaining two — onto the **parameterised** definition
`flows/definitions/intake-shared-mailbox.definition.json` (V2 trigger, `mailboxAddress =
@parameters('IntakeMailbox')`, one definition per inbox) — follow the dedicated runbook:
**[`multi-inbox-activation.md`](./multi-inbox-activation.md)** (plan: `docs/plans/phase-2-live-activation/multi-inbox-access.md`).

Headline: **if the other inbox is a *shared mailbox* that `digital@` has Exchange *Full Access* to, you
need NO new password and NO new connection** — reuse `cr1bd_sharedmailbox_office365`. If it's a *licensed
user mailbox*, either grant `digital@` Full Access (preferred → treat as shared) or create a **new** Office
365 connection signed in **as that user**. Confirm the type first with
`Get-Mailbox <addr> | fl RecipientTypeDetails` and `Get-MailboxPermission <addr> -User digital@…`. Every
new flow's webhook still has to be **published in the designer** (not via the Dataverse `clientdata` API).
