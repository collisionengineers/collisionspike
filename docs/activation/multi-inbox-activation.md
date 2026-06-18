# Multi-inbox intake — activation how-to (operator)

> **What this covers.** Wiring the **other intake inboxes** (the domain model is **3 shared Outlook
> inboxes**, `docs/requirements/admin-overview.md:20`) onto the **parameterised** intake flow
> [`flows/definitions/intake-shared-mailbox.definition.json`](../../flows/definitions/intake-shared-mailbox.definition.json).
> One definition serves **any** inbox — the only per-copy difference is the `IntakeMailbox` flow
> parameter. Full rationale + architecture: [`plans/multi-inbox-access.md`](../../plans/multi-inbox-access.md).
> The single-mailbox `digital@` setup that is already LIVE is in
> [`email-intake-activation.md`](./email-intake-activation.md).

> **Boundary (why this is yours, not Claude's).** Every step below is an **interactive Microsoft 365 /
> Exchange action**: confirming a mailbox type, granting Exchange **Full Access**, creating an Office 365
> connection (browser + MFA + consent), **publishing the webhook trigger in the designer**, and the live
> email tests. There is **no headless/API path** for arming a connection-webhook trigger
> (`AGENTS.md:23-28`; memory `flow-webhook-trigger-provisioning`). Claude authored the definition
> **[BUILD]**; activation is **[RESERVED-FOR-USER]** (memory `live-services-boundary`).

Do everything at **make.powerapps.com** / **make.powerautomate.com** with the **`Collision Engineers -
Dev`** environment selected (env id `b3090c42-51fb-ee24-9868-474da322a3ad`).
**Do ONE inbox first; only after it succeeds, repeat for the third** (`plans/phase-1-…:632,649`).

---

## 0. The one decision that drives everything: shared mailbox vs licensed user mailbox

For **each** of the other intake inboxes, find out **which kind of Exchange recipient it is**. This single
fact decides whether you need a new password/connection.

| Inbox kind | New password / new connection? | What you do |
|---|---|---|
| **Shared mailbox** (`RecipientTypeDetails = SharedMailbox`) that `digital@` has **Full Access** to | **NO.** Reuse the existing `cr1bd_sharedmailbox_office365` connection (`digital@`, id `bd752b83172a4e99b3db595942f1b30f`). | **Scenario A** below. A shared mailbox has no usable sign-in; Full Access is granted administratively — no credential handover. |
| **Licensed user mailbox** (its own identity + real sign-in) | **Either** grant `digital@` Full Access and treat it as shared (**preferred**, becomes Scenario A) **or** create a **new** Office 365 connection signed in **as that user** (Scenario B — a real OAuth/MFA credential you then own). | **Scenario B** below. |

Authoritative basis (Microsoft Learn): the **"When a new email arrives in a shared mailbox (V2)"** trigger
takes a required **`mailboxAddress`** and only requires that *your account has permission to access the
mailbox*; its known-issue note is explicit that it "won't work… unless one of the users has **full
access**" — <https://learn.microsoft.com/en-us/connectors/office365/>. Shared mailboxes have a
system-generated password "not known or intended for use" (always block sign-in) —
<https://learn.microsoft.com/microsoft-365/admin/email/about-shared-mailboxes>. Full Access = "Read and
Manage", granted in the admin center with no password handover —
<https://learn.microsoft.com/microsoft-365/admin/add-users/give-mailbox-permissions-to-another-user>.

### 0.1 Confirm the mailbox type and Full Access (Exchange Online PowerShell, ~2 min per inbox)

```powershell
# One-time: connect to Exchange Online as an admin
Install-Module ExchangeOnlineManagement -Scope CurrentUser   # if not already installed
Connect-ExchangeOnline -UserPrincipalName <your-admin-upn>

# (1) Is it a shared mailbox?  Expect RecipientTypeDetails = SharedMailbox
Get-Mailbox -Identity <inbox-N-address> | Format-List PrimarySmtpAddress,RecipientTypeDetails

# (2) Does digital@ already hold Full Access?  Expect an AccessRights entry containing FullAccess
Get-MailboxPermission -Identity <inbox-N-address> -User digital@collisionengineers.co.uk |
  Format-List User,AccessRights,IsInherited,Deny
```

- **`RecipientTypeDetails = SharedMailbox`** → Scenario A (no new password).
- **`RecipientTypeDetails = UserMailbox`** (and the mailbox is a real person) → it's licensed → choose
  Scenario A-by-delegation (grant Full Access, recommended) or Scenario B (new connection).
- If step (2) shows **no `FullAccess`** row, grant it (admin):

```powershell
Add-MailboxPermission -Identity <inbox-N-address> `
  -User digital@collisionengineers.co.uk -AccessRights FullAccess -InheritanceType All
```

  Admin-center equivalent: **Exchange admin center → Recipients → Mailboxes →** select the mailbox **→
  Manage mailbox delegation → Read and Manage → Add `digital@`**.
  **Allow up to ~2 hours for permission replication** before the trigger will fire.

### 0.2 Smoke-test the permission BEFORE building the flow

In **Outlook on the web signed in as `digital@`**, use **Open another mailbox → `<inbox-N-address>`**. If
it opens, Full Access is live and the V2 trigger will work. If it does not open, wait for replication
(~2 h) and retry. (Connector troubleshooting note: verify the account can open the mailbox first.)

---

## Scenario A — shared mailbox (or licensed mailbox delegated to `digital@`): NO new password

**Prerequisite:** §0 confirmed Full Access for `digital@` and the OWA smoke-test passed.

### A.1 Connection — reuse, do not create
No new connection. The existing **`cr1bd_sharedmailbox_office365`** reference (bound to the `digital@`
Office 365 Outlook connection, id `bd752b83172a4e99b3db595942f1b30f`) is reused as-is. Confirm it is
**Connected**: **make.powerapps.com → Connections** (or **Solutions → `CollisionSpikeFlows` → Connection
references → `cr1bd_sharedmailbox_office365`**).

### A.2 Create the per-inbox flow
Pick whichever instantiation route suits you (all three give the same result; **all** require a **designer
Save** to arm the webhook):

1. **Save As the working `CS Intake`** (simplest): in the designer, **Save As** → name
   `CS Intake (inbox-N)`. **Delete** the existing trigger node, **add** **"When a new email arrives in a
   shared mailbox (V2)"**, and set:
   - **Original Mailbox Address** (`mailboxAddress`) = **`<inbox-N-address>`**
   - **Folder** = `Inbox`
   - **Include Attachments** = **Yes**
   - **Only with Attachments** = **Yes** *(temporary noise filter — `hasAttachments=true`)*
   - **Concurrency Control = On, Degree of parallelism = 1** *(re-enable it or the save fails
     `CannotDisableTriggerConcurrency`)*
   Then **Save** (a fresh trigger node forces a fresh webhook subscription — the Dataverse `clientdata` /
   Flow-API path will **not** arm it, `AGENTS.md:23-28`).

2. **or — solution import** of `flows/definitions/intake-shared-mailbox.definition.json` into
   `CollisionSpikeFlows`, set **`IntakeMailbox` = `<inbox-N-address>`**, bind the two connection references
   (`cr1bd_sharedmailbox_office365`, `cr1bd_dataverse`), then **open the flow in the designer and Save** to
   publish the webhook.

> The authored definition is **identical** for every inbox — `IntakeMailbox` is the only knob. It already
> carries the **Message-ID get-or-create dedup**, the **`MinIntakeDate` go-live guard**, **concurrency =
> 1**, the best-effort **provider-resolve**, and stamps **`cr1bd_sourcemailbox = IntakeMailbox`** on each
> Case for per-inbox attribution.

### A.3 Set `MinIntakeDate` for this inbox
Set this flow's **`MinIntakeDate`** parameter = **this inbox's go-live date** (default `2026-06-17`). A
newly-connected inbox can hold years of mail; this guard drops anything received before the cutoff so the
backlog is never ingested. (It's a **flow parameter**, not a Dataverse env-var — verified live.)

### A.4 Leave the downstream chain as-is
`CS Provider Match` and `CS Case Resolve` are already ON and **shared** across all inboxes. The new intake
flow writes `cr1bd_cases` the same way; **no downstream change**. (Per `plans/phase-1-operational.md` the
classify-persist/parse/status-evaluate flows are presently orphaned/manual — that is a separate gap, not a
multi-inbox concern.)

---

## Scenario B — separate **licensed** user mailbox: its own connection (interactive sign-in)

Use this **only** if you chose **not** to delegate Full Access to `digital@` for a licensed mailbox.
(Delegation → Scenario A is preferred: no second credential to own.)

### B.1 Create a new Office 365 Outlook connection signed in AS the mailbox user
**make.powerapps.com → Connections → + New connection → Office 365 Outlook →** sign in **as the licensed
user** that owns `<inbox-N-address>` (real browser + MFA + consent). This mints a **new** connection
instance — a credential you now own and must maintain (it does not expire until revoked).

> Alternative without that user's password: if your **work/school admin account** has been granted **Send
> As / Send on behalf / Full Access** on that mailbox, you can instead sign the connection in as your own
> account and address the mailbox via permission — see *Connect using other accounts*,
> <https://learn.microsoft.com/azure/connectors/connectors-create-api-office365-outlook>. For **reading new
> mail** (our trigger), **Full Access** is the relevant grant, which collapses back into Scenario A.

### B.2 Wire the connection reference
Because the connector swagger exposes the V2 trigger under the single logical reference
**`cr1bd_sharedmailbox_office365`**, you have two clean options:

- **Simplest for the spike:** in **Solutions → `CollisionSpikeFlows` → Connection references →
  `cr1bd_sharedmailbox_office365` → Edit**, point it at the **new** connection from B.1, then build this
  inbox's flow exactly as in **A.2/A.3**. (Trade-off: that reference now serves this licensed inbox's
  connection; if other inboxes use the `digital@` connection, prefer the next option so they don't share
  one reference.)
- **Cleaner when mixing `digital@`-shared and licensed inboxes:** **Save As** the flow in the designer and,
  on the V2 trigger node, **switch the connection** (the "⋯ → + Add new connection" picker on the action)
  to the B.1 connection for **this flow only** — the per-flow connection binding overrides the shared
  reference. Set `mailboxAddress` = `<inbox-N-address>`, Folder/Attachments/Concurrency as in A.2, **Save**.

> **Do not** add a brand-new connection *reference* to `flows/connection-references.json` for this — that
> manifest is the closed set the linter checks and is owned elsewhere. The per-flow connection override (or
> re-pointing the existing reference) is sufficient.

### B.3 + B.4 — `MinIntakeDate` and downstream
Same as **A.3** and **A.4**.

---

## Verify (per inbox, after building the flow)

Toolkit (Flow Management API needs `az account get-access-token --resource https://service.flow.microsoft.com/`;
Dataverse needs `--resource <org>/`):

1. **Permission live (pre-flight):** as `digital@` in OWA, **Open another mailbox → `<inbox-N>`** opens.
2. **Webhook armed:**
   `GET …/environments/b3090c42-51fb-ee24-9868-474da322a3ad/flows/<new-workflowid>/triggers?api-version=2016-11-01`
   returns **200**. A **500** = unprovisioned subscription → re-open in the designer and **Save** (re-add
   the trigger node if needed).
3. **Send a test email** to `<inbox-N>`: 1 instruction PDF + 2 photos (an **overview with a legible
   plate** + a **damage closeup**), `receivedDateTime ≥ MinIntakeDate`, **with an attachment** (because
   `hasAttachments` is on).
4. **Run fired:** `GET …/flows/<new-workflowid>/runs?api-version=2016-11-01` shows a **Succeeded** run
   within the poll interval (a few minutes).
5. **Case appears, correctly attributed:**
   `GET <org>/api/data/v9.2/cr1bd_cases?$select=cr1bd_name,cr1bd_sourcemailbox,cr1bd_sourcemessageid,createdon&$orderby=createdon desc&$top=5`
   → a new row with **`cr1bd_sourcemailbox = <inbox-N>`** and the email's Message-ID. Also on the Code App
   Dashboard (`new_email`).
6. **Dedup proof:** re-send the **same** email (same Message-ID) → **no** second Case; a
   `duplicate_dropped` AuditEvent is written
   (`GET …/cr1bd_auditevents?$filter=contains(cr1bd_name,'duplicate_dropped')&$orderby=cr1bd_occurredat desc`).
7. **Backlog guard (optional):** an older email (`receivedDateTime < MinIntakeDate`) produces a
   `dropped_before_min_date` audit and **no** Case.
8. **Provider attribution (may be empty):** the Case auto-matches a WorkProvider only if the sender domain
   is in `WorkProvider.cr1bd_knownemaildomains` (seed via `dataverse/.build/15-seed-emaildomains.ps1`);
   otherwise it lands unmatched in review — expected, not a multi-inbox defect.

**Done when:** each inbox independently turns a test email into exactly **one** correctly-attributed
`cr1bd_cases` row, a duplicate is dropped, and its `/triggers` endpoint returns 200. Then repeat for the
next inbox.

---

## What the operator must confirm / supply

- **The two other inbox addresses** — not documented anywhere in the repo (`admin-overview.md:20` says
  "three separate inboxes" but never names them). **You must supply them.**
- **Each inbox's `RecipientTypeDetails`** (shared vs licensed) via `Get-Mailbox` (§0.1) — decides
  Scenario A vs B.
- **`digital@` Full Access** on each shared inbox via `Get-MailboxPermission` / `Add-MailboxPermission`
  (§0.1), then ~2 h replication + the OWA smoke-test (§0.2).
- **DLP:** Office 365 Outlook (Standard) + Dataverse (Premium) must share one DLP data group in the Dev
  environment (already true for the live flow). Adding flows on the **same** connection doesn't change the
  DLP posture.
- **Premium licence** for each new flow's owner (already required for the Code App / existing flows).

## Reference

- Plan + architecture (Option A, V3-vs-V2, cross-inbox dedup): `plans/multi-inbox-access.md`.
- Single-mailbox live setup (`digital@`, V3): `docs/activation/email-intake-activation.md`.
- Flow definition (this doc activates it): `flows/definitions/intake-shared-mailbox.definition.json`
  (mirrors `flows/definitions/intake.definition.json`; `IntakeMailbox` is the only per-inbox knob).
- Webhook-must-be-published-in-designer rule: `AGENTS.md:23-31`; memory `flow-webhook-trigger-provisioning`.
- Live registry (ids, verification toolkit): `docs/architecture/live-environment.md`.
