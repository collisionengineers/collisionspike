# ADR-0022 — Retroactive reconstruction uses a conservative ladder

**Status:** Accepted (2026-07-04).

## Decision

For eligible unmatched billing, update, cancellation, or query mail with at least one usable key, attempt
this best-effort ladder after normal intake:

1. link to exactly one existing Case of any status;
2. search approved read-only Archive roots and, on one unambiguous case folder, recover the original
   instruction/evidence;
3. search the approved mailboxes for the original instruction;
4. create a held minimal anchor only when an authoritative Archive folder establishes the Case/PO;
5. otherwise record failure and leave the triage item untouched.

Keys are considered strongest-first: Case/PO when genuinely present, provider-scoped external reference,
then VRM. Name-only mail is ineligible. An ambiguous normal-link result never invokes reconstruction.

The Case/PO is discovered from authoritative material and never minted by this path. Read-only Archive
roots can never receive a write. Every rung is gated, idempotent, and failure-isolated from primary intake.

## Consequences

Reconstruction uses the normal parser and case-creation contracts, preserves the trigger email as a
separate linked source, and marks provenance as retroactive. Partial results remain held for staff.

## Amendment — 2026-07-16 (TKT-119 recorded; TKT-219 accepted)

**Eligibility.** Beyond the four trigger categories, an acknowledgement (TKT-119) and an
`other`-classified email (TKT-219) may trigger the ladder LOCATE-ONLY: they may link or reconstruct a
found original, but the create seam refuses any located original classified `non_actionable`, `other`,
`pre_instruction`, or `website_enquiry` as the case anchor — such mail never opens a case from any
path. Search keys widen to a claimant name (unambiguous body match only), and a junk-key guard rejects
sniffed date/money/model-code artifacts before any search.

**Ladder shape.** Rungs 2 and 3 now run CONCURRENTLY and their findings combine: parseable Archive
material wins; an Archive folder with nothing parseable plus a corroborated mailbox original becomes a
COMBINED reconstruction (mailbox material + Archive identity) instead of a data-empty anchor; the
minimal anchor remains the fallback and still requires the authoritative Archive folder. A refused
original falls back to the other source's finding before the failure record.

**Case/PO adoption.** "The Case/PO is discovered … and never minted by this path" holds for
production behind `RETRO_ADOPT_ARCHIVE_PO_ENABLED`. While the gate is off (dev/test — sequences are
not aligned to live), the discovered folder name is recorded as the case reference only and the normal
allocator mints; identity is then never treated as verified, so no reconstruction lands terminal. The
production flip belongs to the cutover runbook (TKT-178) and requires the TKT-004 floors first.

**Mailbox search semantics (verified against Microsoft Learn, 2026-07-16).** `$search` on messages
returns up to 1,000 SENT-date-sorted results (default page 10, no `$orderby`); the rung pages deeply
and logs truncation. Whole-mailbox `$search` includes Deleted Items. It matches attachment NAMES only —
a reference living solely inside an attachment is unreachable by rung 3; the Archive rung or staff
triage is the recovery for those.

**Related correspondence (operator directive 2026-07-16 — TKT-222).** Reconstructing the original
instruction is not the whole job: EVERY related email the mailbox search surfaces for the case's keys
(replies, chasers, our own sent responses, later updates) must be LINKED to the reconstructed case —
bounded, corroborated per message, never re-pointing an email already linked elsewhere, and recorded
as retro-provenance links. The reconstruction itself stays anchored on the original instruction.
