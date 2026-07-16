---
id: TKT-193
title: Hold pre-case evidence and adopt it when instructions arrive
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-003, TKT-023, TKT-027, TKT-034, TKT-047, TKT-084, TKT-089, TKT-093, TKT-118, TKT-133, TKT-145, TKT-146]
research-link: docs/tickets/backlog/TKT-192-triage-precase-category/evidence/operator-source/triage-process.md
plan: PLAN-004
---

# Hold pre-case evidence and adopt it when instructions arrive

## Problem
Triage and similar pre-instruction messages can contain the original email, vehicle images and documents that will be needed later, but they must not create a Case/PO before formal instructions arrive. The current Case-only evidence lifecycle cannot safely retain and correlate those bytes without either minting a false case or leaving later instructions unable to adopt the earlier evidence.

## Evidence
- [Operator process note](../TKT-192-triage-precase-category/evidence/operator-source/triage-process.md) — triage requests must not become cases; their email and attachments should be retained and linked when instructions arrive.
- [Triage sample corpus](./evidence-manifest.json) — supplied request/reply emails, image attachments and the earlier triage document template demonstrate multiple subjects, provider references and attachment shapes.
- ADR-0015 currently says raw email bytes are retained only when a Case is extracted. The operator has explicitly approved a narrow pre-case holding exception, which must be documented rather than implemented as an unrecorded policy contradiction.
- TKT-034 already adopts registration-named image folders into later cases, and TKT-145 backfills evidence after a case link; neither supplies a durable non-Case identity for original email/document/image evidence.

## Proposed change
PROPOSED (not built): introduce a first-class pre-case holding identity and evidence container for approved triage/pre-instruction categories. Retain source bytes and correlation facts without a Case/PO, then atomically bind/adopt that identity and its evidence into the canonical case when formal instructions are matched or a handler confirms the link.

The holding record is not a hidden case: it does not participate in case counts, Case/PO allocation, readiness, EVA export or case chasers. Handler-facing copy should use “Awaiting instructions” and “Add to case”, not storage or schema terminology.

## Acceptance
- **A1.** An approved triage/pre-instruction routing decision creates or reuses one pre-case holding identity and creates no case row, Case/PO allocation, case status/readiness row or standard Case/PO-named Archive folder.
- **A2.** The holding identity records normalized exact source facts separately: mailbox/message and conversation IDs, sender/recipient/time, provider and provider reference when known, normalized registration, claimant/insured hints, subject and classifier/policy version. Exact provider/reference and message identity outrank registration-only correlation; ambiguous matches never auto-combine.
- **A3.** The original `.eml` bytes and every accepted non-signature image/document attachment are retained with filename, MIME type, size, content hash, source message/attachment identity and received time. PDF-extracted images retain their parent document and page/source relationship; signature/logo exclusions remain effective and auditable.
- **A4.** Pre-case bytes are stored under an approved holding boundary in the Archive/content store using collision-safe stable identity, without inventing a Case/PO. Repeated filenames or references cannot overwrite different bytes, and the holding record retains the provider item/folder identity needed for later adoption.
- **A5.** Held evidence is visible from the relevant inbox/pre-case view but is excluded from case counts, review/readiness, EVA export, image-gap decisions, case chasers and case search results that promise an existing case until adoption succeeds.
- **A6.** When formal instructions arrive, exact case/provider-reference matching or a confirmed handler choice atomically links the earlier inbound messages and adopts all held evidence into the canonical case/evidence lifecycle, including the Archive folder rename/merge required by the canonical Case/PO.
- **A7.** Adoption preserves original message/attachment bytes, hashes, received timestamps, source relationships, image decisions and provider IDs. It creates no duplicate content/evidence row when the instruction or another lane already supplied the same bytes; filename alone is never used to deduplicate.
- **A8.** Intake replay, duplicate mailbox delivery, repeated adoption request, response loss and concurrent instruction arrival are idempotent: they result in one holding identity, one canonical case, one logical copy of each evidence item and one completed adoption operation.
- **A9.** Database and Archive work is transactional or compensatable. A partial move/copy/link failure leaves the pre-case evidence recoverable, keeps the case Not Ready where required, exposes the failed stage and retry action, and never reports adoption complete until every manifest item has a terminal accounted outcome.
- **A10.** If one pre-case identity could match several cases, or several holdings could match one instruction with conflicting authoritative facts, the system proposes candidates with reasons and waits for a handler. It does not mint, merge, overwrite or silently choose by registration.
- **A11.** Adoption into a case that is later merged or retired follows canonical merge lineage: evidence and message links end on the surviving case, while the pre-case/adoption audit remains resolvable and no active content remains owned only by the retired record.
- **A12.** Creation, correlation, manual link, adoption, retry, refusal and merge transfer are audited with stable identity, actor (`System` or named staff), method, before/after ownership, item counts/hashes, operation ID and outcome; handler-facing history uses plain language.
- **A13.** ADR-0015 and the live data-retention/architecture documentation are amended to authorize raw email retention for this narrowly defined pre-case holding record, with retention/deletion, access-control and adoption rules. It does not broaden retention for ordinary query/other mail or weaken mailbox, RLS, secret or external-sharing controls.
- **A14.** Coverage uses the supplied triage corpus plus fixtures for bare images, attached PDF images, repeated filenames, signatures, ambiguous VRM, exact reference, duplicate delivery, concurrent instruction, partial Archive failure and merge-after-adoption; signed-in proof demonstrates hold then adoption without a premature Case/PO, duplicate or lost byte.

## Validation
- **Offline:** pin the supplied triage samples and hashes; run classifier/policy-to-holding integration, database/RLS, attachment filtering/extraction, manifest/adoption, fault-injection, replay/concurrency, merge-lineage and readiness exclusion tests. Compare every source and adopted hash.
- **Signed-in/live:** observe a naturally arriving, operator-designated real triage/pre-instruction item, confirm one “Awaiting instructions” record and zero case/Case-PO, then follow its genuine later instruction when it occurs and verify adoption. Do not send/replay fake work or create a case for proof; keep later-adoption classes PENDING until a real occurrence. Reconcile database, content hashes, UI and audits read-only except for the genuine workflow actions.
- **Policy review:** independently verify the ADR/document amendment is narrow, that ordinary query/other messages still follow their existing retention rule, and that no user-facing string exposes implementation terms.

## Research
Distilled 2026-07-13 from the operator's [triage process note](../TKT-192-triage-precase-category/evidence/operator-source/triage-process.md), the [supplied triage corpus](./evidence-manifest.json) and the existing pre-instruction/adoption tickets. The operator resolved the former policy question by approving a pre-case identity/evidence holding record that is adopted when instructions arrive.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator process note](../TKT-192-triage-precase-category/evidence/operator-source/triage-process.md)
- [Triage sample corpus](./evidence-manifest.json)
