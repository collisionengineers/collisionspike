---
id: TKT-267
title: Decide and record the Python packaging doctrine
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-256, TKT-268, TKT-269]
research-link: docs/tickets/done/TKT-267-python-packaging-doctrine-decision/evidence/distillation-note.md
plan: PLAN-011
---

# Decide and record the Python packaging doctrine

## Problem
Several production clients across the independently packaged Python services own distinct bearer-token,
401-refresh, or transient-retry policies. Some service roots contain several implementations, while parser
and OCR do not implement the variants that prompted this plan. Whether runtime duplication is a deliberate
consequence of `services/functions/README.md`'s packaging doctrine or should be reversed is unrecorded.

## Evidence
Direct inspection of the committed clients shows deliberately different mechanisms: Box JWT assertion,
Entra client credentials, managed identity, EVA's credential form, and API-key callers. Cache, refresh, and
429/5xx handling also differ per client. The exact reproducible inventory is recorded in the
[distillation note](./evidence/distillation-note.md). `services/functions/README.md` states that each service
is independently packaged with its own contract, tests, requirements, and deployment inputs.

## Proposed change
After PLAN-009's TKT-256 files its helper-app consolidation assessment, decide whether to affirm or reverse
the "independently packaged" doctrine and record the reasoning in a new ADR whose number is allocated at
authoring. **Recommended default: affirm independence** and convert the duplication into a checked,
test-only behavioural contract (TKT-268). If TKT-256 recommends collapsing the apps, the sharing calculus
changes and a shared runtime module may become worthwhile.

## Acceptance
- **A1.** A new ADR records the packaging doctrine (affirm independence, or reverse to a shared module) with
  the reasoning, authored at the next free ADR number (not pre-assigned).
- **A2.** The decision explicitly cites PLAN-009's TKT-256 assessment as an input and states how its outcome
  affected the call.
- **A3.** The decision names the follow-on mechanism (TKT-268's behavioural conformance suite on the affirm
  path, or the shared module on the reverse path) and the parity widening (TKT-269).
- **A4.** `services/functions/README.md` is reconciled with the recorded decision (its doctrine line either
  reaffirmed with a pointer to the ADR, or updated).
- **A5.** No live write; no runtime behaviour change in this ticket (decision + ADR only).

## Validation
- The ADR exists, is dated/Accepted, and is linked from the README and the affected services; `check:docs`
  passes.

## Research
Distilled from `workingspace/architecture-simplification/05-python-doctrine-and-parity.md` ticket 1.
The packaging line and client inventory were re-verified directly against the committed paths named in the
distillation note. Deliberately last — consumes PLAN-009's TKT-256.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
