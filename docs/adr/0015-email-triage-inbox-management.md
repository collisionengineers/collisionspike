# ADR-0015 — Every approved-mailbox message enters deterministic triage

**Status:** Accepted (decision proposed 2026-06-24; current path implemented).

## Decision

Preserve and classify every new message in the approved intake mailboxes before choosing a case action.
The top-level categories are receiving work, query, case update, cancellation, billing, non-actionable,
and other. Subtypes may refine routing but never cause silent deletion.

Classification is deterministic first. AI may suggest a category only through a separately approved,
audited capability. Mail with no attachment remains visible. Spam and unknown mail land in a reviewable
lane rather than being discarded before classification.

The triage record stores immutable message identity, mailbox, timestamps, classifier version, extracted
signals, category/subtype, confidence/reasons, proposed action, Case link, and audit outcome.

## Consequences

Receiving work may mint a Case; updates attach only under the correlation rules; cancellations require
staff confirmation; queries and other mail remain manageable without creating blank Cases. Stable numeric
category/subtype values are append-only compatibility contracts.
