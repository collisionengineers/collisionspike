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
- Links: `workProviderId` (→ WorkProvider), `inspectionAddressId` (→ InspectionAddress, nullable).
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
| EVA Code | `principalCode` (used in Case/PO) |
| Box Code | `boxCode` |
| Inbox | `defaultMailbox` |
| Solicitors Instructions | `instructionNotes` |
| Drag in to EVA? | `dragInToEva` |
| Images location | `imagesSourceNotes` |
| Image based or address | seeds `inspectionLocationPolicy` + known addresses |
| Sending Report | `reportReturnNotes` |
Plus governance fields: `knownEmailDomains[]` (matching key — see below), `providerAutomationMode`,
per-provider toggles (AI/EVA/enrichment/outbound allowed), `inspectionLocationPolicy`,
`active|archived`, deterministic EVA-readiness overrides, audit history.

### InspectionAddress  (from `Garages` sheet, 38 rows + provider storage yards)
Canonical term aligned to EVA; *garage/repairer/bodyshop/storage* are **source labels**, not
separate entities. Fields: `label`, source-label, **6-line EVA address**, `postcode`, optional
phone/email, optional `figuresExpected` (from Garages `Figures` col), source/evidence note,
provenance link (web/AI), linked WorkProviders, `active|archived`.

### Evidence
Mirrors collisioncc `image-rules`: `kind` (image/video/instruction/email/valuation/eva_payload),
`imageRole` (overview/damage_closeup/additional/unknown), `registrationVisible`, `acceptedForEva`,
storage state, source message link.

### AuditEvent & ImprovementSignal
- `AuditEvent`: actor, action, severity, before/after, timestamp — every corpus/case change.
- `ImprovementSignal`: staff corrections captured during review (never auto-change rules) →
  Management triage queue. Fields: case, provider, fieldName, original/corrected value, original
  provenance, actor/time, affected-EVA-readiness flag, classification
  (`parser_rule_candidate`/`corpus_update_candidate`/`provider_policy_candidate`/`enrichment_issue`/
  `one_off_case_issue`).

### Field-level provenance (on each EVA-relevant Case field)
`fieldName, value, sourceType, sourceLabel, sourceReference, confidence?, reviewState, reviewedBy?,
reviewedAt?, notes?`. `sourceType` ∈ {staff, pdf_extraction, email_text, corpus, ai, dvla_dvsa,
document_ai, cloud_vision→azure_vision, web_lookup, whatsapp, manual_upload}. `reviewState` ∈
{not_required, needs_review, reviewed, conflict}. UI shows compact markers (`PDF`, `Corpus`, `AI`,
`Web`, `Staff`).

## Case status state machine
`new_email → ingested → needs_review → ready_for_eva → eva_submitted`, with branches
`missing_required_fields`, `missing_images`, `duplicate_risk`, `linked_to_instruction`; terminals
`eva_submitted`, `box_synced`, `error`. (Aligns with collisioncc `case-status.ts`.)

## Provider matching — by email domain, not aliases
Match the sender domain after `@` to `WorkProvider.knownEmailDomains` (e.g. `john@carcompany.co.uk`
→ WorkProvider `CarCompany`, principalCode `CCPY`). Keep domains/codes unique enough to avoid
ambiguous matching and unsafe Case/PO generation. **Do not match on aliases.**

## Case/PO
`principalCode + 2-digit year + 3-digit provider sequence` (e.g. `CCPY26050`). For the spike, the
user **enters the Case/PO at EVA submit**. Future Box-folder sequence discovery (highest existing
number + 1) is deferred.

## Governance (small team, ~10 staff — single-Management approval)
Management edits all corpus records directly (validation + impact warnings + change-reason for
risky edits + audit + rollback). Admin staff submit address/contact corrections → Management review
queue (not auto-active). Engineers read-only. No mandatory second review; risky edits need stronger
inline confirmation + impact counts. Referenced WorkProviders/InspectionAddresses are never deleted
— deactivate/archive/merge with old IDs kept as history redirects (Case/PO history depends on old
principal codes).
