# Data Model (Postgres)

> **System of record (LIVE):** **PostgreSQL Flexible Server `cespk-pg-dev` (v16), database
> `collisionspike`** — **36 tables** (14 business + 22 `choice_*` lookup tables) in `rg-collisionspike-dev`
> (UK South). DDL is [`migration/assets/schema/*.sql`](../../migration/assets/schema/). Seeded corpus
> (provider / repairer / image-source / inspection-address; `case_` 0) — **live counts live only in the
> registry** [live-environment.md](./live-environment.md) (single source: [LIVE_FACTS.json](../../LIVE_FACTS.json)),
> where they are banded last-known/unverified-this-snapshot.
>
> **Platform note:** this model was first built on **Microsoft Dataverse** (`cr1bd_*` tables/choicesets in
> the `Collision Engineers - Dev` sandbox). That implementation has been **migrated to Postgres and
> decommissioned** — only the **storage mechanism** changed; **the domain model, the 12-field EVA contract,
> the EVA integer codes, the image rules, and the corpus are carried over intact**. Below, the original
> `cr1bd_*` field names are retained in parentheses as the provenance of each Postgres column; the
> migration mapping is in [`migration/20-data-and-schema-migration.md`](../HISTORICAL/migration/20-data-and-schema-migration.md).

Distilled from the real **CE Job Sheet** (`raw/…xlsm`), the provider/inspection-address corpus
notes, and the case workflow. The job sheet's `Principals` and `Garages` sheets become governed
corpus tables; the formula-driven `Jobs` sheet becomes the `Case` table. **Source records (with
PII) live in `raw/` (gitignored) and seed Postgres later.**

> All adjacent-repo material is **reference/ideas, not canonical** — this model is the spike's own
> working design, subject to confirmation (see the grill).

## Storage shape — `cr1bd_*` → Postgres, and the `choice_*` lookup contract

- **Tables/columns:** each Dataverse table became a Postgres table and each `cr1bd_*` column a
  **snake_case** column (e.g. `cr1bd_case` → `case_` — `case` is a SQL reserved word; `cr1bd_boxfolderid`
  → `box_folder_id`). The **Data API's contract package** (`@cs/domain`) maps domain **camelCase** keys ↔
  these snake_case columns, so application code is unchanged by the platform move.
- **Choicesets → `choice_*` lookup tables (the parity keystone).** Every Dataverse global choice set became
  a **`choice_*` lookup table** `(code PK, name UNIQUE, label)`, and the Dataverse **option value (the
  integer code) is copied VERBATIM** into `code`. These integers are a **hard contract** — EVA payload
  codes, `mockup-app/src/contracts`, the deterministic classifier, and the Vitest parity test all key on
  them, so they **must never be renumbered** (ADR-0019 / R4). Each business column (`*_code int`) carries a
  FK to its `choice_*(code)`, reproducing the Dataverse "Choice attribute → global option set"
  relationship. 22 lookup tables in total (e.g. `choice_case_status`, `choice_evidence_kind`,
  `choice_audit_action`, `choice_field_provenance_source_type`). Source: `000_enums_lookups.sql`.

## Tables

### Case
The live work item (replaces the `Jobs` sheet — 31 cols × ~226 rows of formula-driven tracking).
- Identity: `vrm`, `caseRef`/source reference, `casePo` (generated at **parse-confirm** for instructions
  cases — see Case/PO below; the live `intake` flow stamps it in `Scope_generate_casepo`).
- Matching (ADR-0002): correlate incoming images/instructions by **VRM** into the single **open**
  Case; if none open, create one. Multiple historical Cases per VRM are allowed; ambiguous/duplicate
  matches are flagged `duplicate_risk` for human review (never auto-merged).
- Dedup (ADR-0010): **same-vs-new is disambiguated by claim/reference, not time** — a VRM can have two
  claims the same day. Reference matches an open case → attach; reference differs → new case; **no
  reference → staff confirm**. Exact Message-ID/hash repeat → drop. Never auto-merge on VRM+time or
  across providers.
- Readiness (deterministic): `ready_for_eva` only when the **required-items checklist** is satisfied
  or explicitly overridden — 12 EVA fields valid + image-rules + inspection-address decision +
  per-provider extras. Unsatisfied items = the **Missing** list; EVA submit is blocked until met.
  An image-based inspection address is an explicit override-with-reason, not a silent pass.
- Enrichment precedence: the **instruction/parser is authoritative** for mileage — DVSA
  `current_mileage_estimate` runs **only when the document has no mileage** (ADR-0006).
- Links: `workProviderId` (→ WorkProvider), `imageSourceId` (→ ImageSource, nullable),
  `inspectionAddressId` (→ InspectionAddress, nullable).
- Workflow: `status` (state machine below), `intakeChannel` (Email/WhatsApp × Auto/Manual; **Audatex out of scope**),
  `sourceMailbox`, `dateDue`, `inspectionDate`.
- EVA fields (the 12-field contract): vehicle model, claimant name, dates, accident circumstances,
  VAT status, mileage + unit, 6-line inspection address (or `Image Based Assessment`). Engineer
  allocation is NOT an EVA submission field — it is assigned inside EVA after submission (removed from
  the contract, B3 RESOLVED).
- Overview-only (imported when present, **must not drive workflow/readiness/matching**):
  insuredName, claimantName, thirdPartyName, claimNumber, policyReference, incidentDate, claimType,
  insurerName, repairerName.
- **Box one-way-mirror fields (Phase 7, ADR-0012 — now columns on `case_` in `050_case.sql`):**
  `boxFolderId` (`box_folder_id` / `cr1bd_boxfolderid`), `boxFolderUrl` (`box_folder_url`),
  `boxFileRequestId` (`box_file_request_id`), `boxFileRequestUrl` (`box_file_request_url`, `format:Url`),
  `boxSyncedAt` (`box_synced_at` — stamped by the finalize step at `box_synced`), and `sourceMailbox`
  (`source_mailbox`). **Written system-of-record → Box only**; the SPA *reads* them (e.g. to mint an
  "Open in Box" deep link) but case **logic never runs off them** — see the Box rule below. Plus the
  finalize submit-signal columns `submit_requested` / `submit_payload_hash` / `eva_payload12` and the
  `finalized_payload_hash` idempotency latch.

### WorkProvider  (from `Principals` sheet, 58 rows)
Governed corpus record. Job-sheet columns map directly:
| Job sheet column | Field |
|---|---|
| Solicitor/Work Provider | `displayName` |
| EVA Code / Box Code | `principalCode` — **one code**; lowercase = EVA Code, UPPERCASE = Box Code & Case/PO |
| Inbox | `defaultMailbox` |
| Solicitors Instructions | `instructionNotes` |
| Drag in to EVA? | `dragInToEva` |
| Images location | `imagesSourceNotes` |
| Image based or address | seeds `inspectionLocationPolicy` + known addresses |
| Sending Report | `reportReturnNotes` |
Plus governance fields: `knownEmailDomains[]` (matching key — see below),
`providerAutomationMode` (`work_provider.provider_automation_mode_code` → `manual` /
`review_auto` / `full_auto`; orchestration branches on this — Box/archive always runs; enrichment defers
in `manual`; see [provider-corpus.md](../requirements/provider-corpus.md)),
per-provider toggles (AI/EVA/enrichment/outbound allowed), `inspectionLocationPolicy`,
`active|archived`, deterministic EVA-readiness overrides, audit history.

### Repairer  (from `Garages` sheet, 38 rows) — **first-class entity** (see ADR-0001)
A garage/bodyshop CE interacts with: `name`, **6-line address** + `postcode`, `email`, `phone`,
`figuresExpected` (Garages `Figures` col — whether the repairer supplies their own estimate figures),
`active|archived`. **Many-to-many with WorkProvider** (one repairer serves several providers; one
provider uses several repairers). A reusable directory you chase images/figures from.

### InspectionAddress  (per case)
The location on a case's EVA record. References a **Repairer** (`repairerId`, most common) OR holds an
ad-hoc location (storage yard, claimant home) OR the `Image Based Assessment` marker. Fields:
`repairerId?`, ad-hoc **6-line address** + `postcode`, source-label (repairer/storage/home),
source/evidence note, provenance link, and decision mode
(`confirmed_physical | manual | image_based | unknown`).

### ImageSource
The party that supplies a case's images/instructions — a **role**, not always a distinct org.
Fields: `name`, `kind` (`provider_direct | repairer | intermediary | individual`), `channel`
(`email | whatsapp` — **Audatex out of scope**), match keys (`emailDomain?`, `whatsappGroup?`/`whatsappNumber?`,
`contactName?`), optional `repairerId?` (when the source **is** a Repairer — don't duplicate it),
`workProviderId`s (m:n), optional default Inspection Address hint. Drives recognition of
non-email-domain intake (WhatsApp/individuals) and address defaulting. A Case carries `imageSourceId`.
**WhatsApp intake is manual** (Business app — ADR-0007); a planned timesaver bulk-imports exported
WhatsApp media and **OCR-matches images to Cases by VRM**.

### Evidence
Mirrors collisioncc `image-rules`: `kind` (image/video/instruction/email/valuation/eva_payload/engineer_report),
`imageRole` (overview/damage_closeup/additional/unknown), `registrationVisible`, `acceptedForEva`,
storage state, source message link. `registrationVisible` is **OCR-assisted from M1** (does an
image's OCR text contain the case VRM?); `imageRole` tagging is **manual until M2** image AI.
An **audit case** (`Case.caseType = audit`, `cr1bd_casetype`; ADR-0014 — a second, independent CE
inspection auditing a **third-party** engineer's original report, marked by an `A.` Case/PO prefix)
carries that original as an **`engineer_report`** Evidence — stored for comparison, **never overlaid**
(distinct from the engineer-report overlay, which merges CE's own CNX/EVA report).
**Box mirror columns (Phase 7, ADR-0012 — columns on `evidence` in `060_evidence.sql`):** `boxFileId`
(`box_file_id` / `cr1bd_boxfileid`) and `boxFileUrl` (`box_file_url`). `box_file_id` is a **correlation/UI
mirror** the `box-webhook` Function writes on accept — it is **not** the dedup key: durable dedup is the
Evidence-existence check on the `box:file:<id>` tag in **`source_message_id`** (see the Box mirror rule
below).

### Guided capture sessions (TKT-200 candidate — not live)

`capture_session` belongs to one existing Case and snapshots a finite shot plan, guidance mode/rules
version, expiry and token generation. Bootstrap secrets are 256-bit values represented at rest only by
their SHA-256 hashes. `capture_session_resume_token` stores only bounded resume-token hashes plus the
session generation/expiry; rows are deleted on rotation, cancellation, lock, completion or expiry.

`capture_session_shot` is the immutable requested-shot snapshot. `capture_asset` records exact-object
upload attempts, client declarations, untrusted bounded `client_quality`, authoritative bounded
`server_quality`, validation leases, immutable promoted paths/hashes and eventual Evidence linkage.
Only a selected structurally valid asset can be materialised. Materialised rows create excluded
`public_guided_capture` image Evidence pending an explicit staff include/accept decision; they do not
become EVA-ready from client guidance claims.

**Staff-confirmed image deletion (TKT-160):** `evidence.deletion_operation_id` marks an image while a
delete is incomplete. The append-preserved `evidence_deletion` row snapshots case/evidence identity,
filename, Blob path, source identity, exact Box file/folder IDs, requesting actor, per-store outcomes,
lease/attempt state and failure code — never image bytes. Normal evidence reads keep a pending image
visible (the SPA offers **Finish deleting**); review edits, archive mirroring, classification and case
merge refuse/ignore that marked row. `complete_evidence_deletion(operation, claim)` is the sole guarded
hard-delete seam and succeeds only after both store outcomes are resolved and the live row still exactly
matches the snapshot. The tombstone then suppresses only a replay of the same per-file Blob path or Box
file ID. `source_message_id` remains contextual provenance but is never a replay key by itself because
email siblings share one Message-ID. A later explicit upload with a new path/file identity remains valid
even if its bytes hash matches. Every schema FK that targets `evidence(id)` uses `ON DELETE CASCADE` or
`ON DELETE SET NULL`, so the guarded hard delete cannot be trapped by a persistent child reference.

### AuditEvent & ImprovementSignal
- `AuditEvent`: actor, action, severity, before/after, timestamp — every corpus/case change.
- `ImprovementSignal`: staff corrections captured during review (never auto-change rules) →
  Management triage queue. Fields: case, provider, fieldName, original/corrected value, original
  provenance, actor/time, affected-EVA-readiness flag, classification
  (`parser_rule_candidate`/`corpus_update_candidate`/`provider_policy_candidate`/`enrichment_issue`/
  `one_off_case_issue`).

### Chaser & Note
- `Chaser` (ADR-0003): tracked request for Missing items — `caseId`, `targetType`
  (`image_source`/`repairer`/`work_provider`), `channel` (`email`/`whatsapp`),
  `templateUsed`, `status` (`drafted`/`sent`/`responded`/`overdue`), `sentBy?`, `sentAt?`.
  **Channel-aware:** email = draft + (later) Outlook send; WhatsApp = **draft + manual send**
  (WhatsApp Business only). **Audatex out of scope.**
- `Note`: free-text — `caseId`, `author`, `timestamp`, `text`. First-class, always available.

### Field-level provenance (on each EVA-relevant Case field)
`fieldName, value, sourceType, sourceLabel, sourceReference, confidence?, reviewState, reviewedBy?,
reviewedAt?, notes?`. `sourceType` ∈ {staff, pdf_extraction, email_text, corpus, ai, dvla_dvsa,
document_ai, cloud_vision→azure_vision, web_lookup, whatsapp, manual_upload}. `reviewState` ∈
{not_required, needs_review, reviewed, conflict}. UI shows compact markers (`PDF`, `Corpus`, `AI`,
`Web`, `Staff`).

## Case status state machine
`new_email → ingested → needs_review → ready_for_eva → eva_submitted`, with branches
`missing_required_fields`, `missing_images`, `duplicate_risk`, `linked_to_instruction`; terminals
`eva_submitted`, `box_synced`, `error`. (Adapts collisioncc `case-status.ts` — reference, not gospel.)

**Two user-facing queues (decided), mirroring the job sheet's two sections:**
1. **Not ready / chasing** — `missing_*` / `needs_review`, with an active Chaser.
2. **Ready, not yet in EVA** — `ready_for_eva` (parked before manual EVA input).
Plus **Submitted** (`eva_submitted`) and **Box-synced** (`box_synced`).

## Provider matching — by email domain, not aliases
Match the sender domain after `@` to `WorkProvider.knownEmailDomains` (e.g. `john@carcompany.co.uk`
→ WorkProvider `CarCompany`, principalCode `CCPY`). Keep domains/codes unique enough to avoid
ambiguous matching and unsafe Case/PO generation. **Do not match on aliases.**

## Case/PO
`principalCode + 2-digit year + 3-digit provider sequence`, in **two case-renderings** of the same
characters: **EVA (lowercase)** e.g. `test26001` and **Box (UPPERCASE)** e.g. `TEST26001`. The Case/PO is
**generated at parse-confirm** for instructions cases (the live `intake` flow's `Scope_generate_casepo` →
`Update_case_casepo`), so it exists well before EVA submit. **Phase 7 (ADR-0012):** because the Case/PO
exists at parse-confirm, the **UPPERCASE Box folder is minted then** (`box-folder-create`), not at submit;
`finalize-eva-box` later *augments* that folder rather than creating it. (This supersedes the earlier
"user enters the Case/PO at EVA submit; Box upload happens in unison" model.) Future Box-folder sequence
discovery (highest existing number + 1) is deferred.

## Box mirror rule (Phase 7, ADR-0012) — one-way, system-of-record-authoritative
Box is an **additive content + intake + archival mirror**, written **one-way (system of record → Box)** —
the system of record is now **Postgres** (was Dataverse). **Box Metadata has no joins**, so **dedup
(ADR-0010), the status machine, and Case/PO sequencing NEVER run off Box** — they run off the system of
record only. The **`box-webhook` Function (retained, gated)** may *write* an Evidence row from an upload
(the byte store stays Azure Blob), stamping `box_file_id` (`cr1bd_boxfileid` — a correlation/UI mirror,
**not** the dedup key) + `accepted_for_eva=true`; durable dedup is the Evidence-existence check on the
`box:file:<id>` tag in **`source_message_id`** (`cr1bd_sourcemessageid`). The receiver processes this
fan-out **on the request path** and returns 200 when settled (or a non-2xx so Box retries), then re-invokes
the idempotent status-evaluate step; case **logic** is never queried off Box. The Box columns above are the
mirror's footprint on the Case table.

- **Gates (owned here as schema; read everywhere else):** 3 Boolean `BOX_*` gates
  (`BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`) + 2 String config vars
  (`BOX_FOLDER_ROOT_ID`, `BOX_FILE_REQUEST_TEMPLATE_ID`) — all default OFF/empty. **Now Function-App /
  API app-settings** the Data API + orchestration **read** (they were `cr1bd_BOX_*` Dataverse environment
  variables in the prior build); none re-defines them.
- **Audit:** 3 append-only `cr1bd_auditaction` options — `box_folder_created` (100000019),
  `box_file_request_copied` (100000020), `box_upload_received` (100000021).
- **Status:** unchanged — `box_synced` (100000009) already exists in `case-status`; Phase 7 adds no new
  status value.

## Governance (small team, ~10 staff — single-Management approval)
Management edits all corpus records directly (validation + impact warnings + change-reason for
risky edits + audit + rollback). Admin staff submit address/contact corrections → Management review
queue (not auto-active). Engineers read-only. No mandatory second review; risky edits need stronger
inline confirmation + impact counts. Referenced WorkProviders/InspectionAddresses are never deleted
— deactivate/archive/merge with old IDs kept as history redirects (Case/PO history depends on old
principal codes).
