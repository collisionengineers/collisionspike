---
id: TKT-269
title: Widen the vendored parser to cross-language behavioural parity
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-267, TKT-268]
research-link: docs/tickets/backlog/TKT-269-vendored-parser-cross-language-parity-guard/evidence/distillation-note.md
plan: PLAN-011
---

# Widen the vendored parser to cross-language behavioural parity

## Problem
The vendored parser engine re-expresses VRM, case-type, and EVA-field rules that `@cs/domain` owns in
TypeScript, and the two are **not** identical (the Python VRM canonicaliser carries a special-case regex the
TypeScript one lacks). The existing in-sync guards pin the engine against its *authoring repository* and the
EVA schema against `contracts/`, but nothing pins the parser's rule *behaviour* against `@cs/domain` — so the
two sources of truth can drift silently.

## Evidence
Verified read-only 2026-07-19: `services/functions/parser/cedocumentmapper_v2` re-implements VRM
canonicalisation (`normalization/normalizers.py::normalize_vrm`, with an extra-digit special case), case-type
markers (`detection/case_type.py`, the same `AP.`/`A.`/`D.` taxonomy as `@cs/domain`'s `case-type.ts`), and the
EVA field rules. The guards `test_engine_vendored_in_sync.py` (SHA-256/AST engine pin vs the authoring repo)
and `test_schema_vendored_in_sync.py` (EVA schema vs `contracts/`) exist but check implementation identity and
schema shape — not cross-language behavioural parity against `@cs/domain`. ADR-0018 keeps the parser vendored.

## Proposed change
Add a cross-language **behavioural** parity guard that runs the same fixture corpus through the vendored
parser's VRM / case-type / EVA-field rules and through `@cs/domain`'s equivalents, asserting the normalized
outputs match. Pin outputs, not internals, so legitimate refactors on either side are allowed but a rule
divergence (such as the known VRM special case) is caught. Keep the existing engine-in-sync and schema-in-sync
guards; this widens coverage, it does not replace them or touch the vendor-lock mechanism.

## Acceptance
- **A1.** A cross-language parity guard exists that compares the vendored parser's normalized VRM, case-type,
  and EVA-field outputs against `@cs/domain`'s on a shared fixture corpus.
- **A2.** The guard pins observable outputs (normalized results), not implementation, and documents the known
  VRM special-case divergence as either reconciled or an explicitly-approved allowed difference.
- **A3.** A synthetic divergence (change a VRM or case-type rule on one side only) is caught by the guard.
- **A4.** The existing `*_vendored_in_sync` guards and the vendor-lock mechanism (ADR-0018) are unchanged; the
  new guard runs under `verify-all.mjs`.
- **A5.** No live write.

## Validation
- Run the parity guard over the fixture corpus (expect pass or an approved-difference record) and over a
  synthetic one-sided rule change (expect fail); confirm `verify-all.mjs` invokes it; existing in-sync guards
  still pass.

## Research
Distilled from `05-python-doctrine-and-parity.md` ticket 3 (finding H); the rule overlaps, the non-identical
VRM canonicalisers, the two existing in-sync guards, and ADR-0018 were re-verified read-only on 2026-07-19
(`PLAN-011.dossier`). This is PLAN-011's terminal anti-drift guard; PLAN-012 generalises the parity-guard
doctrine.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
