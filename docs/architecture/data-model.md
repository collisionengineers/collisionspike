# Data Model (Dataverse)

Distilled from the real **CE Job Sheet** (`raw/…xlsm`), the provider/inspection-address corpus
notes, and the case workflow. The job sheet's `Principals` and `Garages` sheets become governed
corpus tables; the formula-driven `Jobs` sheet becomes the `Case` table. **Source records (with
PII) live in `raw/` (gitignored) and seed Dataverse later.**

> All adjacent-repo material is **reference/ideas, not canonical** — this model is the spike's own
> working design, subject to confirmation (see the grill).

## Tables

### Case
The live work item (replaces the `Jobs` sheet — 31 cols × ~226 rows of formula-driven tracking).
- Identity: `vrm`, `caseRef`/source reference, `casePo` (entered at EVA submit — see Case/PO below).
- Matching (ADR-0002): correlate incoming images/instructions by **VRM** into the single **open**
  Case; if none open, create one. Multiple historical Cases per VRM are allowed; ambiguous/duplicate
  matches are flagged `duplicate_risk` for human review (never auto-merged).
- Readiness (deterministic): `ready_for_eva` only when the **required-items checklist** is satisfied
  or explicitly overridden — 13 EVA fields valid + image-rules + inspection-address decision +
  per-provider extras. Unsatisfied items = the **Missing** list; EVA submit is blocked until met.
  An image-based inspection address is an explicit override-with-reason, not a silent pass.
- Links: `workProviderId` (→ WorkProvider), `imageSourceId` (→ ImageSource, nullable),
  `inspectionAddressId` (→ InspectionAddress, nullable).
- Workflow: `status` (state machine below), `intakeChannel` (Email/WhatsApp/Audatex × Auto/Manual),
  `sourceMailbox`, `dateDue`, `inspectionDate`.
- EVA fields (the 13-field contract): vehicle model, claimant name, dates, accident circumstances,
  VAT status, mileage + unit, 6-line inspection address (or `Image Based Assessment`).
- Overview-only (imported when present, **must not drive workflow/readiness/matching**):
  insuredName, claimantName, thirdPartyName, claimNumber, policyReference, incidentDate, claimType,
  insurerName, repairerName.

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
Plus governance fields: `knownEmailDomains[]` (matching key — see below), `providerAutomationMode`,
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
(`email | whatsapp | audatex`), match keys (`emailDomain?`, `whatsappGroup?`/`whatsappNumber?`,
`contactName?`), optional `repairerId?` (when the source **is** a Repairer — don't duplicate it),
`workProviderId`s (m:n), optional default Inspection Address hint. Drives recognition of
non-email-domain intake (WhatsApp/individuals) and address defaulting. A Case carries `imageSourceId`.

### Evidence
Mirrors collisioncc `image-rules`: `kind` (image/video/instruction/email/valuation/eva_payload),
`imageRole` (overview/damage_closeup/additional/unknown), `registrationVisible`, `acceptedForEva`,
storage state, source message link. `registrationVisible` is **OCR-assisted from M1** (does an
image's OCR text contain the case VRM?); `imageRole` tagging is **manual until M2** image AI.

### AuditEvent & ImprovementSignal
- `AuditEvent`: actor, action, severity, before/after, timestamp — every corpus/case change.
- `ImprovementSignal`: staff corrections captured during review (never auto-change rules) →
  Management triage queue. Fields: case, provider, fieldName, original/corrected value, original
  provenance, actor/time, affected-EVA-readiness flag, classification
  (`parser_rule_candidate`/`corpus_update_candidate`/`provider_policy_candidate`/`enrichment_issue`/
  `one_off_case_issue`).

### Chaser & Note
- `Chaser` (ADR-0003): tracked request for Missing items — `caseId`, `targetType`
  (`image_source`/`repairer`/`work_provider`), `channel` (`email`/`whatsapp`/`audatex`),
  `templateUsed`, `status` (`drafted`/`sent`/`responded`/`overdue`), `sentBy?`, `sentAt?`.
  **Channel-aware:** email = draft + (later) Outlook send; WhatsApp = **draft + manual send**
  (WhatsApp Business only); Audatex = await.
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
`principalCode + 2-digit year + 3-digit provider sequence` (e.g. `CCPY26050`). Case/PO uses the
**uppercase** rendering of the principal code (same characters the EVA Code holds in lowercase). For
the spike, the user **enters the Case/PO at EVA submit**. Future Box-folder sequence discovery (highest existing
number + 1) is deferred.

## Governance (small team, ~10 staff — single-Management approval)
Management edits all corpus records directly (validation + impact warnings + change-reason for
risky edits + audit + rollback). Admin staff submit address/contact corrections → Management review
queue (not auto-active). Engineers read-only. No mandatory second review; risky edits need stronger
inline confirmation + impact counts. Referenced WorkProviders/InspectionAddresses are never deleted
— deactivate/archive/merge with old IDs kept as history redirects (Case/PO history depends on old
principal codes).
