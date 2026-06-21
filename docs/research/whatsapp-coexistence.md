# WhatsApp coexistence — deep M3 research + phased plan

_Research / design doc. Generated 2026-06-20. Scope: a future, **gated-off** WhatsApp channel for
`collisionspike` case intake — the realistic transport options, and (centrally) **how to track a
WhatsApp conversation thread → a Case** when WhatsApp is structurally harder to track than email.
This is **research + a phased plan only**; nothing here ships live and no flow is turned on by this
doc._

**Milestone:** **M3** (assistive / optional; gated-off, off the EVA/Box critical path). A live
WhatsApp channel is **not** on the M1 or M2 path. M1/M2 keep the **manual** WhatsApp posture of
**ADR-0007** (bulk-media OCR→VRM import) and **ADR-0003** (draft-only outbound). This doc adds the
*future* automation option and the open questions that decide whether it is ever worth turning on.

**Precedence note (per CLAUDE.md):** **ADR-0003** and **ADR-0007** are the binding baseline; this
research does **not** supersede them. It proposes a *phased extension* (W0–W3) that preserves both
ADRs' invariants. Any conflict resolves in favour of the ADRs until a later ADR or
[binding review](../reviews/README.md) says otherwise. Reconcile this doc downward to them, never the
reverse.

Grounded in: ADRs [0002](../adr/0002-vrm-open-case-correlation.md),
[0003](../adr/0003-channel-aware-chasers-whatsapp-constraint.md),
[0007](../adr/0007-whatsapp-intake-manual-bulk-ocr-match.md),
[0009](../adr/0009-image-ai-ocr-m1-classification-m2.md),
[0010](../adr/0010-dedup-reference-disambiguated-no-time-window.md),
[0011](../adr/0011-work-provider-intermediary-garage-roles.md),
[0008](../adr/0008-tool-boundary-ends-at-eva-handoff.md); the data model
([data-model.md](../architecture/data-model.md)); the provider-corpus analysis
(`raw/principalandrepairersheets/outputs/reports/`); the live flow definitions
`flows/definitions/chaser-draft.definition.json`, `chaser-send.definition.json`,
`intake.definition.json`, `classify-persist.definition.json`; and Microsoft Learn (re-verified
2026-06-20 — citations inline).

---

## 0. TL;DR — the finding that drives everything

A live WhatsApp channel **is technically buildable** on **Azure Communication Services (ACS) Advanced
Messaging for WhatsApp**: it sends and receives messages + media, and delivers each inbound message to
**Azure Event Grid** as a `Microsoft.Communication.AdvancedMessageReceived` event carrying the media
reference, caption, and a reply-thread `context` — i.e. it can feed Power Automate / a Function exactly
like the live email intake does. ([overview][acs-overview]; [event data][acs-eventdata])

**But the operator's instinct is correct and is now backed by docs.** Three structural facts make
WhatsApp *harder to fully track than email* and gate the whole design:

1. **Coexistence does not capture GROUP chats.** Meta's "coexistence" mode (the WhatsApp **Business
   app** and the Cloud API sharing one number) **does not sync group conversations** and ignores
   messages from unsupported clients. CE's real intake flows through **yard / repairer WhatsApp
   groups** (the corpus analysis names HS Recovery M12 5FX, Somstar B5 6JX, Shaun Marnell CH46 4TP as
   the spine of image sourcing), so a coexistence channel would see **1:1 DMs only**, never the
   groups. → **The ADR-0007 manual export path is the only way to ingest group media, and is therefore
   permanent — not a stopgap.**
2. **The 2026 username / BSUID change breaks phone-number correlation.** Meta is launching usernames in
   2026; when a user adopts one, the `from`/`to` phone fields in ACS events **may be empty** and you
   must key on the new `fromBSUID` / `toBSUID` instead. Any correlation, dedup key, or Event Grid
   filter pinned to a phone number degrades. ([overview — breaking change][acs-overview];
   [usernames/BSUID][acs-bsuid])
3. **The 24-hour window forbids free outbound.** A business can only send **pre-approved templates**
   until the user messages first; only inside an open 24-hour customer-initiated window may it send
   free-form text/media. This reinforces ADR-0003's draft-only stance rather than relaxing it.
   ([template messages][acs-templates]; [get started — conversations][acs-getstarted])

**Recommendation:** keep **manual + draft-only** (ADR-0003 / ADR-0007) as the M1/M2 baseline. Phase ACS
in **only for 1:1 (non-group) inbound-media ingestion + VRM correlation** as a timesaver — **never** an
auto-responder, **never** a customer-service inbox (ADR-0008 scope ends at EVA handoff). Every live step
is **operator-gated** (🔒): it crosses the live-services boundary and/or requires Meta/Facebook business
identity.

---

## 1. The realistic transport options (and the verdict)

| Option | What it is | Inbound mechanism | Verdict for collisionspike |
|---|---|---|---|
| **A. ACS Advanced Messaging for WhatsApp** ⭐ | First-party Azure service; connect an existing WhatsApp Business Account, send/receive + media, events via Event Grid. | `Microsoft.Communication.AdvancedMessageReceived` Event Grid event; media pulled by media ID via the Messages SDK `DownloadMedia`. ([download media][acs-downloadmedia]) | **Chosen if anything is built.** All-Microsoft, fits the FC1/ACA + Event Grid + Key Vault + flow estate already in place. Inbound arms cleanly (see §4). **1:1 only.** |
| **B. WhatsApp Business Platform Cloud API (direct, via Meta)** | Meta's own Cloud API + webhook, no Azure intermediary. "Coexistence" is a *property of this API* (Business app + Cloud API on one number). | Meta webhook (HTTPS endpoint you host + verify). | **Not chosen.** Re-implements what ACS wraps, adds a self-hosted webhook to secure, and lives outside the Azure identity/Event-Grid model. The coexistence **group-chat exclusion is a Meta-side limit and applies to A and B alike.** |
| **C. Power Platform / Power Automate connector for WhatsApp** | A maker-surface connector. | n/a | **Not viable as built.** There is no first-party Power Automate "WhatsApp inbound trigger"; the supported Microsoft pattern is **ACS → Event Grid → flow** (Option A). Twilio/360dialog community connectors exist but add a third-party BSP, secrets, and DLP surface against the all-Microsoft, ≈£0-idle posture — out of scope for this spike. |

**Why A, concretely.** ACS inbound is an **Event Grid system event**, so the Power Automate **“When a
resource event occurs”** trigger (or an Event-Grid-triggered Function) auto-provisions the subscription
**and Azure auto-handles the Event Grid validation handshake** — which *sidesteps* the
Office-365-webhook arming problem recorded in memory `flow-webhook-trigger-provisioning` (that gotcha is
specific to Office 365 / clientdata-armed triggers, not Event Grid).
([end-point validation][eg-validation]; [handle events][acs-handleevents])

> **Code App boundary (memory `codeapp-csp-use-connectors`).** The Code App enforces `connect-src
> 'none'`, so it can **never** raw-`fetch` the ACS API or media URLs. Every ACS call lives in a
> flow/Function; the app only ever reads the resulting **Dataverse rows** (Evidence, Case, Chaser).

---

## 2. Current state — the domain is already WhatsApp-aware in DATA, manual in BEHAVIOUR

The schema was built anticipating this; **no live WhatsApp anything exists** (no ACS resource, no
channel, no Event Grid subscription, no inbound flow). What is already there:

**Dataverse (solution `CollisionSpike`, prefix `cr1bd`, Sandbox `b3090c42-…`):**
- **`cr1bd_case`** — `cr1bd_intakechannelkind` (choice `email` | `whatsapp`), `cr1bd_intakechannelmanual`
  (bool), `cr1bd_sourcemailbox` ("shared inbox / WhatsApp group the item arrived on"),
  **`cr1bd_vrm`** (the correlation key), `cr1bd_sourcemessageid` (alt-key dedup), `cr1bd_payloadhash`,
  `cr1bd_caselinkstate` (`none` | `pending` | `linked`), `cr1bd_duplicatekeys`.
- **`cr1bd_imagesource`** — `cr1bd_channel`, `cr1bd_whatsappgroup`, `cr1bd_whatsappnumber`,
  `cr1bd_contactname`; N:N to `cr1bd_workprovider`.
- **`cr1bd_evidence`** — `cr1bd_sourcemessageid`, `cr1bd_sourcelabel`, `cr1bd_sha256`,
  `cr1bd_registrationvisible`, `cr1bd_storagepath` / `cr1bd_filebytes` (bytes off-row),
  `cr1bd_contenttype`.
- **`cr1bd_chaser`** — `cr1bd_chaserchannel` (email `100000000` | whatsapp `100000001`),
  `cr1bd_chaserstatus` (drafted `100000000` | sent `100000001` | responded | overdue),
  `cr1bd_targetname`, `cr1bd_targettype`.
- **`cr1bd_auditevent`** — `cr1bd_action` choice; current max value `chaser_sent = 100000019`
  (next free additive value = **`100000020`**).

**Flows (`flows/definitions/`):**
- `chaser-draft.definition.json` — writes a **drafted** Chaser (`cr1bd_channel: 100000001`,
  `cr1bd_status: 100000000`) with **zero send actions**; the boundary is enforced *by absence* (a
  reviewer greps for a send operation and finds none).
- `chaser-send.definition.json` — **HARD-SKIPS** `cr1bd_channel = 100000001` (`Set_is_sendable_email`
  requires channel `100000000` AND status `100000000`), reads `cr1bd_CHASER_SEND_ENABLED` (READ, never
  DEFINE), and only email-sends via Office 365 `Send an email (V2)` when the gate is true.
- `intake.definition.json` — the **email orchestrator** any WhatsApp ingester must mirror: per-source
  trigger → Message-ID dedup (alt key) → anchored exact provider match → get-or-create Case → **Run a
  Child Flow** chain (`classify-persist` → `parse` → `status-evaluate`).
- `classify-persist.definition.json` — the **evidence-write contract** (writes `cr1bd_evidence` with
  off-row bytes + sha256 + sourcelabel + registrationvisible) that both WhatsApp paths reuse verbatim.

**Already-deployed engine the WhatsApp matcher needs:** the **registration-OCR** adapter (`ocr/`,
Azure Function App `cespkocr-fn-dev-glju3v`, Functions-on-ACA scale-to-zero) per **ADR-0009** — it
reads the plate and is exactly what ADR-0007's bulk import and the W2 inbound matcher call to get a
VRM. **ADR-0002** open-case VRM correlation and **ADR-0010**'s dedup ladder already govern email and are
reused unchanged.

---

## 3. The hard part — tracking a conversation thread → a Case

Email is easy to track: one message = one `Message-ID`, a stable `From` domain → WorkProvider, an
`.eml` envelope, attachments inline. **WhatsApp gives none of those reliably.** This section is the
core of the research: the correlation model that makes a *loose, multi-message, partly-anonymous*
WhatsApp stream resolve onto **one** Case without spawning duplicates or auto-minting a Case/PO from a
stray DM.

### 3.1 Why WhatsApp is structurally harder than email

| Tracking signal | Email | WhatsApp (ACS) |
|---|---|---|
| Stable message id | `Message-ID` header | ACS `messageId` per inbound event — usable, reuse `cr1bd_sourcemessageid` alt key. ✔ |
| Sender identity | `From` domain → WorkProvider (ADR-0011) | `from` phone **may be empty** post-username; `fromBSUID` is the durable key but is **per-business-portfolio**, opaque, and tells you *who* not *which provider*. ✘ |
| Thread / conversation | RFC `References` / `In-Reply-To` | event **`context`** = reply-to messageId only; otherwise messages are an unthreaded stream. ◐ |
| Document context | `.eml` body + attachments carry a claim ref | a media-only DM carries **no provider reference, no claim number** — frequently *just a photo*. ✘ |
| Group provenance | n/a | **groups are not captured at all** by coexistence (§0.1). ✘ |
| Provider/address default | sender domain, parser `detect_phrases` | no domain to match; a media-only DM has no document to parse (open question §6). ✘ |

The consequence: for WhatsApp the **primary** link cannot be sender identity or a document reference —
it has to be the **VRM read off the image by OCR**, with everything else as weaker corroboration.

### 3.2 The correlation ladder (deterministic, ordered, reuses ADR-0002/0010)

For each inbound WhatsApp message, resolve to a Case in this order — **stop at the first that
resolves**; anything unresolved goes to the **Exceptions queue** for a human, **never** auto-creates a
provider / Case / PO:

1. **VRM via OCR (PRIMARY).** If the message has media, call the deployed `ocr/` plate adapter
   (`cespkocr-fn-dev-glju3v`), normalise the VRM, and apply **ADR-0002** open-case correlation: match
   the single **OPEN** Case for that VRM. This is primary precisely because text-only / contextless
   WhatsApp messages rarely carry a provider reference. The OCR also sets
   `cr1bd_evidence.cr1bd_registrationvisible` from the OCR-vs-VRM check.
2. **Sender identity (SECONDARY, durable key = `fromBSUID`).** Use `fromBSUID` as the stable key (it
   survives username changes; it regenerates only on phone-number change), with the `from` **phone as
   an opportunistic extra — never assumed present**. The 30-day, *per-business-number* phone-visibility
   window and Meta's portfolio-scoped **Contact Book** mean phone may appear for some senders and not
   others. ([phone availability rules][acs-bsuid]) Sender identity *corroborates* a VRM match or routes
   a known contact's thread; it does **not** by itself pick a provider (a DM sender ≠ a WorkProvider).
3. **Reply `context` (THREAD STITCH).** If the event's `context` points at a prior `messageId`, stitch
   this message onto the **same** conversation/thread as that message. ([event data][acs-eventdata])
4. **Conversation accretion (PARTIAL conversations).** Maintain a lightweight **Conversation / thread**
   grouping keyed on `fromBSUID` + a rolling window, so a *partial* exchange — an image now, the VRM
   typed 10 minutes later, the instruction PDF tomorrow — **accretes onto ONE Case** instead of
   spawning duplicates. This is the WhatsApp analogue of the email "images-now, instructions-later"
   hold (ADR-0002), but the join is `fromBSUID + VRM` rather than `Message-ID`.
5. **Unresolvable → Exceptions queue.** No readable plate, ambiguous VRM (two open claims same VRM), or
   no open Case → **hold for human action**. Reuse `cr1bd_caselinkstate` (`none` → `pending` →
   `linked`) and `cr1bd_duplicatekeys` **exactly** as email dedup does. **Never** auto-merge on VRM +
   time and **never** across different WorkProviders (**ADR-0010**).

### 3.3 Message state, media ingestion, audit trail

- **Dedup / idempotency.** First guard is the ACS `messageId` against the `cr1bd_sourcemessageid` alt
  key (a re-delivered Event Grid event is dropped) — identical posture to the email Message-ID guard.
- **Media ingestion.** The inbound event carries a **media reference** (id, mimeType, fileName,
  caption), not the bytes; the flow/Function pulls bytes by media ID via the Messages SDK
  `DownloadMedia` and writes a `cr1bd_evidence` row — **bytes off-row** (`cr1bd_storagepath` /
  `cr1bd_filebytes`), `cr1bd_sha256` for content dedup, `cr1bd_sourcelabel = "WhatsApp <group/contact>"`,
  `cr1bd_contenttype` from mimeType. ([download media][acs-downloadmedia])
- **Audit trail.** Every ingest writes a `cr1bd_auditevent` with a new additive action
  **`whatsapp_message_ingested`** (value `100000020`, next free after `chaser_sent = 100000019`). The
  conversation/thread row + `fromBSUID` mapping give the audit chain WhatsApp otherwise lacks (no email
  envelope to archive).
- **Reflection / person exclusion (domain rule).** Any photo showing a person's reflection is unusable
  — but that classifier is **M2** vision work (ADR-0009), not part of this M3 channel; until it exists,
  a WhatsApp image is treated like any other image at review time.

### 3.4 Human-in-the-loop is mandatory, not optional

WhatsApp's looseness means **the channel proposes, a human disposes**. Concretely: a confident
VRM→open-Case match **attaches** evidence and logs it; **anything ambiguous or unmatched sits in the
Exceptions queue** until a staff member links it. The channel **never** creates a WorkProvider, a Case,
or a PO from a DM, and **never** auto-responds. This is the same propose-attach-confirm discipline
ADR-0010 already mandates for email; WhatsApp simply has *more* paths landing in the human queue.

---

## 4. Phased plan (W0–W3)

Each phase tags **owner** and whether it is **🔒 operator-gated** (crosses the live-services boundary /
Meta identity / secrets / live test). Sub-letters map to **exactly one milestone**; this whole
workstream is **M3** (the manual W0 path is the M1/M2 baseline already covered by ADR-0007).

> **No-mock-data rule.** No seeded WhatsApp rows at any point. The W2 live test uses a **real
> operator-sent message**, never a fabricated Dataverse row.

### W0 — Strengthen the already-chosen manual path (Claude · offline · ships regardless)
The safe baseline that works **without any new service** and is **permanent** (because groups are never
captured live — §0.1). This is the ADR-0007 path, made concrete:

- [ ] **(Claude)** Design the **bulk-media importer** as an **offline batch** over an
  operator-exported WhatsApp media folder: for each image → call the deployed OCR plate adapter
  (`ocr/`, `cespkocr-fn-dev-glju3v`) to read the VRM → normalise → run **ADR-0002** open-case
  correlation (single OPEN Case for that VRM; ambiguous/none → human review, **never** auto-merge) →
  on match, write a `cr1bd_evidence` row (`kind=image`, `cr1bd_sourcelabel="WhatsApp <group/contact>"`,
  `cr1bd_sha256` for dedup, `cr1bd_registrationvisible` from the OCR-vs-VRM check), bytes off-row.
  Specify it as a Function **or** a manual-trigger flow that mirrors `classify-persist`'s
  evidence-write contract. **Input is a folder the operator drops files into — zero live WhatsApp
  dependency.** ([download media is *not* needed here — the bytes are already exported][acs-downloadmedia])
- [ ] **(Claude)** Extend **chaser TARGETING** for the WhatsApp channel **without touching the
  draft-only invariant**: `chaser-draft` already writes `cr1bd_channel = 100000001` drafts with zero
  send actions; surface `cr1bd_imagesource.cr1bd_whatsappgroup` / `cr1bd_whatsappnumber` /
  `cr1bd_contactname` in the draft body + target selection so the draft shows the **exact group/contact
  for a human to paste-send**. Keep `chaser-send`'s WhatsApp **HARD-SKIP** (`100000001`) intact.
- [ ] **(Claude)** Design the **`responded` transition**: manual now (staff marks the Chaser
  responded); later auto via inbound correlation in W2.

### W1 — ACS resource + WhatsApp channel topology
- [ ] **(Claude · offline)** Author a **Bicep/ARM module** for an **Azure Communication Services**
  resource in the existing sandbox resource group **+ an Event Grid System Topic**, mirroring the
  existing FC1/ACA hardening (Log Analytics workspace + App Insights, no shared-key storage). Document
  that the **WhatsApp channel itself is created through the Azure portal Embedded Signup wizard (NOT
  IaC)** and yields a **Channel Registration ID** GUID. Record the **coexistence onboarding facts**:
  an existing Business-app number is linked via Embedded Signup; requires Business app **≥ v2.24.17** +
  a linked Facebook Page; **companion apps get unlinked on onboarding**; a number binds to **exactly
  one BSP / Tech Partner at a time** (choosing ACS excludes any other BSP).
  ([connect WhatsApp Business Account][acs-connect]; [channel prerequisites][acs-prereq])
- [ ] **🔒 (operator) — W1 ACTIVATION.** Run Embedded Signup (Sign-in with Facebook → select Business
  portfolio + WhatsApp Business Account → verify the number), wait for channel status to reach
  **Active** (Meta **display-name review**), record the **Channel Registration ID**. **Use a TEST /
  spare number first** — do **not** onboard CE's **primary** live WhatsApp number until the 1:1-only
  limit and the BSP-exclusivity tradeoff are accepted (onboarding unlinks companion apps + rebinds the
  number's BSP, partly irreversible). ([connect WhatsApp Business Account][acs-connect])

### W2 — Inbound ingestion flow `CS WhatsApp Intake`
- [ ] **(Claude · offline)** Author the flow / Function definition, gated **OFF** behind a **new
  `WHATSAPP_INTAKE_ENABLED`** Dataverse env-var (default `false`). **Trigger options, in preference
  order:**
  - **(A) Power Automate “When a resource event occurs”** Event Grid trigger, filtered to
    `resourceType = Microsoft.Communication.CommunicationServices` + `eventType =
    Microsoft.Communication.AdvancedMessageReceived` — the connector auto-provisions the subscription
    **and Azure auto-handles the Event Grid validation handshake** (avoids the
    `flow-webhook-trigger-provisioning` arming gotcha). ([end-point validation][eg-validation])
  - **(B)** an **Event-Grid-triggered Azure Function** (validation auto-handled) that calls
    `DownloadMedia` and the same downstream. ([handle events][acs-handleevents])
  - The flow **mirrors `intake.definition.json`**: dedup on ACS `messageId` (reuse
    `cr1bd_sourcemessageid` alt key) → resolve sender → get-or-create / correlate Case (the §3.2 ladder)
    → **Run a Child Flow** to a **`WhatsApp-classify-persist`** that writes `cr1bd_evidence` (download
    each media by id + mimeType, bytes off-row, set sourcelabel + sha256).
- [ ] **(Claude · offline)** Implement the **§3.2 correlation + threading model** (the genuinely hard
  core) and the **§3.3 audit/dedup** behaviour. Reuse `cr1bd_caselinkstate` + `cr1bd_duplicatekeys`
  verbatim.
- [ ] **(Claude · proposes; `dataverse-data-architect` applies)** **Schema delta — additive only, no
  destructive edits:**
  - add **`cr1bd_bsuid`** (String) to `cr1bd_imagesource` to persist the **BSUID ↔ group/contact**
    mapping that survives username changes; **and/or** a lightweight **`cr1bd_whatsappthread`**
    (Conversation) table keyed on `cr1bd_bsuid` + window for accretion;
  - add `cr1bd_bsuid` to inbound provenance on `cr1bd_case` / `cr1bd_evidence` as needed;
  - add the **`whatsapp_message_ingested`** AuditEvent action value **`100000020`** (next free after
    `chaser_sent = 100000019`);
  - bytes stay **off-row** (`cr1bd_evidence` storagepath / filebytes). Confirm the existing 37-char
    over-length-principal-code and choice-extension ALM rules. ([field types][pp-fieldtypes])
- [ ] **🔒 (operator) — W2 ACTIVATION.** Bind connection references; **configure BOTH Event Grid
  subscriptions** on the ACS System Topic: an **inbound** subscription (Event Type
  `Microsoft.Communication.AdvancedMessageReceived`, advanced filter **`data.to` String-is-in =
  Channel ID**) **and** an **outbound delivery-status** subscription (Event Type
  `Microsoft.Communication.AdvancedMessageDeliveryStatusUpdated`, advanced filter **`data.from`
  String-is-in = Channel ID**). **Both are required.** (If the ACS resource has only one WhatsApp
  channel and is unshared, the `data.to`/`data.from` filters may be skipped and you filter by event
  type alone.) Set the ACS **connection string** in **Key Vault** (it lives under the ACS resource →
  Settings → Keys); flip **`WHATSAPP_INTAKE_ENABLED = true`**, turn the flow **ON**, and run a **live
  test** by messaging the ACS number **1:1 with a photo of a plate**. Verify a `cr1bd_case` row
  correlates by VRM and a `cr1bd_evidence` row stores the image. (Event Grid uses **Microsoft Entra
  app authentication** to the protected endpoint.) ([configure WhatsApp via ACS — both subscriptions
  + filters][d365-configure])

### W3 — Channel-aware OUTBOUND via ACS (optional; only after W2 is proven)
- [ ] **(Claude · offline)** Design sending **under its own kill switch** (e.g.
  **`WHATSAPP_SEND_ENABLED`**, default `false`) **separate** from `chaser-send` (which keeps its email
  path + WhatsApp HARD-SKIP). Because of the 24-hour window, an `acs-whatsapp-send` flow may **only**
  send (i) free-form text/media **inside an open customer-initiated 24h window**, or (ii) a **pre-
  approved template** (created in Meta WhatsApp Manager) — and even then **default to DRAFT-then-human-
  approve** to honour **ADR-0003**'s spirit. Reading `responded` can auto-flip a Chaser when an inbound
  correlates to its Case (W2 closes the loop). Sending to **BSUID-only** recipients needs the **June
  2026** capability. ([template messages][acs-templates]; [get started][acs-getstarted];
  [usernames/BSUID][acs-bsuid])
- [ ] **🔒 (operator)** Any live send. Requires **opt-in evidence** + **template approval** before
  enabling; default remains draft-only (ADR-0003).

### Cost / compliance / data-residency pre-read (Claude · offline, before any activation)
- [ ] **(Claude)** Document **ACS Advanced Messaging per-conversation** pricing + **Event Grid
  per-event** cost (small but non-zero); the Meta **business verification / display-name review**
  prerequisite; **opt-in** requirements before any outbound; and **data residency** — note that
  **WhatsApp data follows Meta's terms and may not include the EU Data Boundary commitments**, and the
  service **may not be HIPAA-compliant** (not relevant here, but record it). State **loudly** that
  **group-chat intake cannot be captured by coexistence**, so the **W0 manual export path is the only
  way to ingest group media and is therefore permanent.** ([overview][acs-overview]; [Meta data-transfer
  / EU boundary terms][acs-terms])

---

## 5. What Claude can build now vs what is operator-gated (🔒)

| Buildable now (Claude, offline) | Operator-gated (🔒 live boundary / Meta / secrets / live test) |
|---|---|
| The W0 bulk-media importer design + chaser-targeting wiring (draft-only preserved) | Provisioning is fine, but **connecting the WhatsApp Business Account** via Embedded Signup (Facebook/Meta auth + CE business identity + display-name review) |
| All W2 flow / child-flow / Function **definitions**, gated OFF behind `WHATSAPP_INTAKE_ENABLED` | Binding connection references; configuring **both** Event Grid subscriptions; ACS connection string → Key Vault; flipping `WHATSAPP_INTAKE_ENABLED`; the **live inbound test** |
| The additive **schema delta** proposal (`cr1bd_bsuid`, `cr1bd_whatsappthread`, action `100000020`) | Onboarding CE's **primary** number (BSP rebind + companion-app unlink — pilot on a spare first) |
| The **Bicep/ARM** module for ACS + Event Grid System Topic; the portal Embedded-Signup **runbook** | Any **outbound send** (W3): opt-in + template approval + flipping `WHATSAPP_SEND_ENABLED` |
| The **cost / compliance / data-residency** pre-read + the "groups never captured" statement | — |

---

## 6. Open questions (the genuinely hard ones — operator must decide)

1. **Is CE's real WhatsApp intake in GROUPS or 1:1 DMs?** *Decisive.* Coexistence captures **1:1 only**;
   if intake is group-based (as the corpus analysis implies — yard/repairer groups), a live channel
   adds little and the **W0 manual export path stays primary**. Operator must confirm actual usage.
2. **Will CE bind their number to ACS as the single BSP** (excluding any other WhatsApp BSP/CRM) and
   accept **companion-app unlinking** on onboarding? If they already use another BSP, coexistence-via-
   ACS is **blocked**.
3. **Tolerance for the 2026 BSUID transition** — are inbound senders likely to adopt usernames (hiding
   phone)? If yes, phone-based contact matching degrades and **VRM-via-OCR + `fromBSUID`** must carry
   correlation entirely (§3.2).
4. **Should an unmatched WhatsApp DM** (no readable plate, no open case) **ever create a `pending`
   Case**, or always sit in the Exceptions queue until a human links it? *Recommend the latter — never
   auto-mint a Case/PO from a DM* (§3.4).
5. **Provider / inspection-address defaulting for a WhatsApp-sourced Case** with no sender domain: the
   provider must come from document content or human assignment (**ADR-0011**), but a **media-only DM
   has no document** — so what defaults? Likely: **always human-assigned** for media-only WhatsApp.
6. **Is any OUTBOUND WhatsApp (W3) actually wanted**, given ADR-0003's draft-only stance + the 24h-
   window/template friction? May be better to stay **draft-only permanently** and only **auto-detect
   `responded`** from inbound.

---

## 7. Risks → mitigations

| Risk | Mitigation |
|---|---|
| Coexistence silently misses **group** traffic + drops unsupported-client messages → **false sense of coverage**. | Keep W0 manual export as the canonical **group** path; scope ACS to **1:1 only** and document it loudly (§0.1). |
| **2026 username/BSUID breaking change**: `from`/`to` phone empty; any phone-keyed filter or correlation breaks (webhooks ~Mar 2026, sending Jun 2026). | Key on **`fromBSUID` + VRM-via-OCR**; never assume phone present; for the single-channel case filter by **event type** not `data.to`. |
| **VRM auto-correlation mis-links** to the wrong open Case (two claims same VRM) or a historical Case. | Reuse the exact **ADR-0002/0010** ladder: reference/VRM, human-confirm ambiguous, **never** auto-merge across providers/time. |
| **Onboarding the primary number is partly irreversible** (BSP rebind, companion-app unlink, Meta review latency). | **Pilot on a spare/test number**; treat primary onboarding as a deliberate, separately-approved operator decision. |
| **CSP / connector boundary** — the Code App cannot raw-fetch ACS media/API. | All ACS calls in flows/Functions; surface to the app via **Dataverse rows only** (`codeapp-csp-use-connectors`). |
| **Outbound 24h-window + opt-in + template-approval** make auto-send legally/operationally fraught. | Keep ADR-0003 **draft-only** as default; gate W3 behind its **own** kill switch + human approval; require opt-in + template approval first. |
| **Scope creep past ADR-0008** — a 2-way channel invites becoming a customer-service inbox. | Restrict the channel's job to **intake-media ingestion + chaser-response detection**; **no** conversational assistant. |

---

## References (Microsoft Learn, re-verified 2026-06-20)

[acs-overview]: https://learn.microsoft.com/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-overview "Overview of Advanced Messaging for WhatsApp (features; BSUID breaking-change warning)"
[acs-eventdata]: https://learn.microsoft.com/javascript/api/@azure/eventgrid-systemevents/acsmessagereceivedeventdata "AcsMessageReceivedEventData — mediaContent / content / context / interactiveContent"
[acs-bsuid]: https://learn.microsoft.com/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-username-support-overview "WhatsApp usernames and business-scoped user IDs (BSUID) — phone-availability rules, 30-day per-number window, Contact Book"
[acs-templates]: https://learn.microsoft.com/azure/communication-services/concepts/advanced-messaging/whatsapp/template-messages "Send WhatsApp template messages — 24h window; template-only until user messages first; opt-in"
[acs-getstarted]: https://learn.microsoft.com/azure/communication-services/quickstarts/advanced-messaging/whatsapp/get-started "Send text/media WhatsApp messages — user must message first; conversation initiation"
[acs-downloadmedia]: https://learn.microsoft.com/azure/communication-services/quickstarts/advanced-messaging/whatsapp/download-media "Download WhatsApp message media by media ID (Messages SDK)"
[acs-connect]: https://learn.microsoft.com/azure/communication-services/quickstarts/advanced-messaging/whatsapp/connect-whatsapp-business-account "Register/Connect WhatsApp Business Account — Embedded Signup, Active/display-name review, Disconnect, statuses"
[acs-prereq]: https://learn.microsoft.com/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-channel-prerequisites "WhatsApp channel prerequisites — connect as a channel, account statuses"
[acs-handleevents]: https://learn.microsoft.com/azure/communication-services/quickstarts/advanced-messaging/whatsapp/handle-advanced-messaging-events "Handle Advanced Messaging events (Event Grid)"
[acs-terms]: https://learn.microsoft.com/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-terms-of-service "Advanced Messaging for WhatsApp data transfer + independent ToS (EU data boundary, HIPAA)"
[eg-validation]: https://learn.microsoft.com/azure/event-grid/end-point-validation-event-grid-events-schema "Event Grid endpoint validation (handshake auto-handled for system topics)"
[d365-configure]: https://learn.microsoft.com/dynamics365/contact-center/administer/configure-whatsapp-acs "Configure a WhatsApp channel through ACS — BOTH inbound (data.to) + outbound delivery-status (data.from) subscriptions; Channel ID; connection string; Entra app auth"
[pp-fieldtypes]: https://learn.microsoft.com/power-apps/maker/data-platform/types-of-fields "Power Apps — types of columns/fields (additive schema)"
