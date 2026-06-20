# Feasibility — Connecting the other intake mailboxes (Info / Engineers / Desk)

> ## 🔒 INVESTIGATE ONLY — do **NOT** proceed
> **Operator instruction (standing guardrail for this whole document):** investigate whether the
> remaining intake inboxes *can* be connected; **do NOT proceed, do NOT activate, do NOT plan an
> imminent rollout.** No flow is to be created, no trigger armed, no connection bound, **no test mail
> sent** to these inboxes. **Only `digital@collisionengineers.co.uk` is an authorized test inbox** —
> `Info@`, `Engineers@`/intake, and `Desk@` are **LIVE and operator-only** (the live-services boundary,
> memory `live-services-boundary`). This is a **feasibility verdict**, not a runbook.
>
> **Relationship to the sibling doc.** The implementable runbook + architecture rationale already live
> in **[multi-inbox-access.md](./multi-inbox-access.md)** and the per-inbox activation steps in
> **[../../activation/multi-inbox-activation.md](../../activation/multi-inbox-activation.md)**. This
> document is the **complementary feasibility companion**: it answers *"can it be done, and what
> blocks it"* without repeating those build steps. Where the two overlap, the runbook is the
> authority on *how*; this doc is the authority on *whether / not-yet*. **If — and only if — the
> operator later issues a separate, explicit go-ahead, follow `multi-inbox-access.md`, not this file.**

---

## 0. Headline verdict

**Technically feasible — but deliberately not actioned.** The same per-inbox trigger pattern that wired
`digital@` binds each additional shared inbox, with **one design correction**: watching a mailbox other
than the connected account requires the **V2 shared-mailbox trigger** (`SharedMailboxOnNewEmailV2`,
required `mailboxAddress`), **not** the **V3 own-mailbox trigger** (`OnNewEmailV3`) the live `CS Intake`
flow currently uses. Cross-inbox dedup, provider matching, throughput, and DLP all hold **with no
schema or logic change**. Nothing below is a blocker to *capability*; everything below is a blocker to
*acting now* — by operator instruction and the live-services boundary.

| Question | Feasibility verdict |
|---|---|
| Can the live transport bind Info / Engineers / Desk? | **Yes**, via one `SharedMailboxOnNewEmailV2` flow per inbox (Option A). 🔒 not actioned. |
| Does it need a new password / new connection? | **Depends on mailbox type** — see §2. Shared + Full Access ⇒ **no**. 🔒 confirm live. |
| Does multi-inbox break dedup / providers / limits? | **No** — all compose correctly (§4–§6). |
| Can Claude build any of this now? | **Nothing to build.** The parameterised definition already exists; every remaining step is operator-gated. See §7. |

---

## 1. What "feasibility" rests on (verified, no live action taken)

Verified by reading the repo + live registry + Microsoft Learn:

- **Only `digital@` is wired.** Flow `CS Intake` (`workflowid 92131f3d-9cd5-4e88-aa9e-a5705a5850a0`,
  internal guid `8d534fc9-9058-a6f4-4dfd-245b350703b5`): trigger **`OnNewEmailV3`** on the connected
  account's **own** mailbox, folder `Inbox`, `concurrency.runs = 1`, `includeAttachments = true`; **ON**
  (`docs/architecture/live-environment.md`). Downstream `CS Provider Match` + `CS Case Resolve` ON;
  classify-persist / parse / status-evaluate OFF.
- **The other two intake inboxes are not named anywhere in the repo.**
  `docs/requirements/admin-overview.md:20` says only *"Three separate inboxes (most common)"*. The
  operator's task names them **Info / Engineers / Desk** and states they are **live, operator-only**, so
  their exact SMTP addresses and Exchange recipient types are **unknown to Claude** (open question, §8).
- **The offline build is already shaped for multi-inbox.**
  `flows/definitions/intake.definition.json` is the parameterised per-inbox variant — trigger
  **`SharedMailboxOnNewEmailV2`**, `mailboxAddress = @parameters('IntakeMailbox')`, `folderId = 'Inbox'`,
  `concurrency.runs = 1` — carrying the `MinIntakeDate` go-live guard, Message-ID get-or-create dedup,
  best-effort provider resolve, and `cr1bd_sourcemailbox` provenance. **So there is nothing for Claude
  to author to answer the feasibility question.**
- **One Outlook connection exists.** `cr1bd_sharedmailbox_office365` → connector `shared_office365` →
  connection `bd752b83172a4e99b3db595942f1b30f` (`digital@`, *Connected*). This is the only Outlook
  connection and is reusable (subject to the mailbox-type confirmation in §2).
- **Microsoft Learn confirms the trigger + limit facts** this verdict relies on (§9).

---

## 2. The one fact that gates everything: mailbox type (🔒 confirm live, read-only)

**Are Info / Engineers / Desk Exchange *shared mailboxes* that `digital@` holds **Full Access** to, or
*licensed user mailboxes*?** This single fact decides whether any new password/connection is ever needed.
**Claude cannot answer it** — `RecipientTypeDetails` and Full-Access grants live in Exchange Online /
M365 admin, not in Dataverse or Azure RM (the `connectionreferences` GET confirms only that *a*
connection is bound, not the Exchange type of any mailbox).

**Decision rule (verified against Microsoft Learn, §9):**

| If the inbox is… | New password / connection? | Why |
|---|---|---|
| **Shared mailbox** + `digital@` has **Full Access** | **NO** — reuse `cr1bd_sharedmailbox_office365` / `bd752b83…`. | A shared mailbox has a **system-generated password, sign-in blocked**; there is nothing to hand over. The V2 trigger only requires that the **connected account can access the mailbox** ("won't work… unless one of the users has **full access** to the other mailbox"). Full Access is a pure **admin grant**. |
| **Licensed user mailbox** | **Feasible, but** either (a) grant `digital@` Full Access ⇒ collapses to the shared-mailbox case (**preferred**), or (b) a **separate interactive Office 365 connection** signed in as that user (a real credential + MFA to own). | `OnNewEmailV3` only ever watches the connected account's **own** mailbox; a different *licensed* mailbox needs delegation or its own connection. |

**🔒 How the operator confirms (read-only, NOT a grant; ~2 min each):**

| # | Owner | Gated | Action |
|---|---|---|---|
| 2.1 | operator | 🔒 | Capture the exact SMTP addresses of the two other inboxes (record only — not in the repo). |
| 2.2 | operator | 🔒 | Exchange Online PowerShell: `Get-Mailbox <addr> \| fl PrimarySmtpAddress,RecipientTypeDetails` → expect `SharedMailbox`. |
| 2.3 | operator | 🔒 | `Get-MailboxPermission <addr> -User digital@collisionengineers.co.uk` → expect an `AccessRights` entry containing `FullAccess`. |
| 2.4 | operator | 🔒 | Record the verdict per the table above. **No grants, no builds** — confirmation only. |

> The actual delegation/grant steps (`Add-MailboxPermission …`, ~2 h replication, the OWA *"Open
> another mailbox"* smoke test) belong to the rollout runbook **[multi-inbox-access.md](./multi-inbox-access.md) §6–§7** —
> do **not** perform them during this investigation.

---

## 3. Architecture conclusion (design note only — nothing built)

**One flow per inbox (`SharedMailboxOnNewEmailV2`) on the single `digital@` connection — Option A — is
the right shape.** This is a *conclusion to record*, not a step to action:

- **One parameterised definition, shipped once per inbox**, differing **only** by the `IntakeMailbox`
  parameter (`flows/definitions/intake.definition.json`). Clean per-mailbox isolation, independent
  enable/disable, per-inbox `concurrency = 1`, per-inbox `MinIntakeDate`, and `cr1bd_sourcemailbox`
  attribution for free.
- **Reject the fan-out alternative.** A V2 trigger binds **exactly one** `mailboxAddress` and **cannot
  watch a list** — a single flow over all three is not possible without abandoning the native trigger
  for a polling `Recurrence` + Graph `HTTP with Microsoft Entra ID` loop (more parts, loses the native
  trigger and per-mailbox concurrency). Not worth it for the spike.
- **Do not duplicate the downstream chain.** Only the **trigger** is mailbox-specific; keep the single
  shared `Provider Match → Case Resolve (→ classify/parse/… as later phases turn on)` chain.

Full option comparison + target topology diagram: **[multi-inbox-access.md](./multi-inbox-access.md) §3**
(not repeated here).

---

## 4. Trigger version + re-arm constraint (the two real "gotchas")

### 4a. V3 vs V2 — the wrong-trigger trap

The live `digital@` flow uses **`OnNewEmailV3`** (own mailbox, **no** `mailboxAddress`). **Reusing V3 for
another inbox would silently watch `digital@` again, not the intended inbox** — V3 has no way to point at
a different mailbox. Watching Info / Engineers / Desk **requires `SharedMailboxOnNewEmailV2` with
`mailboxAddress` set**. (Microsoft Learn confirms V3's only mailbox-scoping properties — `To`/`CC`/`Folder`
— are *within-inbox* filters, not a cross-mailbox switch; §9.)

> Re-pointing the live `digital@` flow to V2 for a "uniform" 3-flow estate is **cosmetic and NOT
> recommended during an investigation**: it would **re-arm the working `digital@` subscription** (see 4b).
> Leave the working V3 flow untouched.

### 4b. The clientdata re-arm constraint (memory `flow-webhook-trigger-provisioning`)

Confirmed still applicable: **arming a brand-new email-trigger subscription is designer-only.** The
Dataverse `clientdata` / Flow API can create or patch a flow's stored definition but **does not register
the connection-trigger subscription** — a flow that is only ever API-injected **never fires** (this is
exactly why `digital@` was dead until its trigger was rebuilt in `make.powerautomate.com`). Therefore
**each additional inbox would need an operator designer Save to arm it.** Actions-only `clientdata` edits
that leave the trigger node byte-identical remain safe (that is how the M1 child-chain was wired live),
but standing up a **new** per-inbox trigger is inherently a new subscription ⇒ **designer**.

> **Doc-precision note (worth recording for future readers).** The repo/memory call the email-trigger
> subscription a *"webhook"*, but the modern `OnNewEmailV3` / `SharedMailboxOnNewEmailV2` triggers are
> **`OpenApiConnectionNotification` (polling-style notification) operations**, and the dedicated
> *"When a new email arrives (webhook)"* trigger is **deprecated**. Microsoft Learn documents the
> polling-vs-webhook distinction explicitly (§9). So *"webhook"* in our notes means **the connection-trigger
> subscription generally**, not a literal Graph webhook — the *designer-arms-it* constraint holds either way.

---

## 5. Dedup, concurrency, provenance (feasible — no change required)

- **Message-ID dedup is GLOBAL and composes across inboxes.** The Internet Message-ID
  (`cr1bd_sourcemessageid`, alternate key `cr1bd_case_sourcemessageid_key`) is **unique per email
  regardless of which mailbox received it**, so the existing `Find_existing_by_messageId` get-or-create
  guard + per-flow `concurrency = 1` already prevent a double-create when the **same** email lands in two
  intake inboxes (To: one, Cc: another). Worst case: a benign `duplicate_dropped` AuditEvent on the second
  arrival. **No schema or logic change is needed to make multi-inbox safe.**
- **Cross-provider safety (ADR-0010) is untouched.** Case-resolve's open-case lookup stays
  provider-scoped (`_cr1bd_workproviderid_value`); multi-inbox does not weaken the never-link-across-providers
  invariant.
- **`MinIntakeDate` is per-flow** and must be set = **each inbox's go-live date** at activation, so a
  freshly connected inbox never ingests its historical backlog (a newly connected inbox can hold years of
  mail). This is the relevant safety net for any future rollout — flag, not action.
- **`cr1bd_sourcemailbox` already carries per-inbox attribution** (`= @parameters('IntakeMailbox')`),
  giving correct per-inbox audit for free under the V2 pattern.

---

## 6. Provider-matching + throughput / DLP (feasible — no action)

- **Provider auto-match is by sender DOMAIN only** and is independent of which inbox received the mail, so
  multi-inbox **does not change matching behaviour**. Two standing caveats (not multi-inbox defects):
  - **(a)** most providers have blank `cr1bd_knownemaildomains`, so most mail lands unassigned for staff
    review until domains are seeded (tracked in `docs/gated.md`; seed via
    `dataverse/.build/15-seed-emaildomains.ps1`).
  - **(b)** the **live** intake still runs the **OLD unanchored `contains()` substring match**
    (`Resolve_provider`), which can false-match a domain substring and mint the **wrong Case/PO + Box
    prefix**. The repo's anchored `List_active_providers` + `Filter_exact_domain` fix is the separate live
    deploy tracked in `docs/gated.md`. The parameterised `intake.definition.json` deliberately mirrors the
    current live (unanchored) logic, so **a multi-inbox rollout before that fix would inherit the same
    false-match risk** — couple any future rollout with the anchored-match deploy. **Flag, do not fix here.**
- **Throughput is well within limits.** Microsoft Learn confirms the Office 365 connector limit of
  **300 API calls per connection per 60 s** (plus 70 concurrent requests / 300 MB concurrent transfer per
  connection); three low-volume trigger subscriptions on the one `digital@` connection are comfortably
  inside this. Office also imposes per-inbox/SMTP limits, but these are **distinct** inboxes. **No
  premium/licensing change** beyond what existing flows already require.
- **DLP posture is unchanged.** Adding flows on the **same** connection in the same Dev environment
  (Office 365 Outlook Standard + Dataverse already share one DLP data group) does not alter the DLP
  picture.

---

## 7. Buildable-now boundary (what Claude could vs. must not do)

**Claude has nothing to build to deliver this verdict**, and **must build nothing toward activation now.**

| Item | Owner | Gated | Note |
|---|---|---|---|
| Author / parameterise the per-inbox definition | — | n/a | **Already done** — `flows/definitions/intake.definition.json` exists. |
| Confirm mailbox types + Full Access (§2) | operator | 🔒 | Read-only Exchange checks; live-services boundary. |
| Create connections / grant Full Access / arm triggers / send test mail | operator | 🔒 | Interactive Exchange + Power Automate-designer actions; **no headless path** (4b). **Not now.** |
| *(future, separate go-ahead only)* add an intake-specific unanchored-substring linter check to `flows/validate-flows.mjs` | Claude | — | Offline, repo-only, no live touch. **Listed to scope future work — not this session.** |
| *(future, separate go-ahead only)* reconcile the parameterised definition onto the anchored provider match once the anchored-match fix lands | Claude | — | Offline, repo-only. **Not this session.** |

---

## 8. Open questions (must be resolved before feasibility could ever become a build)

1. **Exact SMTP addresses** of the two other intake inboxes (Info / Engineers / Desk) — not in the repo;
   operator must supply.
2. **Mailbox type per inbox** — Exchange `SharedMailbox` vs licensed `UserMailbox`, and whether `digital@`
   already holds `FullAccess`. **This is THE fact** that decides whether any new password/connection is
   ever needed (§2).
3. **Is a rollout even desired?** The operator said investigate-only — confirm whether wiring all three is
   actually intended for the spike, or whether `digital@` alone is sufficient, **before** any build effort
   is spent.
4. **Pre-rollout shared-mailbox conversion?** If any target is a licensed mailbox, converting it to a true
   Exchange shared mailbox (no password, admin-only delegation) **before** any rollout would simplify
   everything to the no-credential path.
5. **Doc-precision** (§4b): record once that the email-trigger subscription is *polling*
   (`OpenApiConnectionNotification`), not a literal Graph webhook, so future readers don't expect
   Graph-webhook semantics. The *designer-arms-it* constraint is unchanged.

---

## 9. Risks (of acting prematurely)

- **Acting at all.** This is **investigate-only**. Standing up a per-inbox flow, arming a trigger, or
  sending test mail to Info / Engineers / Desk would violate the operator instruction **and** the
  live-services boundary (**only `digital@` is authorized**).
- **Wrong-trigger trap (4a).** Reusing `OnNewEmailV3` for another inbox silently watches `digital@` again.
- **Re-arm trap (4b).** A per-inbox flow only ever API-injected never fires; re-pointing the live `digital@`
  flow to V2 would re-arm its working subscription — leave it alone during investigation.
- **Inherited false-match (§6b).** The parameterised definition mirrors the live **unanchored** provider
  match; a rollout before the anchored-match deploy carries the wrong-provider / wrong-Case-PO + Box-prefix
  risk.
- **Backlog ingestion (§5).** Forgetting `MinIntakeDate` per inbox would ingest the entire historical
  backlog as Cases (mitigated by the existing guard — but per-flow, set at activation).
- **Replication / smoke-test skips.** ~2 h Full-Access replication and the OWA *"Open another mailbox"*
  test are easy to skip and cause a false *"trigger won't fire"* alarm — relevant only **if/when** the
  operator proceeds.

---

## 10. Authoritative sources (Microsoft Learn — re-verified)

- Office 365 connector reference — `SharedMailboxOnNewEmailV2` takes required `mailboxAddress`; "your
  account should have permission to access the mailbox"; known issue: "won't work… unless one of the users
  has **full access** to the other mailbox": <https://learn.microsoft.com/connectors/office365/>
- Office 365 Outlook connector limit — **300 API calls per connection per 60 seconds** (vs the Mail
  connector's 100/24 h): <https://learn.microsoft.com/power-automate/email-troubleshooting#known-limitations>
- `When a new email arrives (V3)` — connected-account trigger; its `To`/`CC`/`Folder` properties are
  *within-inbox* filters, not a cross-mailbox switch (no `mailboxAddress`):
  <https://learn.microsoft.com/power-automate/email-triggers>
- Polling vs webhook triggers — the documented distinction behind the §4b doc-precision note (modern email
  triggers are polling-style notification operations; the literal *"webhook"* email trigger is deprecated):
  <https://learn.microsoft.com/troubleshoot/power-platform/power-automate/flow-run-issues/triggers-troubleshoot#trigger-fires-for-old-events>
  · <https://learn.microsoft.com/power-automate/guidance/coding-guidelines/optimize-power-automate-triggers>
- About shared mailboxes — system-generated password "not known or intended for use"; always block
  sign-in; access is delegated administratively:
  <https://learn.microsoft.com/microsoft-365/admin/email/about-shared-mailboxes>
- Give mailbox permissions to another user — Full Access = "Read and Manage"; granted administratively, no
  password handover: <https://learn.microsoft.com/microsoft-365/admin/add-users/give-mailbox-permissions-to-another-user>
- Manage permissions for recipients (Exchange Online): <https://learn.microsoft.com/exchange/recipients-in-exchange-online/manage-permissions-for-recipients>
- Shared mailboxes in Exchange Online: <https://learn.microsoft.com/exchange/collaboration-exo/shared-mailboxes>

---

## 11. Files & identifiers referenced

- **Sibling runbook (authority on *how*, not actioned now):** `docs/plans/phase-2-live-activation/multi-inbox-access.md`
- **Per-inbox activation steps (future, separate go-ahead):** `docs/activation/multi-inbox-activation.md`
- **Parameterised per-inbox definition (already shaped, V2):** `flows/definitions/intake.definition.json`
  — trigger `SharedMailboxOnNewEmailV2`, `mailboxAddress = @parameters('IntakeMailbox')`, `folderId='Inbox'`,
  `concurrency.runs = 1`; `MinIntakeDate` guard; Message-ID dedup (`Find_existing_by_messageId`).
- **Live registry:** `docs/architecture/live-environment.md` — connection `bd752b83172a4e99b3db595942f1b30f`;
  `CS Intake` `workflowid 92131f3d-9cd5-4e88-aa9e-a5705a5850a0`, internal guid
  `8d534fc9-9058-a6f4-4dfd-245b350703b5`.
- **Rules/gotchas:** `AGENTS.md` (webhook provisioning; V3=own mailbox / V2=shared) · memory
  `flow-webhook-trigger-provisioning`, `live-services-boundary`.
- **Connection manifest:** `flows/connection-references.json` (`cr1bd_sharedmailbox_office365` →
  `shared_office365`).
- **Requirement:** `docs/requirements/admin-overview.md:20` ("Three separate inboxes").
- **Env id:** `b3090c42-51fb-ee24-9868-474da322a3ad`; **org:** `https://collisionengineers-dev.crm11.dynamics.com`.

> **Milestone tag.** Phase 2 live activation of all three inboxes is part of the **M1** "done" definition
> (working vertical slice). This document is a feasibility gate within that scope; **it actions none of it.**
