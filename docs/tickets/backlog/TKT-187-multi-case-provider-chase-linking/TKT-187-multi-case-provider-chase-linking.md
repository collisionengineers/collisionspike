---
id: TKT-187
title: Link one provider chase to every referenced case
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-023, TKT-046, TKT-093, TKT-101, TKT-145, TKT-183, TKT-186]
research-link: docs/tickets/backlog/TKT-187-multi-case-provider-chase-linking/evidence/info.md
plan: PLAN-004
---

# Link one provider chase to every referenced case

## Problem
A provider may chase one case or list several cases in a single email. A singular chase can attach directly to its unique case, but the current one-email/one-case assumption cannot faithfully represent a message asking about four separate matters. Copying the whole email into four inbound rows would corrupt message identity and invite duplicate processing; attaching it to only one case hides the chase from the other three.

Each item must be resolved independently. A single ambiguous or missing reference must not prevent safe associations for the unambiguous items, and must never be guessed away.

## Evidence
- [Operator note](./evidence/info.md) — requires singular chases to attach directly and multi-case chases to be associated with every referenced case, by duplication only if the architecture cannot represent shared association safely.
- [Singular estimate sample](./evidence-manifest.json) — one AX reference/registration: 1075364 / S500 THM.
- [Second singular sample](./evidence-manifest.json) — one AX reference/registration: 1074146 / NL65 UBY.
- [Multi-case sample](./evidence-manifest.json) — four AX reference, claimant and registration rows.
- [Second multi-case sample](./evidence-manifest.json) — four rows, including references repeated across another chase.
- TKT-093 owns confident single-case auto-attachment; TKT-186 owns Provider chase classification.

## Proposed change
PROPOSED (not built): model inbound-email-to-case association as one canonical message with one or many case links, or an equivalent canonical association that preserves the same invariant. Parse a chase into itemized provider-reference/registration pairs and resolve each item against existing cases within the provider scope.

The inbox shows linked, unmatched and ambiguous item counts. Every linked case surfaces the same canonical email; no message bytes, attachment or Archive object is multiplied merely to create visibility.

## Acceptance
- **A1.** A Provider chase containing one item auto-associates once when an exact provider reference within the identified provider resolves to exactly one eligible case. If the reference is absent, an exact normalized registration may resolve only with independent provider/thread/claimant corroboration and exactly one eligible case; registration alone is not sufficient. The association follows the standard audit, visibility and correction contract.
- **A2.** A multi-item Provider chase creates a separate canonical association from the one inbound message to every unambiguously resolved existing case. The supplied four-item samples can therefore appear on four case histories without cloning the inbound email row or source bytes.
- **A3.** The item parser keeps each provider reference, registration and claimant together as one row, tolerates whitespace/dash variants and repeated references, and never combines the reference from one row with the registration from another.
- **A4.** Each item resolves within the identified provider using exact provider reference first, then exact normalized registration with corroboration; claimant text only supports a result. Conflicting strong identifiers produce ambiguity rather than selecting whichever match ran first.
- **A5.** Partial success is explicit: unambiguous items link, while missing, unmatched or multi-match items remain listed with “Case not found”, “More than one case matches” or “Details conflict”. One bad item neither blocks nor silently disappears from the others.
- **A6.** A Provider chase never creates or retro-reconstructs a case and never allocates a Case/PO. Staff may open a missing item’s search/triage path, but the chase itself is not treated as an instruction.
- **A7.** Every associated case shows the canonical email once, including sender, received time and the item that refers to that case. The inbox shows all linked cases and unresolved items without pretending the email belongs exclusively to one case.
- **A8.** A handler can remove or correct one case association without removing the other valid associations. The change is audited, and a rejected unchanged item is not silently reattached on replay.
- **A9.** Duplicate Graph delivery, repeated chase emails and processing retry remain distinct in the right places: the same message id/replay is idempotent, while a genuinely later chase is a new email that may reference the same cases. One source attachment is archived once and referenced safely from each linked case.
- **A10.** Automated coverage uses both singular and both multi samples plus duplicate rows, mixed matched/unmatched/ambiguous items, provider conflicts, staff correction and retries; signed-in proof uses genuine operator-designated chases and shows one canonical email on every intended existing case with no unintended case creation. Unavailable live shapes remain PENDING.

## Validation
- **Offline:** add item-parser fixtures, association data-model constraints, per-item decision tables, partial-success API tests, audit/override/idempotency tests and SPA list/detail/case-history coverage. Prove source bytes and archive work are canonical, not multiplied per link.
- **Signed-in/live:** use naturally occurring/operator-designated real case matches for one singular and one multi-case chase. With an assigned staff account, open the inbox and every linked case, then inspect Postgres/audit/archive identity to prove one email, the expected association count and explicit partial ambiguity. Do not create cases solely for proof.
- **Regression:** rerun one-case auto-attach, case-link evidence backfill, QDOS wrong-link prevention, Provider chase classification, global search and email-history suites. No production case is created or relinked for proof.

## Research
Distilled 2026-07-13 from the [operator note and four original emails](./evidence/). A many-to-many association is preferred over physical duplication because it preserves the message and evidence identity.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
- [Singular sample](./evidence-manifest.json)
- [Second singular sample](./evidence-manifest.json)
- [Multi-case sample](./evidence-manifest.json)
- [Second multi-case sample](./evidence-manifest.json)
