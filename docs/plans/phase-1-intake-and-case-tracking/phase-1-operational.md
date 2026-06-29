# Phase 1 — Make the WHOLE pipeline operational (checklist + gap analysis)

> ⚠️ **HISTORICAL — Power Platform era (decommissioned 2026-06-27).** This gap-analysis + activation
> checklist targets the prior **Power Automate flows / Dataverse / Code App** mechanism, which was
> **migrated to the Azure PaaS stack** and deprovisioned. The **pipeline shape it describes**
> (intake → classify-persist → parse → provider-match → case-resolve → status-evaluate → `ready_for_eva`)
> carried over to the orchestration Function App `cespk-orch-dev` (now **live** on info@ + engineers@ +
> desk@) — read it for that domain sequencing, **not** as a live runbook (the `flows/definitions/*.json`
> it analyses are decommissioned). Live state: the registry
> [live-environment.md](../../architecture/live-environment.md); forward work:
> [ROADMAP.md](../../../ROADMAP.md) + [docs/tickets/](../../tickets/README.md).

> **Goal.** Take the Phase-1 intake pipeline from "an email creates a bare Case" to **an email
> (1 instruction PDF + 2 photos) produces a Case that reaches `ready_for_eva` with the 12 EVA fields
> pre-filled and 2 Evidence image rows**.
>
> **Pipeline (intended):** `intake → classify-persist → parse → provider-match → case-resolve →
> status-evaluate` ⇒ Case `ready_for_eva`.
>
> **Scope of this doc:** read-only analysis of every `flows/definitions/*.json`, the data model, the
> image-rules/case-status semantics, and the live environment, producing a **dependency-ordered
> activation checklist**, the **trigger/wiring fixes**, the **env-var gates** to flip, and a
> **full end-to-end verification scenario**. This is a planning document only — no flows/code were
> changed. Authored 2026-06-18 against ground truth verified live the same day.

---

## 0. TL;DR — the three things that actually block Phase 1

Phase 1 is **not** "flip three OFF flows ON". The architecture as committed has **three structural
defects** that must be fixed first, or turning the flows on will do nothing / produce empty Evidence:

1. **The pipeline is not wired together at all.** Every downstream flow (`classify-persist`, `parse`,
   `provider-match`, `case-resolve`, `status-evaluate`) has an **HTTP `Request` (“Manually trigger a
   flow”) trigger** and **no flow invokes any of them**. There is **zero** "Run a Child Flow" /
   `Workflow` action and **zero** HTTP POST-to-child in any definition (confirmed by grep across all
   10 definitions and by reading the live `clientdata` of all flows). The intake flow does its **own**
   inline provider-resolve + Case create and then **terminates**. So `CS Provider Match` (ON) and
   `CS Case Resolve` (ON) are **orphaned** — they are live but **nothing ever calls them**. They have
   never run and never will until a parent invokes them.

2. **`status-evaluate` calls a connector backed by a Function that does not exist.** It invokes
   `shared_evavalidation` → `ValidateCase`, expecting `{ fieldsValid, imagesValid, openIssues[] }`.
   There is **no `functions/validation/` directory**, no deployed validation Function, and the
   connection-reference for `cr1bd_evavalidation` has **no `openapi` path** (unlike the parser/enrich
   refs). **The `ready_for_eva` transition is therefore unreachable** until this surface is built or
   the flow is rewritten to compute readiness inline.

3. **The classify-persist child cannot see the email's attachments.** Its actions read
   `triggerOutputs()?['body/attachments']`, but its trigger is the **child** Request trigger whose
   body is only `{ messageId, caseId }` — it does **not** receive the email or its attachments. As
   written, the Apply-to-each iterates an empty array → **0 Evidence rows, 0 blob uploads**. (Same
   class of bug: `parse` expects `instructionBytesB64`, and `case-resolve` expects
   `candidateVrm/candidateRef/workProviderId` — none of which any caller supplies today.)

Everything else (binding `cr1bd_evidenceblob` + `cr1bd_ceparser`, seeding `knownemaildomains`,
flipping `PDF_MAPPER_ENABLED`) is necessary but secondary to fixing the wiring above.

> **Recommended shape (decision needed — see §9 Q1):** make **intake the single orchestrator** that
> calls the chain via **"Run a Child Flow"** actions (the Microsoft-blessed, export-safe pattern —
> HTTP-URL chaining breaks across solution import/export, per Learn). Pass the email body / attachments
> / sender / messageId / payloadHash into the children as inputs. This consolidates the dedup that is
> currently **split** between intake (Message-ID probe + inline provider resolve + inline Case create)
> and the orphaned `case-resolve`/`provider-match` flows, which today **double-create** Cases if ever
> wired naively.

---

## 1. Per-flow trigger / wiring audit (the gap analysis)

Verified by reading each `flows/definitions/*.json` in full. "Trigger" = how it starts; "Wired?" =
is anything actually invoking it.

| Flow (file) | Live state | Trigger (actual) | Wired today? | Verdict |
|---|---|---|---|---|
| **intake** (`intake.definition.json`) | **ON** | `OpenApiConnectionNotification` → Office 365 `SharedMailboxOnNewEmailV2` *(committed)* / **`OnNewEmailV3` (LIVE, rebuilt in designer)* | Self-contained; calls nothing | **Live + firing.** But does inline provider-resolve + Case create (overlaps the two orphaned flows) and uses the buggy `contains()` domain match. |
| **classify-persist** (`classify-persist…json`) | OFF | `Request` (Http) — body `{ messageId, caseId }` | **Orphaned** (no caller) | **Mis-wired:** reads `triggerOutputs()?['body/attachments']` which is empty for an HTTP child — attachments never arrive. Needs binding `cr1bd_evidenceblob` AND a caller that passes the email/attachments. |
| **parse** (`parse.definition.json`) | OFF | `Request` (Http) — body `{ caseId, instructionBytesB64, instructionName, providerHint }` | **Orphaned** | Logic OK; needs `cr1bd_ceparser` bound + a caller that supplies the instruction bytes. Reads `PDF_MAPPER_ENABLED` correctly. |
| **provider-match** (`provider-match…json`) | **ON** | `Request` (Http) — body `{ caseId, senderAddress }` | **Orphaned** (ON but nothing calls it) | Logic is **correct** (anchored exact-domain membership via split). It is the *right* implementation, but it is dead because intake never calls it and does its own (wrong) match instead. |
| **case-resolve** (`case-resolve…json`) | **ON** | `Request` (Http) — body `{ candidateVrm, candidateRef, workProviderId, messageId, payloadHash }` | **Orphaned** (ON but nothing calls it) | Logic is the full ADR-0010 ladder. Dead because nothing supplies `candidateVrm/Ref`. Also **competes with intake's inline Create** → double-create risk if wired carelessly. |
| **status-evaluate** (`status-evaluate…json`) | OFF | `Request` (Http) — body `{ caseId }` | **Orphaned** | **Hard-blocked:** depends on `shared_evavalidation`/`ValidateCase` **which has no backing Function**. Cannot produce `ready_for_eva`. |
| enrich (`enrich…json`) | OFF | `Request` (Http) — `{ caseId, vrm, reference }` | Orphaned | Out of Phase-1 scope (mileage/MOT). Leave OFF; `ENRICHMENT_ENABLED` stays effectively off for the slice. |
| finalize-eva-box | OFF | `Request` (Http) | Orphaned | Out of Phase-1 scope (ends at `ready_for_eva`, not submit). Leave OFF. |
| chaser-draft | OFF | (Dataverse/scheduled per comment) | Orphaned | Out of scope. Leave OFF. |
| jobsheet-import | OFF | Excel/manual | Orphaned | Out of scope. Leave OFF. |

**Orphaned/mis-wired flags (explicit):**
- 🚩 **`CS Provider Match` (ON) and `CS Case Resolve` (ON) are ORPHANED** — live but unreachable.
- 🚩 **`intake` duplicates** provider-match + case-resolve + (a slice of) classify inline, using a
  **known-buggy** `contains(cr1bd_knownemaildomains, …)` substring filter (`Resolve_provider` /
  `If_one_provider`) — the exact false-match the `provider-match` flow was written to avoid. (Tracked
  as task #26 "Fix intake Resolve_provider exact-match".)
- 🚩 **`status-evaluate` → `ValidateCase`** has **no Function** behind the connector.
- 🚩 **classify-persist / parse / case-resolve trigger bodies** are never populated by any caller.

---

## 2. The two viable wiring strategies (pick one — §9 Q1)

### Strategy A — **Intake orchestrates child flows** (RECOMMENDED)

Intake becomes the parent and, after the Message-ID dedup guard, calls the chain with **"Run a Child
Flow"** actions (built-in `Workflow` connector). Each child keeps its HTTP/manual trigger (children
**must** use "Manually trigger a flow" — confirmed on Learn) but is now actually invoked, and the
**outputs flow back** to intake (parent waits up to the child-flow limit; 120 s sync, else async-202).

Order inside intake (replacing the inline `Resolve_provider`/`If_one_provider`/`Create_case_*`):
1. **classify-persist** (pass the whole email: `messageId`, `attachments`, `subject`, `from`) →
   returns `attachmentHashes`, `payloadHash`, `instructionBytesB64`+`instructionName` (the PDF), and
   the image count. Uploads blobs + creates Evidence rows.
2. **provider-match** (pass `senderAddress`) → returns `workProviderId` (or empty + needs_review).
   *Note:* provider-match currently binds onto a `caseId` that does not yet exist — it must instead
   **return** the id (use a `Response` action) and let case-resolve create the Case bound to it. See
   §3.4.
3. **case-resolve** (pass `candidateVrm`, `candidateRef`, `workProviderId`, `messageId`,
   `payloadHash`) → creates/attaches the Case per ADR-0010; **returns `caseId`**.
4. **parse** (pass `caseId`, `instructionBytesB64`, `instructionName`, `providerHint=principalCode`)
   → pre-fills the 12 EVA fields. *Re-run dedup note:* if the email was image-first (empty VRM),
   case-resolve resolves to CREATE provisionally; **after parse confirms the VRM**, call case-resolve
   again to re-evaluate (the flow comment already anticipates this).
5. **status-evaluate** (pass `caseId`) → advances `new_email → ingested → … → ready_for_eva`.

**Pros:** single source of truth; export-safe; removes the double-create; matches the data-model's
"create/append one open Case" intent. **Cons:** requires editing intake (a connection-webhook flow —
must be re-published in the designer per the trigger-provisioning gotcha) and adding `Response`
actions to the children so they return values.

### Strategy B — **Dataverse-trigger daisy-chain** (alternative)

Convert each child's trigger to **"When a row is added/modified (Dataverse)"** so the steps fire
reactively (intake creates the Case → classify-persist triggers on Evidence/Case → … ). **Not
recommended for Phase 1:** ordering/idempotency is harder, you lose return values, the parser needs
the raw bytes (not in Dataverse), and Dataverse-trigger flows still need designer (re)publish. Keep
this in mind only if child-flow nesting depth/time limits become a problem.

> The rest of this plan assumes **Strategy A**.

---

## 3. The concrete fixes (file-by-file)

> All flow edits are authored offline, then imported and **re-published in the make.powerautomate.com
> designer** (connection-webhook + trigger-provisioning gotcha — AGENTS.md rule 2; memory
> `flow-webhook-trigger-provisioning`). Do **not** rely on the Dataverse `clientdata` API to arm
> triggers.

### 3.1 intake — stop double-handling; orchestrate; fix the domain match
- **Remove** the inline `Resolve_provider`, `If_one_provider`, `Create_case_matched`,
  `Create_case_unassigned` block (the buggy `contains()` match + premature Create).
- **Keep** the `Drop_if_before_min_date` guard, `Init_*` vars, and `Find_existing_by_messageId` →
  `If_already_ingested` (exact Message-ID repeat = drop; ADR-0010 rule 1).
- In the **else** branch (not a duplicate), add **Run a Child Flow** calls in the §2-A order, passing
  the email context. The `attachments` array (with `contentBytes`) is available from
  `triggerOutputs()?['body/attachments']` because the trigger has `includeAttachments:true`.
- **Verify the live trigger.** Ground truth says the LIVE trigger is **`OnNewEmailV3`** on the
  connected `digital@` mailbox, but the committed file still says **`SharedMailboxOnNewEmailV2`**
  (its own comment admits the V2/V3 reconciliation). These return attachments under the **same**
  `body/attachments[*].contentBytes` shape, so classify-persist's read path is fine either way — but
  **reconcile the committed definition to the live `OnNewEmailV3`** so a future re-import does not
  regress the trigger (AGENTS.md rule 3: V3 = connected mailbox, which `digital@` is).

### 3.2 classify-persist — feed it the attachments; bind the blob; create Evidence
- **Bind `cr1bd_evidenceblob`** (`shared_azureblob`) to a real Azure Blob connection (operator step;
  §4). Confirm the **`evidence` container/dataset** exists in the storage account and the connection
  identity can `CreateFile`.
- **Fix the input contract:** the child must receive the attachments. Two options:
  - **A (preferred):** add an `attachments` (array) input to the child trigger and have intake pass
    `@triggerOutputs()?['body/attachments']`, plus `subject`/`from` for the payloadHash fold. Change
    every `triggerOutputs()?['body/...']` reference in the child to `triggerBody()?['...']`.
  - **B:** have classify-persist re-fetch the message by `messageId` via an Outlook
    "Get Attachments / Get email (V3)" action. Heavier; needs the Outlook connection in the child.
- **`Upload_bytes_to_storage` contract mismatch:** the actions consume
  `body('Upload_bytes_to_storage')?['sha256' | 'size' | 'Path']`. The **stock `shared_azureblob`
  `CreateFile` does not return `sha256`** — it returns blob metadata (Path/Name/etc.), not a content
  hash. **Decision (see §9 Q2):** either (i) compute the SHA-256 in the **parser/validation Function**
  (the comments say "hash computed in the storage Function, not Power Fx" — but no such storage
  Function exists), or (ii) drop the SHA-dedup at attachment level for Phase 1 and rely on the
  Message-ID + payloadHash guards already in intake/classify. For the slice, **(ii)** is the smallest
  change; SHA per-attachment can return in a later milestone.
- **Classification is correct** (`Compose_kind` by extension → `cr1bd_evidencekind`: image=100000000,
  instruction=100000002, email=100000003, other=100000006). The 2 photos → image rows, the PDF →
  instruction row. **Capture the instruction's bytes/name** as a child **output** (Response) so intake
  can hand them to `parse`.
- **Evidence row defaults to verify:** `cr1bd_imagerole=100000003` (unknown) and
  `cr1bd_registrationvisible=false`. These are correct for M1 (manual/OCR tagging later) but **block
  the image-rules check** in §3.6 unless status-evaluate's validation is satisfied another way — see
  the image-rules note in §3.6 and §9 Q3.

### 3.3 parse — bind the parser connector; supply the bytes
- **Bind `cr1bd_ceparser`** (`new_collision-20engineers-20parser`, operationId `ParseDocument`) to a
  connection holding the **function key** (`x-functions-key`) for
  `https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net/api/parse`. (The dev key already lives in
  `mockup-app/src/data/parser-config.ts` per the live-env doc.) **DLP:** ensure the custom connector
  is in the same DLP data group as Dataverse/Office365 or the flow won't run.
- **Confirm `PDF_MAPPER_ENABLED=true`** (M1 manifest default is `true`; verify the live value — see §5).
- The flow's `Call_parser` body keys (`body/document`,`body/filename`,`body/provider_hint`) match the
  connector's `ParseRequest` (`document`,`filename`,`provider_hint`) — **OK**.
- The `Prefill_eva_fields` mapping reads `extraction/<field>/value` — matches the connector's
  `Extraction.<field>.FieldCell.value` — **OK** for all 12 fields. `vrm`/`reference` are surfaced
  separately (not EVA payload) and feed dedup.
- **Known limitation (B2):** the sibling parser emits `claimant_telephone`/`claimant_email` as absent;
  those two fields arrive empty (staff fill). Not a blocker for `ready_for_eva` unless the validation
  surface requires them (it should not — see the 12-field contract in §3.6).
- **FC1 limit:** the parser host is **Flex Consumption (FC1)** — **text** PDF/DOCX/DOC/EML/MSG only;
  **scanned-image OCR is deferred** (cannot run Tesseract on FC1). The verification PDF must be a
  **text** PDF (see §7) or extraction returns mostly-empty fields.

### 3.4 provider-match — make it return, don't bind a not-yet-existing case
- Today `Bind_provider` does `UpdateRecord cr1bd_cases recordId=@variables('caseId')` — but under
  Strategy A the Case is created **by case-resolve after** provider-match. **Fix:** change
  provider-match to **return `workProviderId`** (and a `matchState` of one/ambiguous/none) via a
  `Response` action instead of writing to a case. Case-resolve then creates the Case already bound to
  the provider. (Alternatively keep ordering case→provider, but then case-resolve can't scope its
  cross-provider dedup by provider — so **provider-match must run first and return the id**.)
- The anchored membership logic (`Filter_exact_domain` splitting the newline memo, CRLF/space-stripped,
  lowercased) is **correct** — keep it. This is the canonical match; intake's inline `contains()` is
  the defective twin to delete (§3.1).

### 3.5 case-resolve — receive real inputs; own the single Create
- Caller (intake) supplies `candidateVrm`/`candidateRef` from the **envelope sniff** at first pass
  (often empty) and **re-invokes after parse** with the parser-confirmed `vrm`/`reference`.
- The ladder is correct: ref-match→attach (default), REF_DIFFERS→new+duplicate_risk(100000005),
  VRM_NO_REF→propose-attach, CREATE→new `ingested`(100000001). **Cross-provider guard** (`_cr1bd_
  workproviderid_value`) and terminal exclusions are present — keep.
- **Return `caseId`** (Response) so intake can pass it to parse + status-evaluate.
- **Odata bind fix to verify:** `case-resolve` binds with `cr1bd_workproviders(<guid>)` (no leading
  `/`), while intake's inline create used `/cr1bd_workproviders(<guid>)`. The Dataverse connector
  expects the **navigation-property** form `item/cr1bd_Workproviderid@odata.bind` =
  `cr1bd_workproviders(<guid>)` (no leading slash, **capitalised nav prop** as in intake). Reconcile
  casing/sl– mismatched casing or a stray slash throws on bind. **Action:** confirm the exact nav-prop
  name from the live entity metadata before activation (read-only `GET .../cr1bd_cases` $metadata).

### 3.6 status-evaluate — build (or inline) the validation surface; image-rules
This is the **gating** blocker for `ready_for_eva`. Two paths:

- **Path 1 — build the validation Function** (`functions/validation/`, e.g. `ValidateCase`) and the
  `shared_evavalidation` custom connector. It must return `{ fieldsValid, imagesValid, openIssues[] }`
  by porting `collisioncc` `image-rules.ts` + `case-status.ts` semantics. **Image rule (the decided
  M1 rule):** `imagesValid` ⇔ **≥2 Evidence images accepted-for-EVA, including ≥1 with
  `imageRole=overview` and `registrationVisible=true`, and ≥1 with `imageRole=damage_closeup`**.
  `fieldsValid` ⇔ the 12 EVA fields satisfy the contract (Work Provider non-empty; VAT ∈ {"",Yes,No};
  Mileage Unit ∈ {"",Miles,Km}; 6-line inspection address or `Image Based Assessment`). This is the
  cleanest (Code App `computeReadiness()` shares the same endpoint — the §5.4 drift mitigation), but
  it is **net-new work** (a third Function + connector + DLP + deploy).
- **Path 2 — inline the readiness compute in the flow** (no new Function). Replace `Validate_readiness`
  with Dataverse reads: list `cr1bd_evidences` for the case, compute `imagesValid` with a
  Filter-array (count images where `acceptedForEva` and role/registration), and check the 12 Case
  fields for `fieldsValid`. Faster to ship for the slice; risks drift from the Code App. **Recommended
  for the Phase-1 slice**, with Path 1 as the proper follow-up.

> ⚠️ **Image-rules reality check (the real readiness gap).** With classify-persist defaulting every
> image to `imageRole=unknown` + `registrationVisible=false`, **`imagesValid` will be FALSE** even with
> 2 perfect photos — because nothing yet sets `overview`/`damage_closeup` or detects the plate. So a
> clean email lands at **`missing_images`**, *not* `ready_for_eva`, until either (a) M1 OCR sets
> `registrationVisible` and a human tags roles in the Code App, or (b) the verification deliberately
> tags the 2 images. **This is expected and correct** per the data model ("imageRole tagging is manual
> until M2; registrationVisible is OCR-assisted from M1"). The end-to-end test in §7 therefore includes
> a **manual role-tag step** to reach `ready_for_eva`. Flag for the user: **is reaching `ready_for_eva`
> fully automatically in-scope for Phase 1, or is a human role-tag an accepted gate?** (§9 Q3).

---

## 4. Connection bindings required (operator — `[RESERVED-FOR-USER]` / `[DEPLOY-WITH-LOGIN]`)

From `flows/connection-references.json`. **Bound** today: `cr1bd_dataverse`,
`cr1bd_sharedmailbox_office365` (digital@). **Must bind for Phase 1:**

| Connection ref | Connector | For | How |
|---|---|---|---|
| `cr1bd_evidenceblob` | `shared_azureblob` | classify-persist (blob upload) | Create an Azure Blob connection to the evidence storage account; confirm an `evidence` container exists. Premium connector. |
| `cr1bd_ceparser` | `new_collision-20engineers-20parser` | parse (`ParseDocument`) | Create the custom-connector connection with the **function key** as `x-functions-key`. Host already points at `cespike-parser-dev-…`. |
| `cr1bd_evavalidation` | `shared_evavalidation` | status-evaluate (`ValidateCase`) | **Only if Path 1** (§3.6). Needs the validation Function deployed + connector imported first. **If Path 2, this binding is not needed.** |

**DLP:** all of the above + Dataverse + Office 365 must sit in the **same DLP data group** in the
Sandbox or import/run fails (manifest note). **Premium licensing:** Dataverse, Azure Blob, and the
custom connectors are Premium — confirm the maker has Power Apps Premium (B4 was already cleared for
the Code App).

---

## 5. Environment-variable gates to set (Dataverse — read by flows, never written by them)

M1 frozen defaults (`dataverse/environment-variables.json`) and what Phase 1 needs:

| Variable | M1 default | Phase-1 target | Notes |
|---|---|---|---|
| `cr1bd_PDF_MAPPER_ENABLED` | `true` | **`true`** | Enables the parse branch. **Verify the live value** — the Sandbox may have been imported OFF for safety. Read it (below) and set `true`. |
| `cr1bd_ENRICHMENT_ENABLED` | `true` (manifest) / **`false` (live Sandbox)** | **`false`** | Enrich is **out of the Phase-1 slice**; leave OFF (and `enrich` flow OFF). |
| `cr1bd_ENRICHMENT_API_BASE` | `""` | leave `""` | Not used in the slice. |
| `cr1bd_EVA_API_ENABLED` | `false` | **`false`** | Slice ends at `ready_for_eva`; EVA submit is out of scope. |
| `cr1bd_AZURE_VISION_ENABLED` | `false` | `false` | OCR-assist (if any) runs via the parser Function in M1, not a Vision gate. |
| others (`AZURE_MAPS_ENABLED`, `VALUATION_ENABLED`, `COPILOT_ENABLED`, EVA secrets) | `false`/refs | unchanged | Not in the slice. |

**Read the live value (read-only):**
```pwsh
$org="https://collisionengineers-dev.crm11.dynamics.com"
$tok=az account get-access-token --resource "$org/" --query accessToken -o tsv
# definition default + current value override:
#   GET $org/api/data/v9.2/environmentvariabledefinitions?$select=schemaname,defaultvalue
#       &$expand=environmentvariabledefinition_environmentvariablevalue($select=value)
#       &$filter=schemaname eq 'cr1bd_PDF_MAPPER_ENABLED'
```
Set it via the solution UI (Environment variables → Current value) or a `PATCH` to
`environmentvariablevalues`. The flow reads `coalesce(currentValue, defaultValue)` exactly as
`Set_gate_PDF_MAPPER_ENABLED` does.

---

## 6. Seed `knownemaildomains` (provider auto-match) — operator data step

Provider auto-match is **sender-domain only** against `WorkProvider.cr1bd_knownemaildomains`, which is
**empty for ~376 of 392 providers**. Until seeded, provider-match returns NONE → Case proceeds with
provider `needs_review` (never blocks intake, by design).

- **Script:** `dataverse/.build/15-seed-emaildomains.ps1` (idempotent, additive, ambiguity-guarded).
- **Input:** `dataverse/.build/email-domains.csv` with header `principal_code,email_domain`
  (one row per provider/domain; `principal_code` must match
  `raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv`).
- **Run:** `pwsh dataverse/.build/15-seed-emaildomains.ps1` (dry-run) → `… -Apply` (write).
- **Ambiguity rule (ADR-0011):** a domain mapping to >1 active provider is an **intermediary** — the
  script refuses to write it (it would mint unsafe Case/POs); handle via the ImageSource path.
- **For the §7 verification you only need ONE provider's domain** — seed the sender domain you will
  test from (e.g. add `TEST,<your-test-domain>` and `-Apply`).

> **Open data dependency (§9 Q4):** the real per-provider domains were never supplied (the corpus
> analysis carried none). Full auto-match across all providers needs the operator to provide them.

---

## 7. End-to-end verification scenario (ONE email → `ready_for_eva`)

> Run **after** §3 fixes are imported+published, §4 connections bound, §5 gate `true`, §6 domain seeded.
> One mailbox only (`digital@`). Goal: **1 instruction PDF + 2 photos → Case `ready_for_eva` with 12
> parsed fields + 2 Evidence image rows.**

**Test inputs**
- A **text** PDF instruction (NOT a scan — FC1 has no OCR) for a known provider, containing VRM,
  reference, claimant, dates, accident circumstances, an inspection address, VAT, mileage. Sender =
  an address on the seeded domain (§6).
- **2 JPGs:** `overview.jpg` (full vehicle, **legible registration**) and `damage.jpg` (close-up).
  No human reflections (photo-exclusion rule).

**Steps & assertions**
1. **Send** the email (your address on the seeded domain → `digital@`), subject e.g.
   `TEST <VRM> instruction`. `receivedDateTime` ≥ `MinIntakeDate` (2026-06-17) or it is dropped.
2. **Intake fires** → Flow run **Succeeded**. Assert (Flow run history): `Find_existing_by_messageId`
   empty → not-duplicate branch → child-flow calls execute.
3. **classify-persist:** assert **2 image Evidence rows** (`cr1bd_kind=100000000`) + **1 instruction
   row** (`100000002`), each with a `cr1bd_storagepath` into the `evidence` container, and the blob
   bytes present. `cr1bd_sourcemessageid` = the email Message-ID.
   `GET .../cr1bd_evidences?$filter=cr1bd_sourcemessageid eq '<id>'&$select=cr1bd_filename,cr1bd_kind,cr1bd_storagepath`.
4. **provider-match:** assert it **returned** the provider (audit `provider_matched: <domain>`),
   `matchState=ONE`. If ambiguous/none → audit shows it and provider stays `needs_review` (then fix
   the seed and re-test).
5. **case-resolve:** assert **exactly ONE** `cr1bd_cases` row for this email (no double-create),
   bound to the provider, `cr1bd_status` = `ingested` (100000001), VRM/ref from the envelope or empty.
   `GET .../cr1bd_cases?$filter=cr1bd_sourcemessageid eq '<id>'&$select=cr1bd_name,cr1bd_status,cr1bd_vrm,cr1bd_caseref,_cr1bd_workproviderid_value`.
6. **parse:** assert the **12 EVA fields pre-filled** on the Case (`cr1bd_evaworkprovider`,
   `…vehiclemodel`, `…claimantname`, `…dateofloss`, `…dateofinstruction`, `…accidentcircumstances`,
   `…inspectionaddress`, `…vatstatus`, `…mileage`, `…mileageunit`; telephone/email may be empty — B2).
   Audit `parser_called` with `contract_version=cedocumentparser_v2.0_eva_json`. VRM/reference
   captured. (If image-first/empty VRM, confirm the **re-invoked** case-resolve set the VRM.)
7. **Tag images** (the human gate, §3.6 note): in the Code App (or a direct `PATCH`), set
   `overview.jpg` → `cr1bd_imagerole=overview` + `cr1bd_registrationvisible=true`, `damage.jpg` →
   `cr1bd_imagerole=damage_closeup`. (In M1, OCR may set `registrationVisible` automatically; role
   tagging is manual until M2.)
8. **status-evaluate** (re-invoke after tagging — intake also calls it post-parse): assert the guard
   order resolves to **`ready_for_eva`** (100000007): terminal? no → `fieldsValid` true →
   `imagesValid` true (2 images, overview+plate, damage) → no open issues → `ready_for_eva`. Audit
   `status_changed` before=`ingested`/`missing_images` after=`ready_for_eva`.
   `GET .../cr1bd_cases(<caseId>)?$select=cr1bd_status` → `100000007`.
9. **Code App:** open the Case — confirm it appears under **"Ready, not yet in EVA"** with the 12
   fields + provenance badges (PDF/Corpus/Staff) and 2 images.

**Negative / dedup checks (ADR-0010):**
- **Re-send the identical email** → intake `Find_existing_by_messageId` hits → `Audit_duplicate_dropped`
  → **no new Case** (rule 1 exact repeat = drop).
- **Same VRM, different reference, same provider** → case-resolve `REF_DIFFERS` → **new Case +
  `duplicate_risk`** (100000005); never auto-merged.
- **Same VRM, no reference** → `VRM_NO_REF` → **propose-attach** (`caseLinkState=pending`), staff
  confirm; never auto-merged.
- **Different provider, same VRM** → cross-provider guard → **not** linked (separate Case).

---

## 8. Dependency-ordered activation checklist

> Do these **top to bottom**. Items marked **(fix)** are authored offline then imported+published;
> **(op)** are operator/login steps; **(verify)** are read-only confirmations.

1. **(decision)** Choose **Strategy A** (intake orchestrates child flows) vs B (§2). Assume A. **(§9 Q1)**
2. **(decision)** Choose **validation Path 1** (build `ValidateCase` Function+connector) vs **Path 2**
   (inline readiness in status-evaluate). Assume Path 2 for the slice. **(§9 Q3)**
3. **(fix) status-evaluate:** implement readiness (Path 2 inline reads, or Path 1 Function) so
   `ready_for_eva` is reachable. *Blocker — do early.*
4. **(fix) provider-match:** return `workProviderId`/`matchState` via `Response` (stop binding a
   non-existent case). (§3.4)
5. **(fix) case-resolve:** accept inputs, own the single Create, **return `caseId`**, reconcile the
   `@odata.bind` nav-prop casing. (§3.5)
6. **(fix) classify-persist:** add `attachments` (+subject/from) input; switch reads to `triggerBody()`;
   resolve the `sha256/size/Path` contract (drop SHA for the slice or add a hashing step); return the
   instruction bytes/name + image count. (§3.2)
7. **(fix) parse:** confirmed OK; no logic change (depends on §3.3 binding + gate). 
8. **(fix) intake:** delete inline provider-resolve/Create; add Run-a-Child-Flow chain (classify →
   provider-match → case-resolve → parse → [re-]case-resolve → status-evaluate); reconcile committed
   trigger to live `OnNewEmailV3`. (§3.1)
9. **(op) Bind connections:** `cr1bd_evidenceblob` (blob), `cr1bd_ceparser` (function key), and
   `cr1bd_evavalidation` **iff Path 1**. Put all in one DLP group. (§4)
10. **(op) Env-var:** confirm/set `cr1bd_PDF_MAPPER_ENABLED=true`; leave enrich/EVA OFF. (§5)
11. **(op) Seed domains:** run `15-seed-emaildomains.ps1 -Apply` for at least the test sender's
    provider. (§6)
12. **(op) Import + PUBLISH flows in the designer:** re-import the edited definitions into
    `CollisionSpikeFlows`; **open each in make.powerautomate.com and Save** (arm webhooks/triggers —
    do NOT trust `clientdata`); re-enable **Concurrency=1** on intake if prompted.
13. **(op) Turn ON** (in order): classify-persist, parse, status-evaluate (provider-match, case-resolve,
    intake already ON). Leave enrich/finalize/chaser/jobsheet OFF.
14. **(verify) Run §7** end-to-end on one email; assert `ready_for_eva` + 2 Evidence + 12 fields.
15. **(verify) Run §7 negative/dedup** checks.
16. **(verify) Flow run health:** `GET …/flows/<id>/runs` (Succeeded) and `/triggers` (200, not 500)
    for intake; child flows show runs invoked by the parent.

---

## 9. Open questions / uncertainties (need the user or a live check)

1. **Q1 — Orchestration shape (BIGGEST OPEN QUESTION).** Confirm **Strategy A** (intake calls the five
   children via *Run a Child Flow*, consolidating the dedup currently split between intake's inline
   logic and the orphaned provider-match/case-resolve). This is a non-trivial rewrite of a live,
   webhook-armed intake flow and **changes the source of truth for Case creation**. Approve before
   touching intake. *(Verify nesting/time limits: child-flow sync response ≤120 s; chain of 5 may need
   the async-202 pattern.)*
2. **Q2 — `shared_azureblob` `sha256`.** The stock `CreateFile` does **not** return a content hash; the
   "storage Function" the comments reference doesn't exist. Confirm: drop per-attachment SHA-dedup for
   Phase 1 (rely on Message-ID + payloadHash) — or commit to a hashing step? *(Live-verify the actual
   `CreateFile` response shape in a scratch flow.)*
3. **Q3 — Is fully-automatic `ready_for_eva` in scope?** With M1 defaults (`imageRole=unknown`,
   `registrationVisible=false`) a clean email parks at **`missing_images`** until OCR sets the plate
   flag and a human tags roles. Confirm a **manual role-tag** is an accepted Phase-1 gate (data model
   says it is), or that M1 OCR + auto-role is required to land `ready_for_eva` without a human.
4. **Q4 — Provider domains data.** `knownemaildomains` is empty for ~376/392 providers; real domains
   were never supplied. Auto-match beyond the test provider needs the operator to provide
   `email-domains.csv`. *(Intermediary domains → ImageSource path, not knownemaildomains.)*
5. **Q5 — Validation surface ownership.** If Path 1, who builds/deploys the `ValidateCase` Function and
   imports `shared_evavalidation`? It is net-new (a third Function + connector + DLP + key). Path 2
   avoids it but risks Code App ↔ flow readiness drift (the §5.4 concern).
6. **Q6 — Committed-vs-live trigger drift.** `intake.definition.json` says
   `SharedMailboxOnNewEmailV2`; live is `OnNewEmailV3`. Reconcile the committed file so a re-import
   doesn't regress the (hard-won) working trigger. *(Verify with the Flow `/triggers` API = 200.)*
7. **Q7 — `@odata.bind` nav-prop casing.** intake used `/cr1bd_workproviders(…)` (leading slash);
   case-resolve uses `cr1bd_workproviders(…)` (no slash) with nav prop `cr1bd_Workproviderid`.
   Confirm the exact single-valued nav-property name + format from live `$metadata` before activation.

---

## Appendix — evidence base (all read this session)
- Flows: `flows/definitions/{intake,classify-persist,parse,provider-match,case-resolve,status-evaluate,enrich}.definition.json`; `flows/connection-references.json`.
- Data model / env: `docs/architecture/{data-model.md,live-environment.md,integrations.md}`; `CLAUDE.md`, `AGENTS.md`, `CURRENT_STATUS.md`, `DEPLOY-RUNBOOK.md`, `PLAN.md`.
- Parser: `functions/parser/{function_app.py,openapi/parser-connector.json}`; gates `dataverse/environment-variables.json`; seed `dataverse/.build/15-seed-emaildomains.ps1`.
- **Live reads (read-only, 2026-06-18):** Dataverse `workflows?$filter=category eq 5` confirmed states
  (Case Resolve / Intake / Provider Match **ON**; the rest **off**) and **no** child-flow invocation in
  any project flow's `clientdata`. No `functions/validation/` directory exists.
- Authoritative docs (Microsoft Learn): child flows use "Manually trigger a flow" + **Run a Child
  Flow** (HTTP-URL chaining breaks on solution export/import); async-202 for >120 s children; V3 email
  trigger returns `body/attachments[*].contentBytes` with Include Attachments = Yes.
