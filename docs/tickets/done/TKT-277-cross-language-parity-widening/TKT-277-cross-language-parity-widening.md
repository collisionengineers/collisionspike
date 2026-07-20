---
id: TKT-277
title: Widen cross-language parity coverage and reconcile the evidence-kind MIME divergence
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-270, TKT-269]
research-link: docs/tickets/done/TKT-270-hardcore-repository-drift-audit/evidence/audit-report-2026-07-20.md
---

# Widen cross-language parity coverage and reconcile the evidence-kind MIME divergence

## Problem
The TKT-270 audit found five Python↔TypeScript rule mirrors beyond the VRM/Case-PO-marker pair TKT-269's
parity guard covers — one of which (evidence-kind MIME fallback) **already diverges**. None is behind a guard,
so a one-sided edit silently splits behaviour.

## Evidence (TKT-270 findings C1–C5)
- **C1** delivered-images-only predicate: `parser email_classifier._delivered_images_only` ↔
  `orchestration triagePolicy.deliveredImagesOnly` (identical regexes today, no guard).
- **C2** third VRM canonicaliser `vehicle-enrichment canonicalize_registration` mirrors `@cs/domain
  canonicalizeVrm`, outside the parity guard.
- **C3** evidence-kind MIME fallback **diverges**: `box-webhook classify_evidence_kind` uses `image/*` wildcard;
  `@cs/domain classifyAttachment` uses an explicit `{jpeg,jpg,png}` table — different class for
  `image/tiff|heic|webp|gif|bmp`. The "mirrors EXACTLY" docstring is wrong.
- **C4** EVA 12-field **format** validation: `eva-sentry payload.validate_core_payload` imperatively reimplements
  the AJV schema patterns/enums/oneOf; only the key list is cross-checked today.
- **C5** Case/PO token-shape `parser CASEREF_RE` ↔ `@cs/domain CASE_PO_SHAPE_RE` (documented mirror, no guard).

## Proposed change
- Extend the parser-domain parity corpus (`scripts/checks/parser-domain-parity-vectors.json`) with Case/PO
  token-shape (C5) and `canonicalize_registration` (C2) vectors, run through the respective callables.
- Add a shared classify-attachment corpus run through `classify_evidence_kind` and `classifyAttachment`, and
  **reconcile C3** (widen the domain table to a wildcard or narrow the Python fallback) + fix the docstring.
- Add an images-only-delivery parity check across `_delivered_images_only`/`deliveredImagesOnly` (C1).
- Extend the EVA schema parity test to assert `validate_core_payload`'s format rules against
  `contracts/eva-payload.schema.json` (or generate the validator from the schema) (C4).
- Do not touch the ADR-0018 vendor-lock or invent a tautological EVA-normalisation comparison.

## Acceptance
- Each of C1, C2, C4, C5 has a behavioural parity guard on shared fixtures (agreement or explicitly-approved
  allowed divergence). C3 is reconciled to one behaviour and pinned.
- Negative fixtures catch a one-sided edit to each rule; the guards run under `verify-all.mjs`.
- The existing engine/schema in-sync guards and the parser-parity guard still pass. No live write.

## Research
Distilled from the TKT-270 audit report (2026-07-20), findings C1–C5.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
