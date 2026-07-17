---
id: TKT-244
title: Add the adopted triage vocabulary labels to the classifier
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-188, TKT-184, TKT-186]
research-link: docs/reviews/160726/decisions.md
---

# Add the adopted triage vocabulary labels to the classifier

## Problem

Review 160726 adopted three vocabulary additions as append-only decisions — the post_report family,
payment_received, and autoreply/out-of-office/undeliverable — but the classifier does not yet emit
them, and the named-taxonomy authority of the `emailevals/` corpus is not recorded in the evaluation
docs (D15; ADR-0015 rewrite 2026-07-16).

## Evidence

- [Review 160726 decision D15](../../../reviews/160726/decisions.md).
- ADR-0015 — Change path (adopted additions by name; corpus-count gating is an implementation
  constraint, not a decision gate).

## Proposed change

PROPOSED (not built):

- Add the adopted labels with new append-only numeric values; never renumber or reuse existing
  values.
- Emit each label only once its corpus support meets the gating constraint; until then the label
  exists with its value reserved.
- Record `emailevals/` as the named-taxonomy authority in the evaluation corpus docs.
- Behavioural handling of the new labels stays with its owners (TKT-188 report amendments, TKT-184
  out-of-office, TKT-186 provider update chase).

## Acceptance

- The numeric vocabulary contains the adopted labels append-only; snapshot tests prove existing
  values unchanged.
- Classifier evaluation passes with the gating constraint respected, and the taxonomy authority is
  documented.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (D15).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
