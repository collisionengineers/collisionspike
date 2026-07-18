# Operator comments per ADR — Review 160726

Transcribed from the operator's 2026-07-16 read of all 25 ADRs, as captured in the working plan
(`workingspace/adr-rewrite.txt`). Tags: **[directive]** — change required; **[question]** — answer
required; **[observation]** — claimed mismatch to verify against ground truth. Rulings and outcomes
live in [`decisions.md`](./decisions.md); ADRs without a heading here received no substantive comment
(0001, 0003, 0005, 0018, 0019).

## ADR-0002 — VRM correlation

- **[observation]** "VRM is not identity" conflicts with image-first practice, where a registration is
  in effect the only identity a case has until an instruction arrives.
- **[observation]** The eliminator set described does not match what is built.

## ADR-0004 — Parsing boundary

- **[observation]** The ADR is silent on retroactive reconstruction, which also invokes the parser.

## ADR-0006 — Vehicle enrichment

- **[observation]** No odometer/mileage precedence tier exists, though ticket work already specs one.

## ADR-0007 — WhatsApp intake

- **[directive]** The decision is narrower than reality: image acquisition now spans several channels
  (File Request chasers, guided capture under evaluation, WhatsApp, network drive, agent attach).

FURTHER OPERATOR COMMENT:

The ADR is referred / titled as "Image Intake" - you renamed it here. WhatApp intake refers to receiving a CASE via whatsapp (at this time we'd manually add it due to no facility to handle this).

Proposal: Rename this ADR to: "Receipt of Images" as using the word intake WILL cause confusion.

## ADR-0008 — Tool boundary

- **[observation]** "Ends at EVA handoff" contradicts the shipped `done` cluster: post-EVA delivery
  tracking exists (sent-email, Box-PDF, and EVA-poll detectors).

## ADR-0009 — Image processing

- **[observation]** "OCR first" is imprecise about which engines actually run.
- **[question]** Is a registration-presence flag cheaper than vision for gating?

## ADR-0010 — Deduplication

- **[directive]** Two unique provider references on the same VRM are distinct cases — do not describe
  that as a "collision". The Case/PO rung should be deprioritised (providers will not quote our
  numbers). An incident-date mismatch may eliminate a candidate but must never merge one.

## ADR-0011 — Provider and source roles

- **[directive]** The ADR contradicts itself: internally it says intermediary domains belong to the
  Image Source while the title insists the roles stay distinct. Rewrite around the supplied role
  overlap matrix; caution against the ambiguous phrase "the client".

## ADR-0012 — Box Archive

- **[question]** Is the File Request template genuinely required, or optional in practice?

## ADR-0013 — Loc

- **[observation]** The Loc mechanism looks stale: nothing appears to write or read it any more.

## ADR-0014 — Audit Case type

- **[observation]** Case/PO numbering reads as shared between markers, not independent sequences
  (raised jointly against ADR-0021).
- **[question]** What decides `A.` versus `AP.` — the original engineer's verdict or our audit's
  outcome?
- **[observation]** Audit filing uses the same Box folder as the original case.
- **[observation]** PCH appears unable to mint `AP.` at all.

Operator Comment: A - Repairable, AP - total loss. Its the original engineers verdict.

## ADR-0015 — Email triage

- **[observation]** The ADR lists seven categories; the live vocabulary is larger, and draft additions
  exist that are not recorded.

## ADR-0016 — Address corpus

- **[observation]** "Normalised full site" over-claims: two pairs of rows that share a site are kept
  as four, not merged (the 2+2-vs-4 split).

Operator Comment: No, they are to be merged. Some addresses in the export missed the first line of address, thus some are just Roadname + Postcode. But in some instances the full address was on the export, hence these are the same place.

## ADR-0017 — Retention

- **[directive]** Remove. The retention architecture is being dropped with TKT-206; the Archive
  no-deletion rule must survive elsewhere.

## ADR-0020 — Provider API

- **[question]** How does the provider machine-to-machine channel relate to the MCP surface — are
  they the same lane?

## ADR-0021 — Case/PO markers

- **[observation]** Numbering reads as shared across markers (same comment as 0014; resolved against
  the comment — the ADR is correct).

## ADR-0022 — Retroactive reconstruction

- **[note]** Amended directly by the operator during the review session (TKT-119/219 eligibility,
  parallel + combined ladder, adoption gate, `$search` semantics, TKT-222). The rewrite leaves 0022
  verbatim.

## ADR-0023 — MCP hosting and auth

- **[observation]** "Read-only first" no longer matches the shipped write lane (`image_ingest_agent`
  and `upload_case_images` with idempotency and gates rather than the ADR's signed-commit-token
  design).

## ADR-0024 — Assistant write tier

- **[observation]** Expected to be a no-op once 0023 is corrected; confirm the pointer at 0023's
  tiered model.

## ADR-0025 — Shared capability registry

- **[directive]** The invariant as written is too broad; rescope it to the delegated staff surface.
