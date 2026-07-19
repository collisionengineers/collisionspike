---
id: TKT-260
title: Extend the shared forbidden-signatures data file
status: backlog
priority: P3
area: platform
tickets-it-relates-to: [TKT-207, TKT-261]
research-link: docs/tickets/backlog/TKT-260-shared-forbidden-signatures-data-file/evidence/distillation-note.md
plan: PLAN-010
---

# Extend the shared forbidden-signatures data file

## Problem
Several detectors reinvent "detect secret- or vocabulary-shaped strings." Sharing code across the
TypeScript/PowerShell/Python split is impossible, so the draft proposed one data file for all four — but the
four detectors use incompatible pattern shapes, so a full unification would force mismatched formats together.

## Evidence
Verified read-only 2026-07-19: `forbidden-signatures.json` is **already** an externalised, cross-language data
file — a versioned hashed-signature set consumed by both `hashed-signature-matcher.mjs` (Node) and
`check-binary-content.py` (Python), which each re-implement the same fnv1a32 + sha256 algorithm. By contrast
`pii-scrub` (UK-PII regexes, runtime redaction) and the cloud-inventory redact sweep (secret-shape regexes,
snapshot scan) use regex patterns that the hashed-exact-literal format structurally cannot represent.

## Proposed change
Treat `forbidden-signatures.json` as the single shared vocabulary data file it already is; extend it where the
hashed-signature detectors need new entries, and document the one genuinely unavoidable duplication — the
JS/Python re-implementation of the matcher algorithm — rather than merging it. Leave `pii-scrub` and the
redact sweep with their own pattern shapes (different concerns, incompatible formats); do not force a four-way
unification.

## Acceptance
- **A1.** `forbidden-signatures.json` is confirmed as the single shared vocabulary source for the Node and
  Python hashed-signature detectors; any new hashed signatures are added there, not duplicated in code.
- **A2.** The unavoidable JS↔Python matcher-algorithm duplication is documented (a short note co-located with
  the matchers) with a pointer to keep the two in sync.
- **A3.** `pii-scrub` and the cloud-inventory redact sweep are left with their own pattern shapes; no
  four-way unification is attempted, and the reasoning is recorded.
- **A4.** No plaintext secret or forbidden term is added to any tracked file (the signature format stays
  hashed).
- **A5.** No live write.

## Validation
- `check:forbidden` and `check:binary-content` pass against the shared data file; confirm no new plaintext
  signatures land; full `node verify-all.mjs`.

## Research
Distilled from `04-scripts-and-tooling-dedup.md` item 4 (finding I), softened after read-only verification on
2026-07-19 (`PLAN-010.dossier`): the shared cross-language data file already exists; the modest real
improvement is to extend it, not to unify four incompatible detectors. Gated on full PLAN-006 close-out.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
