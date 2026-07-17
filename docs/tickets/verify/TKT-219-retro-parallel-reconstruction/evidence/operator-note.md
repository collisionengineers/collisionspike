# Operator directives — retro reconstruction (2026-07-16)

Recorded from the operator's working session on TKT-119/retro (verbatim intent, lightly edited for
spelling):

1. "Outlook + Box should run simultaneously then both findings combined to try and reconstitute
   [the] case rather than one then the other."
2. "If email is classed as other: should attempt retro." Follow-up decision (same session): scope
   confirmed as **locate-only** — an `other` email may link or reconstruct a found original but
   must never anchor a case on itself (the acknowledgement pattern).
3. "For Box: we should be able to search by: VRM, claimant name, external ref, possibly other
   details. The Case/PO number is irrelevant to our search as we wouldn't have one."
4. "The plan assumes we would mint the case after the Box folder's name. This is technically
   correct — on the live system, we would do this. For dev/test purposes since Case/PO alignment
   is not true to live, we will mint as per our normal process. It needs to be documented in the
   cutover guide what code needs changing to ensure retro creation just takes the Box folder's
   actual name and mints that as the Case/PO (after cutover, all our newly minted Case/POs would
   be ahead of that, therefore no conflict)."
5. "Does Graph search need a limit?" — resolved in the investigation: yes, bounded paging
   (≤1,000 documented cap, sent-date-sorted, no `$orderby` with `$search`).
6. "Determine potential costing … as cost concern raised in plan for dual search." — resolved:
   monetary delta ≈ $0; constraints are throttle shape (Graph 4-concurrent-per-mailbox, Box
   6 searches/sec on the CCG identity) and free-tier telemetry retention pressure.
7. "Confirm to light Box rung when done" — operator authorization (2026-07-16) to set
   `RETRO_BOX_ARCHIVE_ROOT_IDS` on cespk-orch-dev once this ticket's code is deployed, safe
   without floor seeding because dev-mint mode no longer adopts archive POs.

Context: the operator initially suspected TKT-119 counteracted the retro system by blocking
queries/acknowledgements from creating cases. The investigation (see
[investigation-2026-07-16.md](./investigation-2026-07-16.md)) found the opposite — TKT-119 widened
triggering — and the directives above extend retro's reach further.
