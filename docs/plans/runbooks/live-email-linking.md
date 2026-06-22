# Runbook — Live email linking: `digital@` → all three shared inboxes

> **Atomized, numbered operator runbook** to take live email intake from **`digital@` only** to **all
> three shared Outlook inboxes** (the domain model — `docs/requirements/admin-overview.md:20`, "Three
> separate inboxes (most common)"), and to confirm the provider sender-domain **matching** path along the
> way. Planning document only — it changes **no** code and **no** live resource.
>
> **Live truth this is grounded in** (read these first): `CLAUDE.md`, `CURRENT_STATUS.md`,
> `docs/gated.md` (items 1, 2, 3), `docs/architecture/live-environment.md` (the registry), and the two
> source plans `docs/plans/phase-2-live-activation/multi-inbox-access.md` (the *how*) +
> `docs/plans/phase-2-live-activation/multi-inbox-feasibility.md` (the *whether / not-yet*), plus the
> per-inbox how-to `docs/activation/multi-inbox-activation.md`.

---

## The boundary (read before doing anything)

**Every linking step below is `[O]` operator-only** — there is **no headless / API path** for the
load-bearing parts:

- **Live email sends** (the only way to test intake) — Claude cannot send mail.
- **Office 365 Outlook connection authorization** — interactive browser sign-in + MFA + consent.
- **Exchange mailbox-type checks + Full-Access grants** — live in Exchange Online / M365 admin.
- **Arming a connection-trigger subscription** — these email triggers are
  `OpenApiConnectionNotification` (polling-style) operations whose subscription **cannot** be armed via
  the Dataverse `clientdata` / Flow API; each new per-inbox flow needs an **interactive designer Save**
  to register a fresh subscription (memory `flow-webhook-trigger-provisioning`;
  `multi-inbox-feasibility.md` §4b). This is exactly why `digital@` was dead until its trigger was
  rebuilt in `make.powerautomate.com`.

`[C]` = a step Claude can do (offline repo work or non-inbox **Dataverse data**). `[O]` = reserved for
the operator (memory `live-services-boundary`: live email sends, connection auth, and Entra consent stay
the operator's). Where a step is `[C]`, it is still **only** Claude-doable once the operator supplies the
prerequisite input (e.g. the provider→domain CSV) and gives an explicit go-ahead.

> **Standing guardrail (do not skip).** `multi-inbox-feasibility.md` is **investigate-only** and its §8
> Q3 says **confirm the operator actually wants a 3-inbox rollout before spending build effort**. Only
> **`digital@collisionengineers.co.uk`** is an authorized **test** inbox. `Info@` / `Engineers@`(intake) /
> `Desk@` are **LIVE and operator-only** — do **not** send test mail to them until they are deliberately
> being activated (Part C). Part A (verify `digital@`) and Part D (matching) need **no** go-ahead; Part B
> + Part C (turn on the other two) need the operator's explicit decision to proceed.

---

## Fixed identifiers (verified live, from `docs/architecture/live-environment.md`)

| Thing | Value |
|---|---|
| Work environment | `Collision Engineers - Dev` — env id **`b3090c42-51fb-ee24-9868-474da322a3ad`** |
| Dataverse org URL | `https://collisionengineers-dev.crm11.dynamics.com` |
| Maker / intake mailbox / connection identity | `digital@collisionengineers.co.uk` |
| Live intake flow | **CS Intake (shared mailbox)** — `workflowid 92131f3d-9cd5-4e88-aa9e-a5705a5850a0` (internal guid `8d534fc9-9058-a6f4-4dfd-245b350703b5`), **State = ON**, trigger **`OnNewEmailV3`** (own mailbox, `Inbox`, concurrency=1) |
| The ONE Office 365 Outlook connection | reference `cr1bd_sharedmailbox_office365` → connector `shared_office365` → connection **`bd752b83172a4e99b3db595942f1b30f`** (digital@, Connected) |
| Dataverse connection | `cr1bd_dataverse` → `shared_commondataserviceforapps` → `c1c7d4e6c3ad40ab9ac7ac63dcfd02c0` (Bound) |
| Flows solution | **CollisionSpikeFlows** — id `41c87a85-f191-409e-af50-7d1d972c881a`, unmanaged |
| Parameterised per-inbox flow definition (V2) | `flows/definitions/intake-shared-mailbox.definition.json` |
| Live-shaped flow definition (V3, hot-path) | `flows/definitions/intake.definition.json` |
| Provider-domain seed script | `dataverse/.build/15-seed-emaildomains.ps1` (CSV `dataverse/.build/email-domains.csv`) |

> **The trigger trap (load-bearing).** `OnNewEmailV3` ("When a new email arrives (V3)") watches **only
> the connected account's own mailbox** and has **no `mailboxAddress` parameter**. To watch **any other**
> mailbox you must use **`SharedMailboxOnNewEmailV2`** ("When a new email arrives in a shared mailbox
> (V2)"), which takes a **required `mailboxAddress`**. Reusing V3 for another inbox silently re-watches
> `digital@` (`live-environment.md` gotcha #3; `multi-inbox-feasibility.md` §4a). One V2 trigger watches
> **exactly one** mailbox — it cannot fan out over a list, hence **Option A: one flow per inbox**
> (`multi-inbox-access.md` §3; fan-out Option B and whole-chain-duplicate Option C are rejected there).

---

# Part A — Verify `digital@` intake still creates cases after the provider-match change

> **Why first.** `docs/gated.md` item 1: the provider-match logic on the live `CS Intake` flow was
> changed (the anchored exact-domain match — see Part D). Confirm intake still turns an email into a Case
> **before** touching anything else. This is the safe baseline.

### A1. Send a test email to `digital@`  ·  **GATE: live mail send** · `[O]`
- **Goal:** prove the live intake trigger still fires and creates a Case post-change.
- **Exact action:** from any account, send a short email **with at least one attachment** to
  **`digital@collisionengineers.co.uk`**. The live trigger has `fetchOnlyWithAttachment=true`
  (`intake.definition.json` trigger `fetchOnlyWithAttachment`), so a no-attachment email will **not**
  fire — include an attachment. Use `receivedDateTime ≥ 2026-06-17` (today's mail is fine; the
  `MinIntakeDate` go-live guard drops older mail).
- **GATE:** Claude cannot send mail; only `digital@` is an authorized test inbox.
- `[O]`

### A2. Confirm a new Case appears  ·  **GATE: none (read-only)** · `[O]` *(or `[C]` via API)*
- **Goal:** see the Case the email produced.
- **Exact action — app:** wait ~1 minute, open the Code App Dashboard
  (`https://apps.powerapps.com/play/e/b3090c42-51fb-ee24-9868-474da322a3ad/app/da7ba7af-9ffc-4c70-8f75-1f053ca354da`);
  a new case appears (`new_email`).
- **Exact action — API (optional cross-check, `[C]`-doable):**
  ```pwsh
  $tok = az account get-access-token --resource "https://collisionengineers-dev.crm11.dynamics.com/" --query accessToken -o tsv
  # GET <org>/api/data/v9.2/cr1bd_cases?$select=cr1bd_name,cr1bd_sourcemailbox,cr1bd_sourcemessageid,createdon&$orderby=createdon desc&$top=5
  ```
  Expect a fresh row; `cr1bd_sourcemailbox` reflects the configured value for the live V3 flow.
- **GATE:** none — read-only.
- `[O]` to observe in-app (a paid Code App player session); the API cross-check is `[C]`.

### A3. If nothing appears — rollback to the kept backup  ·  **GATE: designer publish** · `[O]`
- **Goal:** restore the exact pre-change intake flow in one step.
- **Exact action:** the provider-match change kept a backup of the intake flow (`docs/gated.md` item 1:
  "I kept a backup and can put the inbox flow back to exactly how it was in one step"). To restore: in
  **make.powerautomate.com → Solutions → CollisionSpikeFlows → CS Intake (shared mailbox)** open
  **Version history / Restore** to the pre-change version, **or** re-import the backed-up flow version,
  then **open in the designer and Save** to re-arm the V3 trigger subscription (a `clientdata`/API
  restore alone will **not** re-arm it). See the rollback note at the end of this runbook.
- **GATE:** restoring + re-arming the trigger is a designer publish (operator-only).
- `[O]`

> **Done when A is green:** a test email to `digital@` produces exactly one Case within ~1 minute. Do
> **not** proceed to Part B/C until A passes (or has been rolled back and re-verified).

---

# Part B — Confirm mailbox type + Full Access for the two other inboxes (prerequisite to cloning)

> `docs/gated.md` item 2; `multi-inbox-activation.md` §0. **This single fact — `RecipientTypeDetails` —
> decides whether ANY new password/connection is needed.** Do this before building any clone.
> **Requires the operator's explicit go-ahead to proceed** (feasibility §8 Q3).

### B1. Supply the two inbox SMTP addresses  ·  **GATE: operator knowledge** · `[O]`
- **Goal:** know exactly which addresses to wire.
- **Exact action:** record the **exact SMTP addresses** of the two other intake inboxes. The repo names
  them only conceptually (Info / Engineers-intake / Desk, `multi-inbox-feasibility.md` §1); the **real
  addresses are not in the repo** and only the operator has them (`multi-inbox-access.md` §7,
  `multi-inbox-feasibility.md` §8 Q1).
- **GATE:** operator-supplied data.
- `[O]`

### B2. Confirm each inbox's recipient type  ·  **GATE: Exchange Online admin** · `[O]`
- **Goal:** shared mailbox (no new password) vs licensed user mailbox (needs delegation or a new
  connection).
- **Exact action (Exchange Online PowerShell):**
  ```powershell
  Connect-ExchangeOnline -UserPrincipalName <your-admin-upn>
  Get-Mailbox -Identity <inbox-N-address> | Format-List PrimarySmtpAddress,RecipientTypeDetails
  ```
  Expect `RecipientTypeDetails = SharedMailbox` → Scenario A (no new password). `UserMailbox` → licensed
  → either delegate Full Access to `digital@` (preferred, collapses to Scenario A) or plan a new
  connection (Scenario B, Part C2-alt).
- **GATE:** `RecipientTypeDetails` lives in Exchange, not Dataverse/Azure — Claude cannot read it.
- `[O]`

### B3. Confirm / grant `digital@` Full Access  ·  **GATE: Exchange Online admin + ~2 h replication** · `[O]`
- **Goal:** the connected `digital@` account can read the inbox (the V2 trigger's only requirement).
- **Exact action (Exchange Online PowerShell):**
  ```powershell
  Get-MailboxPermission -Identity <inbox-N-address> -User digital@collisionengineers.co.uk |
    Format-List User,AccessRights,IsInherited,Deny
  # If no FullAccess row:
  Add-MailboxPermission -Identity <inbox-N-address> `
    -User digital@collisionengineers.co.uk -AccessRights FullAccess -InheritanceType All
  ```
  Admin-center equivalent: **Exchange admin center → Recipients → Mailboxes →** the mailbox **→ Manage
  mailbox delegation → Read and Manage → Add `digital@`**. **Allow up to ~2 hours for replication.**
- **GATE:** admin grant + replication delay.
- `[O]`

### B4. Pre-flight smoke test (OWA "Open another mailbox")  ·  **GATE: live OWA** · `[O]`
- **Goal:** verify Full Access is actually live **before** building a flow.
- **Exact action:** in **Outlook on the web signed in as `digital@`**, use **Open another mailbox →
  `<inbox-N-address>`**. If it opens, Full Access is live and the V2 trigger will work; if not, wait for
  the ~2 h replication and retry (`multi-inbox-activation.md` §0.2).
- **GATE:** live mailbox access.
- `[O]`

---

# Part C — Clone CS Intake per extra inbox, authorize the connection, point it at the right address

> `docs/gated.md` item 2; `multi-inbox-activation.md` §A.2 + Scenario B. **Do ONE inbox first; only after
> it fully passes Part E verification, repeat for the third** (`multi-inbox-access.md` §6 Phase C;
> `multi-inbox-activation.md` line 20). All work at **make.powerautomate.com** with **Collision Engineers
> - Dev** selected.

### C1. (Scenario A) Reuse the existing connection — do NOT create one  ·  **GATE: none** · `[O]`
- **Goal:** avoid a needless new credential when the inbox is shared + `digital@` has Full Access.
- **Exact action:** confirm `cr1bd_sharedmailbox_office365` (digital@, `bd752b83172a4e99b3db595942f1b30f`)
  is **Connected** — **make.powerapps.com → Connections**, or **Solutions → CollisionSpikeFlows →
  Connection references → `cr1bd_sharedmailbox_office365`**. No new connection.
- **GATE:** none (reuse).
- `[O]` (verification step)

### C2. (Scenario B, only if the inbox is a licensed mailbox you chose NOT to delegate) Create a new Office 365 connection  ·  **GATE: interactive sign-in + MFA + consent** · `[O]`
- **Goal:** a connection signed in **as that licensed user** so the V2 trigger can read its mailbox.
- **Exact action:** **make.powerapps.com → Connections → + New connection → Office 365 Outlook →** sign
  in **as the licensed user** that owns `<inbox-N-address>` (real browser + MFA + consent). This mints a
  new connection instance you then own. (`multi-inbox-activation.md` §B.1.) Prefer Scenario A
  (delegation) where possible — fewer credentials to maintain.
- **GATE:** **this is the operator-only connection authorization** — interactive sign-in; Claude cannot do
  it.
- `[O]`

### C3. Create the per-inbox flow (clone CS Intake → V2 trigger)  ·  **GATE: designer Save (re-arms webhook)** · `[O]`
- **Goal:** one new intake flow watching exactly `<inbox-N-address>`.
- **Exact action — route 1 (Save As, simplest, `multi-inbox-activation.md` §A.2.1):**
  **make.powerautomate.com → My flows / Solutions → CollisionSpikeFlows → CS Intake (shared mailbox) →
  Save As** → rename **`CS Intake (inbox-N)`** → in the designer **delete** the `OnNewEmailV3` trigger
  node → **add** **"When a new email arrives in a shared mailbox (V2)"** → set:
  - **Original Mailbox Address** (`mailboxAddress`) = **`<inbox-N-address>`**
  - **Folder** = `Inbox`
  - **Include Attachments** = **Yes**
  - **Only with Attachments** = **Yes** *(temporary noise filter — `hasAttachments=true`)*
  - **Concurrency Control = On, Degree of parallelism = 1** *(re-enable it or the save fails
    `CannotDisableTriggerConcurrency`)*

  Then **Save** (a fresh trigger node forces a fresh webhook subscription — the only way to arm it).
- **Exact action — route 2 (solution import, cleaner ALM, §A.2.2):** import
  `flows/definitions/intake-shared-mailbox.definition.json` into **CollisionSpikeFlows**, set
  **`IntakeMailbox = <inbox-N-address>`**, bind the two connection references
  (`cr1bd_sharedmailbox_office365` + `cr1bd_dataverse`), then **open the flow in the designer and Save**
  to publish the webhook. (Scenario B variant: on the V2 trigger node, switch the **connection** to the
  C2 connection for **this flow only** — the per-flow binding overrides the shared reference;
  `multi-inbox-activation.md` §B.2.)

  > **Note on the parameterised definition.** `intake-shared-mailbox.definition.json` (on disk, dated
  > 2026-06-21) is already the V2 shape (`SharedMailboxOnNewEmailV2`, `mailboxAddress =
  > @parameters('IntakeMailbox')`) **and already carries the anchored `List_active_providers` +
  > `Filter_exact_domain` provider match** — the same fix as the live `digital@` flow (Part D). The stale
  > warning in `flows/README.md` (and older notes) that this variant "still carries the buggy
  > `contains()` substring match" describes a **prior** state and no longer matches the file — verify the
  > current JSON, don't trust the stale prose. **One genuine difference:** this variant ends after the
  > provider match and does **not** include the orchestration child-chain calls
  > (`Run_classify_persist` / `Run_parse` / `Run_status_evaluate` / `Run_case_resolve` / `Run_enrich`)
  > that the **live** `digital@` flow carries (the live flow itself trails the repo def — memory
  > `intake-repo-trails-live`). For a like-for-like clone of the **live** behaviour, prefer **route 1
  > (Save As the live flow)** so the new inbox inherits the full live downstream chain; if you use route
  > 2, plan to wire the same child calls before relying on parse/enrich/merge for that inbox.
- **GATE:** the designer Save is mandatory — a flow that is only ever API-injected **never fires**.
- `[O]`

### C4. Point the clone at the right shared address  ·  **GATE: part of the C3 save** · `[O]`
- **Goal:** the trigger watches the intended inbox, not `digital@`.
- **Exact action:** confirm the V2 trigger's **Original Mailbox Address / `mailboxAddress`** =
  **`<inbox-N-address>`** (route 1) or the flow's **`IntakeMailbox`** parameter = `<inbox-N-address>`
  (route 2). This same value is stamped on every Case as **`cr1bd_sourcemailbox`** for per-inbox
  attribution (free).
- **GATE:** none beyond the C3 save.
- `[O]`

### C5. Set this clone's `MinIntakeDate`  ·  **GATE: none** · `[O]`
- **Goal:** stop a freshly-connected inbox ingesting its years-deep historical backlog.
- **Exact action:** set this flow's **`MinIntakeDate`** parameter = **this inbox's go-live date**
  (default `2026-06-17`). It is a **flow parameter, not a Dataverse env-var** (verified live). The first
  action after the trigger (`Drop_if_before_min_date`) audits `dropped_before_min_date` and Terminates
  Succeeded for any email received before the cutoff.
- **GATE:** none.
- `[O]`

### C6. Leave the downstream chain untouched  ·  **GATE: none** · `[O]`/`[C]`
- **Goal:** avoid duplicating shared logic.
- **Exact action:** **do not** clone Provider Match / Case Resolve / Classify+Persist / Parse / Status
  Evaluate / Enrich. They are already **ON** and shared; each intake flow writes `cr1bd_cases` the same
  way and the shared chain runs once across all inboxes (`multi-inbox-access.md` §A.4). Per-inbox
  attribution comes free via `cr1bd_sourcemailbox`.
- **GATE:** none — this is a *no-op by design*.
- `[O]`

---

# Part D — Confirm provider sender-domain matching resolves (the matching path)

> `docs/gated.md` item 3. Auto-matching is by **sender email DOMAIN only** and is **identical across all
> inboxes** — multi-inbox does not change matching (`multi-inbox-feasibility.md` §6). The intake flow
> lowercases the domain after `@` (`Init_senderDomain`), lists active providers with non-null
> `cr1bd_knownemaildomains` (`List_active_providers`), and does an **anchored exact membership** test
> (`Filter_exact_domain` — split the newline-separated memo, exact match; **not** the old unanchored
> `contains()`). Exactly one match → Case bound to provider + Case/PO + enrichment; 0 or ambiguous →
> unassigned Case for staff review.

### D1. Confirm the anchored match is live on `digital@`  ·  **GATE: none (read-only)** · `[C]`
- **Goal:** verify the matching fix is actually on the live flow (so cloning inherits a safe match).
- **Exact action:** the anchored `List_active_providers` + `Filter_exact_domain` shape was spliced into
  the live CS Intake trigger-byte-identical (`CURRENT_STATUS` / memory "Anchored provider match LIVE");
  the repo `flows/definitions/intake.definition.json` carries it (lines 179–201) and so does the
  parameterised `intake-shared-mailbox.definition.json`. Cross-check live behaviour by inspecting the
  `provider_matched` / `provider_unmatched` audit events after a test email:
  ```pwsh
  $tok = az account get-access-token --resource "https://collisionengineers-dev.crm11.dynamics.com/" --query accessToken -o tsv
  # GET <org>/api/data/v9.2/cr1bd_auditevents?$filter=contains(cr1bd_name,'provider_')&$orderby=cr1bd_occurredat desc&$top=10
  ```
- **GATE:** none — read-only.
- `[C]`

### D2. Supply the provider→email-domain CSV  ·  **GATE: operator knowledge** · `[O]`
- **Goal:** populate `cr1bd_knownemaildomains`, which is blank for ~376 of 392 providers, so almost
  nothing auto-matches until it is filled (`docs/gated.md` item 3).
- **Exact action:** the operator produces a list of **`principal_code,email_domain`** rows (header exactly
  `principal_code,email_domain`; domain = the part **after `@`**, e.g. `QDOS,qdos.co.uk`). Use the same
  `principal_code` as `raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv`.
  Save as `dataverse/.build/email-domains.csv` (or pass `-CsvPath`).
- **GATE:** only the operator knows which domains belong to which providers.
- `[O]`

### D3. Load the domains (dry-run, then apply)  ·  **GATE: none — Dataverse data, not a live-inbox touch** · `[C]`
- **Goal:** write `cr1bd_knownemaildomains` so the anchored match can resolve.
- **Exact action:**
  ```pwsh
  pwsh dataverse/.build/15-seed-emaildomains.ps1            # DRY-RUN — shows provider->domain changes, writes nothing
  pwsh dataverse/.build/15-seed-emaildomains.ps1 -Apply     # write (idempotent, additive, ambiguity-guarded)
  ```
  The loader is idempotent (union, de-duped) and has an **ambiguity guard**: any domain mapping to >1
  active provider is treated as an **intermediary** (ADR-0011) and is **not** written. Claude **can** run
  this once the CSV exists — it is Dataverse data, not a live-inbox touch (`docs/gated.md` item 3).
- **GATE:** none beyond the CSV existing.
- `[C]`

### D4. Confirm a real sender domain now resolves  ·  **GATE: live mail send** · `[O]`
- **Goal:** prove matching works end to end after the domain load.
- **Exact action:** send a test email **from an address whose domain you just seeded** to `digital@` (or
  to a cloned inbox once Part C is live). Expect the new Case to be **bound to the matching WorkProvider**
  and to receive a Case/PO + enrichment; a `provider_matched` audit is written. A 0/ambiguous domain
  yields an **unassigned** Case + `provider_unmatched` audit — expected, not a defect.
- **GATE:** live mail send (operator-only); cross-check the audit via the D1 query (`[C]`).
- `[O]`

---

# Part E — Per-inbox verification (run for each clone before doing the next)

> `multi-inbox-activation.md` §Verify. **Do one inbox fully, then the third.** Toolkit: Flow Management
> API needs `az account get-access-token --resource https://service.flow.microsoft.com/`; Dataverse needs
> `--resource <org>/`.

### E1. Permission live (pre-flight)  ·  `[O]`
- OWA as `digital@` → **Open another mailbox → `<inbox-N>`** opens. (= Part B4.)

### E2. Webhook armed  ·  `[C]` (read-only API)
```
GET https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/b3090c42-51fb-ee24-9868-474da322a3ad/flows/<new-workflowid>/triggers?api-version=2016-11-01
```
Returns **200** = armed. **500** = unprovisioned → re-open the flow in the designer and **Save** (re-add
the V2 trigger node if needed). `[C]` to read; the fix (designer Save) is `[O]`.

### E3. Send a test email  ·  **GATE: live mail send** · `[O]`
- Send to `<inbox-N>`: 1 instruction PDF + 2 photos (an **overview with a legible plate** + a **damage
  closeup**), `receivedDateTime ≥ MinIntakeDate`, **with an attachment** (`hasAttachments` is on).

### E4. Run fired  ·  `[C]` (read-only API)
```
GET https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/b3090c42-51fb-ee24-9868-474da322a3ad/flows/<new-workflowid>/runs?api-version=2016-11-01
```
Shows a **Succeeded** run within the poll interval (a few minutes).

### E5. Case appears, correctly attributed  ·  `[C]` (read-only API)
```
GET <org>/api/data/v9.2/cr1bd_cases?$select=cr1bd_name,cr1bd_sourcemailbox,cr1bd_sourcemessageid,createdon&$orderby=createdon desc&$top=5
```
A new row with **`cr1bd_sourcemailbox = <inbox-N>`** and the email's Message-ID. Also on the Code App
Dashboard (`new_email`).

### E6. Dedup proof  ·  **GATE: live mail send** · `[O]`
- Re-send the **same** email (same Message-ID) → **no** second Case; a `duplicate_dropped` AuditEvent is
  written. The Internet Message-ID (`cr1bd_sourcemessageid`, alternate key
  `cr1bd_case_sourcemessageid_key`) is **unique per email regardless of which inbox saw it**, so the
  `Find_existing_by_messageId` get-or-create guard + per-flow concurrency=1 prevent a double-create even
  when the **same** email lands in two inboxes (To: one, Cc: another) — worst case a benign
  `duplicate_dropped` audit (`multi-inbox-feasibility.md` §5). Cross-check (`[C]`):
  ```
  GET <org>/api/data/v9.2/cr1bd_auditevents?$filter=contains(cr1bd_name,'duplicate_dropped')&$orderby=cr1bd_occurredat desc&$top=5
  ```

### E7. Backlog guard (optional)  ·  `[O]`/`[C]`
- An older email (`receivedDateTime < MinIntakeDate`) produces a `dropped_before_min_date` audit and
  **no** Case.

> **Done when:** each inbox independently turns a test email into exactly **one** correctly-attributed
> `cr1bd_cases` row, a duplicate is dropped, and its `/triggers` endpoint returns 200. Then — and only
> then — repeat Part C + Part E for the third inbox.

---

# Rollback note — the kept backup of the intake flow

- **What exists:** the provider-match change to live **CS Intake (shared mailbox)** was made keeping a
  one-step backup of the prior flow (`docs/gated.md` item 1: *"I kept a backup and can put the inbox flow
  back to exactly how it was in one step."*). The live flow is `workflowid
  92131f3d-9cd5-4e88-aa9e-a5705a5850a0` (internal guid `8d534fc9-9058-a6f4-4dfd-245b350703b5`).
- **When to use it:** Part A fails (no Case after a test email to `digital@`), or any cloned-inbox change
  is suspected of having destabilised the shared estate.
- **How (operator, `[O]`):** **make.powerautomate.com → Solutions → CollisionSpikeFlows → CS Intake
  (shared mailbox)** → **Version history → Restore** the pre-change version (or re-import the kept backup
  version), then **open in the designer and Save** to **re-arm the `OnNewEmailV3` trigger subscription**.
  A `clientdata`/Flow-API restore alone will **not** re-arm the trigger (memory
  `flow-webhook-trigger-provisioning`), so the designer Save is mandatory. After restoring, re-run Part A
  to confirm intake is green again.
- **The clones are independent:** rolling the `digital@` flow back does **not** delete the per-inbox
  clones; disable or delete each `CS Intake (inbox-N)` flow separately if you need to back the whole
  multi-inbox rollout out.

---

## Open questions to resolve before / during this rollout

1. **Exact SMTP addresses** of the two other inboxes — not in the repo; operator supplies (B1).
2. **`SharedMailbox` vs `UserMailbox` per inbox** — decides whether any new password/connection is needed
   (B2); only the operator can read `RecipientTypeDetails`.
3. **Is the 3-inbox rollout actually wanted now**, or is `digital@` alone sufficient? Confirm before
   spending build effort (`multi-inbox-feasibility.md` §8 Q3).
4. **Provider→domain CSV** — will the operator supply it? Without it ~376/392 providers stay blank and
   auto-match stays manual across **all** inboxes (D2).
5. **`digital@` trigger choice** — keep the working `OnNewEmailV3`, or re-point it to V2 for a uniform
   3-flow estate? Re-pointing re-arms the working `digital@` subscription, so it is **cosmetic and NOT
   recommended** during activation (`multi-inbox-access.md` §3 note).

---

## Sources

- `docs/gated.md` (items 1, 2, 3) — operator-blocker registry.
- `docs/architecture/live-environment.md` — live IDs (flow workflowids, connection id, env id, org URL).
- `docs/activation/multi-inbox-activation.md` — per-inbox §0 (mailbox type) / §A.2 (clone) / §B (licensed)
  / §Verify.
- `docs/plans/phase-2-live-activation/multi-inbox-access.md` — Option A topology, V3-vs-V2, dedup.
- `docs/plans/phase-2-live-activation/multi-inbox-feasibility.md` — investigate-only guardrail, §4
  gotchas, §6 matching/throughput.
- `docs/activation/email-intake-activation.md` — the live `digital@` V3 setup + DLP.
- `flows/definitions/intake.definition.json` (V3, live-shaped) and
  `flows/definitions/intake-shared-mailbox.definition.json` (V2, parameterised; **both** carry the
  anchored match as of 2026-06-21).
- `dataverse/.build/15-seed-emaildomains.ps1` — provider-domain loader (CSV `email-domains.csv`).
- Memory: `flow-webhook-trigger-provisioning`, `live-services-boundary`, `intake-repo-trails-live`.
