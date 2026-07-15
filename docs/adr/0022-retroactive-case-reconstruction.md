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
