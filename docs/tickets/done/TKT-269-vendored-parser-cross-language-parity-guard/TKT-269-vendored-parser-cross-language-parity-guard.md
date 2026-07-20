---
id: TKT-269
title: Guard independently duplicated parser and domain rules
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-267, TKT-268]
research-link: docs/tickets/done/TKT-269-vendored-parser-cross-language-parity-guard/evidence/distillation-note.md
plan: PLAN-011
---

# Guard independently duplicated parser and domain rules

## Problem
The vendored parser independently implements VRM canonicalisation and Case/PO-marker recognition that also
exist in `@cs/domain`, and the implementations are not identical. The existing in-sync guards pin the engine
against its authoring repository and the EVA schema against `contracts/`, but no behavioural guard compares
the genuinely duplicated Python and TypeScript rules.

## Evidence
Direct inspection confirms two independent seams: Python `normalize_vrm` versus TypeScript
`canonicalizeVrm`, and Python `marker_for_reference` / `case_type_for_reference` versus TypeScript
`parseCasePoMarker` / `markerToCaseType`. By contrast, TypeScript `decideCaseType` consumes the parser result
and `buildEvaPayload` projects already-normalized values, so neither is an independent Python-normalizer
counterpart. The existing engine and EVA-schema in-sync guards remain authoritative for their own boundaries.

## Proposed change
Add a cross-language **behavioural** parity guard that runs shared fixtures through the independent VRM and
Case/PO-marker implementations and compares normalized outputs. Reconcile each current difference or record
an explicitly approved fixture-level allowance. Keep the existing engine-in-sync and EVA-schema-in-sync
guards; do not invent an EVA-normalization comparison where TypeScript has no independent implementation.

## Acceptance
- **A1.** A cross-language parity guard compares Python and TypeScript VRM canonicalisation and Case/PO-marker
  recognition on a shared fixture corpus, naming the exact callable on each side.
- **A2.** The guard pins observable outputs (normalized results), not implementation, and documents the known
  VRM special-case divergence as either reconciled or an explicitly-approved allowed difference.
- **A3.** Synthetic one-sided VRM and marker-rule divergences are each caught by separate negative fixtures.
- **A4.** The existing `*_vendored_in_sync` guards and the vendor-lock mechanism (ADR-0018) are unchanged; the
  new guard runs under `verify-all.mjs`.
- **A5.** EVA coverage remains the existing schema/export contract guard; no tautological comparison against
  `buildEvaPayload` or `decideCaseType` is accepted as cross-language normalization proof.
- **A6.** No live write.

## Validation
- Run the parity guard over the shared fixtures and the separate VRM/marker negative fixtures; confirm
  `verify-all.mjs` invokes it and the existing engine/schema in-sync guards still pass.

## Research
Distilled from `workingspace/architecture-simplification/05-python-doctrine-and-parity.md` ticket 3
(finding H). The independent callables, current differences, existing in-sync guards, and ADR-0018 were
re-verified directly against the committed paths named in the distillation note.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
