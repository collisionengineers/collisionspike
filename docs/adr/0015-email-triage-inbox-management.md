# ADR-0015 — Every approved-mailbox message enters deterministic triage

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md); staged split in [ADR-0019](./0019-triage-policy-stage-split.md).

## Decision

Preserve and classify every new message in the approved intake mailboxes before choosing a case action.
Classification is deterministic first. AI may suggest a category only through a separately approved,
audited capability. Mail with no attachment remains visible. Spam and unknown mail land in a reviewable
lane rather than being discarded before classification.

The category and subtype vocabulary is **not enumerated here** — a fixed list in this ADR is exactly how
it went stale. The vocabulary lives in the classification code and its evaluation corpus; the named
taxonomy corpus in `emailevals/` is the authority for what each label means (TKT-244). Stable numeric
category/subtype values are **append-only** compatibility contracts: a value, once assigned, is never
renumbered or reused.

The triage record stores immutable message identity, mailbox, timestamps, classifier version, extracted
signals, category/subtype, confidence/reasons, proposed action, Case link, and audit outcome.

## Change path

New labels are added append-only, and adoption of a label as a decision does not wait for corpus volume —
corpus-count gating is an implementation constraint on when the classifier may *emit* a label, not on
whether the label exists. Adopted 2026-07-16 as append-only additions: the **post_report family**,
**payment_received**, and **autoreply / out-of-office / undeliverable**.

## Rationale

Deterministic-first triage keeps every message accounted for and every classification explainable.
Keeping the vocabulary in code and corpus, with this ADR owning only the rules of change, stops the
decision record drifting from the live system.

## Consequences

Receiving work may mint a Case; updates attach only under the correlation rules; cancellations require
staff confirmation; queries and other mail remain manageable without creating blank Cases. Signals,
policy, and suggestions stay separated per [ADR-0019](./0019-triage-policy-stage-split.md). The intake
workflow view is described in [intake workflow](../product/intake-workflow.md).
