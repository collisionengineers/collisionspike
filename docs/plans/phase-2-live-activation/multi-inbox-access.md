# Plan — Add the other intake mailboxes (multi-inbox access)

> **Scope.** The domain model is **3 Outlook shared inboxes** (`docs/requirements/admin-overview.md:20`
> — "Three separate inboxes (most common)"). Today **only `digital@collisionengineers.co.uk`** is wired,
> via the `CS Intake` flow using **`OnNewEmailV3`** on the **connected** Office 365 account
> (`docs/architecture/live-environment.md:57`). This plan answers the password/sign-in question
> authoritatively, recommends the architecture for the remaining two inboxes, and gives a concrete,
> implementable runbook + verification.
>
> **Boundary.** Authoring/parameterising the flow definition is **[BUILD]** (Claude). Creating Outlook
> connections, granting Exchange Full Access, publishing webhook triggers in the designer, and live
> email tests are **[RESERVED-FOR-USER]** (the live-services boundary, memory `live-services-boundary`;
> `email-intake-activation.md`). Nothing here is activated by Claude.

---

## 1. The headline answer: does adding the other inboxes need a separate password / sign-in?

**It depends on the Exchange *mailbox type* of the two other inboxes — and this is the single fact that
must be confirmed live before building (see §7 open question).**

| If the other inbox is… | Separate password / new connection? | Why (authoritative) |
|---|---|---|
| A **shared mailbox** (Exchange `RecipientTypeDetails = SharedMailbox`) that the connected `digital@` account has **Full Access** to | **NO separate password.** Reuse the **existing** `cr1bd_sharedmailbox_office365` connection (`digital@`, id `bd752b83172a4e99b3db595942f1b30f`). | A shared mailbox **has no usable sign-in** — "every shared mailbox has a corresponding user account with a system-generated password that isn't known or intended for use… always block sign-in" ([Microsoft Learn — About shared mailboxes](https://learn.microsoft.com/microsoft-365/admin/email/about-shared-mailboxes)). The Office 365 connector's `When a new email arrives in a shared mailbox (V2)` trigger takes a **`mailboxAddress`** parameter and only requires that **"your account should have permission to access the mailbox"**; the known-issue note is explicit: it "won't work… unless one of the users has **full access** to the other mailbox" ([Office 365 connector reference](https://learn.microsoft.com/en-us/connectors/office365/)). Full Access is granted **administratively in Exchange/M365 admin center** (no password handover) — see [Give mailbox permissions to another user](https://learn.microsoft.com/microsoft-365/admin/add-users/give-mailbox-permissions-to-another-user) ("Read and Manage" = Full Access). |
| A **separate licensed user mailbox** (its own person/identity, e.g. another `name@collisionengineers.co.uk` with a real sign-in) | **YES — needs its own connection (interactive sign-in / OAuth) OR Full-Access delegation to digital@.** | The connected account's `OnNewEmailV3` only ever watches **its own** mailbox; to watch a *different licensed* mailbox you either (a) create a **new Office 365 Outlook connection** signed in as that user (a real sign-in/MFA), or (b) grant `digital@` **Full Access** to it and treat it like a shared mailbox via the V2 trigger. Option (b) is preferred — no second credential to manage. |

**What "delegated access" in the ground truth means.** `digital@` (the connected, licensed account that
the Code App + flows authenticate as) **already has delegated/Full Access to other mailboxes**. If the two
remaining intake inboxes are among those (and are shared mailboxes), then **the answer is: NO new password,
NO new connection** — the existing `digital@` connection + the **V2 shared-mailbox trigger** with a
`mailboxAddress` parameter is all that is required.

> **Trigger fact that forces the design (already a documented project gotcha, `AGENTS.md:29-31`,
> `live-environment.md:73`):**
> `OnNewEmailV3` ("When a new email arrives (V3)") monitors **only the connected account's own mailbox** —
> it has **no `mailboxAddress` parameter**. To watch *any* other mailbox you must switch that flow's
> trigger to **`SharedMailboxOnNewEmailV2`**, which **does** take `mailboxAddress` (required). One V2
> trigger watches **exactly one** mailbox address (it cannot fan out over a list).

---

## 2. Current state (verified live 2026-06-18; flow on/off refreshed 2026-06-21)

- **Connected identity / maker / current intake mailbox:** `digital@collisionengineers.co.uk`
  (`az account show` → user `digital@collisionengineers.co.uk`; `live-environment.md:14`).
- **Bound Outlook connection:** `cr1bd_sharedmailbox_office365` → connector `shared_office365` →
  connection `bd752b83172a4e99b3db595942f1b30f` ("Connected") — confirmed live via Dataverse
  `connectionreferences` GET. This is the **only** Outlook connection; reuse it.
- **Live flow `CS Intake`** (`workflowid 92131f3d-9cd5-4e88-aa9e-a5705a5850a0`, internal guid
  `8d534fc9-9058-a6f4-4dfd-245b350703b5`): trigger **`OnNewEmailV3`**, folder `Inbox`, **concurrency = 1**,
  `includeAttachments = true`. ON. Downstream **ON**: `CS Classify + Persist` (`2a6236f9…`),
  `CS Parse` (`468ffd29…`), `CS Provider Match` (`0f610d7c…`), `CS Case Resolve` (`1ddb50a5…`),
  `CS Status Evaluate` (`4d963ff7…`), `CS Enrich` (`4e0f301f…`) — the full digital@ chain went live
  2026-06-20/21. **OFF**: finalize (EVA+Box), chasers, jobsheet (`live-environment.md` §"Cloud flow inventory").
- **Authored definition `flows/definitions/intake.definition.json`** already uses
  **`SharedMailboxOnNewEmailV2`** with `mailboxAddress = @parameters('IntakeMailbox')`, `folderId = 'Inbox'`,
  `includeAttachments`, `hasAttachments`, `importance` — and carries the `MinIntakeDate` go-live guard +
  Message-ID dedup + provider-resolve. **So the offline definition is already shaped for the multi-inbox
  V2 pattern; the live flow simply diverged to V3 during activation** because a single connected mailbox
  was the fastest path to "first email → Case."

**Implication:** moving to multi-inbox = **re-converging the live flow onto the already-authored V2
definition** (per-mailbox), not inventing anything new.

---

## 3. Architecture options & recommendation

Three candidate shapes for N inboxes (here N = 3):

| Option | Shape | Verdict |
|---|---|---|
| **A. One flow per inbox, `SharedMailboxOnNewEmailV2`, all on the one `digital@` connection** (param `IntakeMailbox`) | 3 clones of `intake.definition.json`, identical except the `IntakeMailbox` parameter value. Each has its own webhook subscription, its own `concurrency = 1`, its own `MinIntakeDate`. | **✅ RECOMMENDED** (assuming shared mailboxes + Full Access). Matches the authored definition, the `power-automate-flow` skill, and the original Phase-1 design ("One flow instance per shared inbox (3)", `phase-1-…:189`, `:649`). Clean isolation, per-mailbox audit (`cr1bd_sourcemailbox`), independent enable/disable, no second credential. |
| **B. One flow, fan-out over a list of mailboxes** | Single flow trying to watch all 3. | **❌ Not possible with the V2 trigger.** A V2 trigger binds to exactly **one** `mailboxAddress`; "if you provide an array… the trigger will either fail silently or poll only the first." You'd have to abandon the native trigger for a polling `Recurrence` + Graph `HTTP with Microsoft Entra ID` loop — more moving parts, loses the webhook, loses per-mailbox concurrency. Reject for the spike. |
| **C. Duplicate the *whole* intake chain (intake→classify→resolve) per mailbox** | 3× every flow. | **❌ Over-build.** Only the **trigger** is mailbox-specific. Keep the single shared downstream chain (`classify-persist`, `case-resolve`, `provider-match`) and let each intake flow feed it (today via Dataverse handoff; later via child-flow `Request`). The `sourceMailbox` is already carried as data (`cr1bd_sourcemailbox`). |

### Recommended target topology (Option A)

```
                ┌─ CS Intake (digital@)   — V2 trigger, mailboxAddress = digital@…           ┐
3 webhook       ├─ CS Intake (inbox-2)    — V2 trigger, mailboxAddress = <inbox-2>           │  each: concurrency=1,
subscriptions   └─ CS Intake (inbox-3)    — V2 trigger, mailboxAddress = <inbox-3>           ┘  MinIntakeDate guard,
   (all on ONE digital@ Office 365 connection — Full Access, no new password)                   Message-ID dedup
                                   │
                                   ▼  (writes cr1bd_cases with cr1bd_sourcemailbox set)
        shared single downstream chain: Provider Match → Case Resolve (→ classify/parse/… as later phases turn on)
```

Three clean ways to instantiate the 3 flows (pick per operator preference):

1. **Designer "Save As"** of the working `CS Intake`, switch trigger to V2, set `mailboxAddress` per copy.
   Simplest for the operator; matches the "rebuild trigger in the designer" rule (webhooks **cannot** be
   armed by the Dataverse `clientdata` API — `AGENTS.md:23-28`, memory `flow-webhook-trigger-provisioning`).
2. **Solution import** of `intake.definition.json` 3× with different `IntakeMailbox` values (cleanest ALM;
   keeps all 3 in `CollisionSpikeFlows`). Each still needs a **designer publish** to register its webhook.
3. **One canonical flow today, scale later** — keep `digital@` as-is, only add the other two when confirmed.

> **Note on V3 vs V2 for `digital@` itself.** The live `CS Intake` currently uses **V3** on `digital@`.
> For a *uniform* 3-flow estate you would re-point it to **V2** with `mailboxAddress = digital@…`. This is
> optional: V3-on-digital@ already works. But uniformity (all three identical except the address param)
> simplifies maintenance and matches the authored definition. **If `digital@` is itself a *licensed* mailbox
> (likely — it's the maker identity), V3 is the correct trigger for it and V2 is only for the *shared*
> inboxes it has Full Access to.** Decide after §7 confirms the mailbox types.

---

## 4. Dedup, concurrency & ordering across multiple inboxes

The existing guards are **per-flow** and compose correctly across inboxes — but note two cross-inbox nuances:

- **Concurrency.** Each intake flow keeps **`concurrency = 1`** on its own trigger (re-add it in the
  designer or the save fails `CannotDisableTriggerConcurrency`, `email-intake-activation.md:60`). This
  serialises *within* one mailbox. The three flows run **independently in parallel** — fine, because the
  dedup keys are global, not per-flow.
- **Message-ID dedup is global and remains correct.** The Internet Message-ID (`cr1bd_sourcemessageid`,
  alternate key `cr1bd_case_sourcemessageid_key`) is **unique per email regardless of which mailbox saw it**,
  so the `Find_existing_by_messageId` get-or-create guard (`intake.definition.json:104-118`) already
  prevents a double-create even if the *same* email lands in two inboxes (e.g. To: inbox-2, Cc: inbox-3).
  Combined with per-flow `concurrency = 1`, the worst case is a benign `duplicate_dropped` audit on the
  second arrival — **no schema or logic change needed**.
- **Cross-provider safety (ADR-0010) is untouched.** Case-resolve's open-case lookup stays
  provider-scoped (`_cr1bd_workproviderid_value`); multi-inbox does not weaken the "never link across
  providers / never auto-merge on VRM+time" invariant (`flows/README.md:21-22`).
- **`MinIntakeDate` is per-flow.** Set it on **each** new flow at activation (default `2026-06-17`) so a
  newly-connected inbox does **not** ingest its historical backlog (`intake.definition.json:13-17`,
  `:43-75`). A freshly-connected inbox can have years of mail — this guard is the safety net; pick the
  cutoff = the go-live date for that inbox.
- **`sourceMailbox` provenance.** Each Case already records `cr1bd_sourcemailbox = @parameters('IntakeMailbox')`
  (`intake.definition.json:199,222`) and audits `mailbox=…` on ingest (`:161`). With V3 today this is the
  connected address; with the V2 multi-inbox pattern it becomes the **per-flow** mailbox — giving correct
  per-inbox attribution for free. (Minor: the live V3 flow may currently hardcode/omit this — verify and
  set it to the watched address when re-pointing.)

---

## 5. Parameterisation — keep ONE definition, ship to N mailboxes

The definition is **already parameterised** the right way (`intake.definition.json:8-17`):

- **`IntakeMailbox`** (String) → the trigger's `mailboxAddress`. **One definition → all 3 inboxes**; the
  only per-copy difference is this value. **Never hardcode a live address** in the authored definition
  (linter check #4, `flows/README.md:81`; `validate-flows.mjs`).
- **`MinIntakeDate`** (String, default `2026-06-17`) → set per-environment/per-inbox at activation.

> **Reality check on where the parameter lives (do not regress this).** `email-intake-activation.md:16`
> states, verified live, that `IntakeMailbox`/`MinIntakeDate` are **flow parameters**, **not Dataverse
> environment variables**. Keep them as flow parameters. (The intake definition's comments still mention an
> "or Dataverse env-var read" alternative — ignore that; the live decision is flow parameters.)

**Optional hardening for the spike:** drop `hasAttachments = true` only when the later
email-management/routing system lands (it's a documented TEMPORARY noise filter, `intake.definition.json:4`,
`flows/README.md:55-57`). Until then keep it on all three.

---

## 6. Implementable runbook (do ONE inbox first, then the third)

**Phase A — confirm prerequisites (operator, Exchange/M365 admin) — see §7.**
1. In **M365 admin center → Recipients → Mailboxes** (or **Exchange admin center → Recipients → Shared
   mailboxes**), confirm each of the **two other intake inboxes** is a **Shared mailbox**
   (`RecipientTypeDetails = SharedMailbox`). PowerShell equivalent (operator, Exchange Online):
   `Get-Mailbox <addr> | fl PrimarySmtpAddress,RecipientTypeDetails`.
2. Confirm/grant **`digital@collisionengineers.co.uk` Full Access** to each:
   `Add-MailboxPermission -Identity <inbox-2> -User digital@collisionengineers.co.uk -AccessRights FullAccess -InheritanceType All`
   (admin center: mailbox → **Manage mailbox delegation → Read and Manage → Add `digital@`**).
   **Allow up to ~2 hours for permission replication** before the trigger will fire
   (connector docs; `email-intake-activation.md` analogue).
   - If a target is a **licensed user mailbox** instead, either grant the same Full Access to `digital@`
     (preferred — then treat as shared) **or** plan a **separate Outlook connection** signed in as that user
     (a real interactive sign-in + MFA + consent — a new credential to own).

**Phase B — create/point the flow (operator, make.powerautomate.com, `Collision Engineers - Dev` env).**
3. **No new connection needed** if Full Access is in place — reuse `cr1bd_sharedmailbox_office365`
   (`digital@`). (Only create a new Office 365 Outlook connection if a target is a *licensed* mailbox you
   chose **not** to delegate.)
4. Instantiate the second intake flow (choose one):
   - **Save As** the live `CS Intake` → rename `CS Intake (inbox-2)`; **delete** the V3 trigger; **add**
     **"When a new email arrives in a shared mailbox (V2)"**; set **Original Mailbox Address /
     `mailboxAddress` = `<inbox-2 address>`**, **Folder = Inbox**, **Include Attachments = Yes**,
     **Only with Attachments = Yes** (temporary), **re-enable Concurrency = 1**; **Save** (this registers a
     fresh webhook — required; the Dataverse `clientdata`/Flow-API path will **not** arm it,
     `AGENTS.md:23-28`).
   - **or** import `flows/definitions/intake.definition.json` into `CollisionSpikeFlows` with
     `IntakeMailbox = <inbox-2 address>`, bind connection references, then **open in designer and Save** to
     publish the webhook.
5. Set this flow's **`MinIntakeDate`** = its go-live date (default `2026-06-17`) so backlog is skipped.
6. Leave downstream flows as-is (Provider Match + Case Resolve already ON and shared). The new intake flow
   writes `cr1bd_cases` the same way; no downstream change.

**Phase C — verify (see §8), then repeat steps 4–6 for the third inbox.**
   (Phase-1 rule: "activate ONE shared inbox first… only after single-mailbox success activate the
   remaining two", `phase-1-…:632,649`.)

---

## 7. The one big open question (confirm live before building)

**Are the two *other* intake inboxes Exchange *shared mailboxes* (with `digital@` holding Full Access), or
are they *licensed user mailboxes*?** This single fact decides the entire answer to "does it need a
password":

- **Shared + Full Access → NO new password, NO new connection.** One V2-trigger flow per inbox on the
  existing `digital@` connection. (Recommended path; everything in §3–§6 assumes this.)
- **Licensed mailbox → a new connection (interactive sign-in/OAuth) per such mailbox**, unless you instead
  grant `digital@` Full Access and treat it as shared.

**Why Claude can't answer it from here:** mailbox `RecipientTypeDetails` and Full-Access grants live in
**Exchange Online / M365 admin**, not Dataverse or Azure RM. The Dataverse `connectionreferences` GET
confirms only that *a* connection is bound (it is), not the Exchange type of any mailbox. Determining and
fixing this is squarely the operator's live-services step (memory `live-services-boundary`).

**How to confirm live (operator, ~2 min each):**
- Exchange Online PowerShell: `Get-Mailbox <addr> | fl PrimarySmtpAddress,RecipientTypeDetails` →
  expect `SharedMailbox`.
- `Get-MailboxPermission <addr> -User digital@collisionengineers.co.uk` → expect an `AccessRights`
  entry containing `FullAccess`.
- Smoke test the permission **before** building the flow: in **Outlook on the web as `digital@`**, use
  **Open another mailbox → `<inbox-2>`**; if it opens, Full Access is live and the V2 trigger will work
  (connector troubleshooting note: verify the account can open the mailbox).

**Secondary uncertainties (lower risk):**
- **Exact addresses of the other two inboxes are not documented** anywhere in the repo (requirements say
  "three separate inboxes" but never name them, `admin-overview.md:20`). Operator must supply them.
- **DLP:** Office 365 Outlook is Standard; all intake connectors must share one DLP data group (already
  true for the live flow, `email-intake-activation.md:72`). Adding flows on the **same** connection does not
  change the DLP posture.
- **Connector throughput:** three webhook subscriptions on one connection are well within Office 365
  connector limits for this volume; no action needed for the spike.

---

## 8. Verification plan

Per inbox, after Phase B:

1. **Permission is live** (pre-flight): as `digital@` in OWA, **Open another mailbox → `<inbox-N>`** opens
   successfully. (If not, wait for the ~2 h replication, then retry.)
2. **Trigger is healthy (webhook armed):** Flow Management API
   `GET …/environments/b3090c42-51fb-ee24-9868-474da322a3ad/flows/<new-workflowid>/triggers?api-version=2016-11-01`
   returns **200** (a **500** = unprovisioned subscription → re-publish in designer). Toolkit in
   `live-environment.md:93-96`.
3. **Send a test email** to `<inbox-N>`: 1 instruction PDF + 2 photos (overview with a legible plate + a
   damage closeup), `receivedDateTime ≥ MinIntakeDate`, **with an attachment** (because `hasAttachments`
   is on).
4. **Run fired:** `GET …/flows/<new-workflowid>/runs?api-version=2016-11-01` shows a **Succeeded** run
   within the poll interval (a few minutes).
5. **Case appears, attributed to the right inbox:** Dataverse
   `GET <org>/api/data/v9.2/cr1bd_cases?$select=cr1bd_name,cr1bd_sourcemailbox,cr1bd_sourcemessageid,createdon&$orderby=createdon desc&$top=5`
   → a new row with **`cr1bd_sourcemailbox = <inbox-N>`** and the email's Message-ID. Also visible on the
   Code App Dashboard (`new_email`).
6. **Dedup proof:** re-send the **same** email (same Message-ID) → **no** second Case; an
   `duplicate_dropped` AuditEvent is written
   (`GET …/cr1bd_auditevents?$filter=contains(cr1bd_name,'duplicate_dropped')&$orderby=cr1bd_occurredat desc`).
7. **Backlog guard proof (optional):** confirm an older email (`receivedDateTime < MinIntakeDate`) produces
   a `dropped_before_min_date` audit and **no** Case.
8. **Provider attribution (Layer-2, may be empty):** the Case auto-matches a WorkProvider only if the
   sender domain is in `WorkProvider.cr1bd_knownemaildomains` (seed via
   `dataverse/.build/15-seed-emaildomains.ps1`); otherwise it lands unmatched in review — expected, not a
   multi-inbox defect.

**Done when:** each of the 3 inboxes independently turns a test email into exactly one correctly-attributed
`cr1bd_cases` row, a duplicate is dropped, and all three trigger `/triggers` endpoints return 200.

---

## 9. Files & exact identifiers referenced

- **Flow definition (authored, V2-shaped, parameterised):**
  `C:/Users/Alex/Documents/GitHub/collisionspike/flows/definitions/intake.definition.json`
  — trigger `SharedMailboxOnNewEmailV2`, `mailboxAddress = @parameters('IntakeMailbox')`, `folderId='Inbox'`,
  `concurrency.runs = 1`; `MinIntakeDate` guard (`Drop_if_before_min_date`); Message-ID dedup
  (`Find_existing_by_messageId`).
- **Activation checklist:** `…/docs/activation/email-intake-activation.md` (V3-on-digital@ live reality;
  webhook-must-be-published-in-designer; flow-parameter vs env-var note).
- **Live registry:** `…/docs/architecture/live-environment.md` (connection `bd752b83172a4e99b3db595942f1b30f`;
  `CS Intake` workflowid `92131f3d-9cd5-4e88-aa9e-a5705a5850a0`, internal guid
  `8d534fc9-9058-a6f4-4dfd-245b350703b5`; verification toolkit).
- **Rules/gotchas:** `…/AGENTS.md:23-31` (webhook provisioning; V3=own mailbox / V2=shared).
- **Connection manifest:** `…/flows/connection-references.json` (`cr1bd_sharedmailbox_office365` →
  `shared_office365`, `usedBy: [intake]`).
- **Requirement:** `…/docs/requirements/admin-overview.md:20` ("Three separate inboxes").
- **Phase-1 design:** `…/plans/phase-1-intake-and-case-tracking-implementation.md:188-211, 632, 649`
  ("one flow instance per shared inbox (3)"; one-inbox-first).
- **Env id:** `b3090c42-51fb-ee24-9868-474da322a3ad`; **org:**
  `https://collisionengineers-dev.crm11.dynamics.com`.

## 10. Authoritative sources (Microsoft Learn)

- Office 365 connector reference — `SharedMailboxOnNewEmailV2` takes required `mailboxAddress`; "your
  account should have permission to access the mailbox"; known issue: "won't work… unless one of the users
  has **full access** to the other mailbox":
  <https://learn.microsoft.com/en-us/connectors/office365/>
- About shared mailboxes — shared mailbox has a system-generated password "not known or intended for use";
  always block sign-in; delegate access is through the delegate's own mailbox:
  <https://learn.microsoft.com/microsoft-365/admin/email/about-shared-mailboxes>
- Give mailbox permissions to another user — Full Access = "Read and Manage"; granted administratively, no
  password handover: <https://learn.microsoft.com/microsoft-365/admin/add-users/give-mailbox-permissions-to-another-user>
- Shared mailboxes in Exchange Online — Full Access lets a user act as owner of the mailbox via their own
  account: <https://learn.microsoft.com/exchange/collaboration-exo/shared-mailboxes>
- `When a new email arrives (V3)` is the connected-account trigger (no `mailboxAddress`):
  <https://learn.microsoft.com/power-automate/email-triggers>
- Shared-mailbox trigger attachment behaviour (Only-with-Attachments / Include-Attachments):
  <https://learn.microsoft.com/troubleshoot/power-platform/power-automate/flow-run-issues/issues-triggering-emails-with-attachments-from-shared-mailbox>
