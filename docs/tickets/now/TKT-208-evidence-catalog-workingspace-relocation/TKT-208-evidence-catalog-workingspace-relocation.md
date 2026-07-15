---
id: TKT-208
title: Catalog evidence and relocate workingspace without content changes
status: now
priority: P0
area: evidence
tickets-it-relates-to: [TKT-020, TKT-207, TKT-209, TKT-213, TKT-214]
research-link: docs/tickets/now/TKT-208-evidence-catalog-workingspace-relocation/evidence/operator-note.md
plan: PLAN-006
---

# Catalog evidence and relocate workingspace without content changes

## Problem
Evidence is distributed through documentation, ticket and test trees, while personal brainstorming files sit inside docs. Reorganization must make evidence discoverable without losing byte identity or logical context, and it must not edit the protected workingspace files.

## Evidence
The four protected files and planning-baseline SHA-256 values are:

| File | SHA-256 |
|---|---|
| aifirstplan.txt | 1e092f72364e78ba05aeaeae022e73ac83d89f76122e131fb17743ab03a3126c |
| model-evaluation-plan.md | 46e5795937fae4741b6fd7f778e1ffe1a7515ad39884a0128abb4e784fa4558d |
| proposedparserchanges.md | 768893ff9be0f8790f642336f77ec4ff4b33077994cbfae2c8c993534b3d2566 |
| smallmodels.md | f02a84860aa71ad4c3980a7634fe05d539895b642319ea15ee5814dcd97c6f1e |

## Proposed change
Create a content-addressed evidence catalog under /tests/fixtures/evidence/sha256 with logical-occurrence manifests under /tests/fixtures/manifests. Relocate docs/workingspace to /workingspace as one directory move and make no content, encoding, newline, filename or timestamp-normalization edit to its four files.

## Acceptance
- **A1.** The evidence catalog covers every retained email, image, document and evaluation artifact identified by TKT-207, recording SHA-256, byte length, detected type, original path, final content-addressed path and all ticket/case/evaluation relationships.
- **A2.** Content-addressed storage uses the complete SHA-256 as identity. Identical bytes may share one stored object only when manifests retain every original logical occurrence and relationship.
- **A3.** Each manifest is deterministic, schema-validated and links to an existing content object whose byte length and hash match. Missing objects, unreferenced objects, duplicate logical keys and hash/path disagreement fail validation.
- **A4.** Evidence moves preserve source bytes exactly. No render, extraction, line-ending rewrite, metadata rewrite or recompression substitutes for the original artifact.
- **A5.** docs/workingspace is moved only to /workingspace. The final directory contains exactly the four baseline filenames, each with the exact SHA-256 shown above, and no copy remains elsewhere.
- **A6.** Git history and the TKT-207 ledger record source-to-target moves; no supplied evidence or workingspace file is silently edited, discarded or split.
- **A7.** Documentation and tickets refer to logical manifest entries rather than unstable duplicate storage paths, and link checks resolve every retained reference.
- **A8.** Catalog and hash validation run offline and in CI without sending evidence to an external service or writing to a live system.

## Validation
- Hash every source before movement and every target after movement; compare exact sets.
- Validate manifests against the content-addressed object tree and sample one item of each artifact type plus every duplicate-hash group.
- Compare the four workingspace files byte-for-byte and confirm the source directory no longer exists.

## Research
Distilled from the operator's protected-workingspace instruction and evidence-preservation requirements.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
