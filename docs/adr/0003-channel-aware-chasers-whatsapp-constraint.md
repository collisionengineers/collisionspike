# ADR-0003 — Chasers are channel-aware

**Status:** Accepted (2026-06-17).

## Decision

Chasers are assisted, tracked requests for missing case information. Email may be drafted and sent through
the approved mail path. WhatsApp Business chasers are drafted for a staff member to send manually.
Audatex sources are await-only unless a separately accepted integration changes that boundary. Staff can
always add free-text Notes alongside structured chasers.

## Rationale

The business uses the WhatsApp Business app and does not expose a programmatic send path. Pretending the
system can send would create false completion and an unaudited communication gap.

## Consequences

The Case records channel, recipient, draft, staff disposition, and timestamps. UI copy distinguishes a
prepared message from one actually sent. The receipt channels images arrive through are catalogued in
[ADR-0007](./0007-receipt-of-images.md).
