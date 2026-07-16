---
id: TKT-162
title: Nest QDOS audit work inside the standard case archive folder
status: backlog
priority: P1
area: box
tickets-it-relates-to: [TKT-003, TKT-056, TKT-057]
research-link: docs/tickets/backlog/TKT-162-nested-audit-archive/evidence/operator-note.md
plan: PLAN-004
---

# Nest QDOS audit work inside the standard case archive folder

## Problem
Some QDOS instructions require both the normal report and a separate audit report. The audit work needs its own child folder, but that folder must sit beneath the ordinary Case/PO folder rather than creating a competing case structure or sequence.

## Evidence
- [Operator note](./evidence/operator-note.md) — summary of the supplied audit sample and requested archive shape.
- [Source note](./evidence/source-evidence/audit-organization.md), [sample email](./evidence-manifest.json), and [sample document](./evidence-manifest.json) — preserved distillation inputs.
- The preserved sample contains one instruction/report document and five vehicle images for a dual report-and-audit case.
- TKT-056 detects the audit requirement but does not define the nested archive ownership model.

## Proposed change
PROPOSED (not built): retain the normal QDOS Case/PO folder as the canonical parent and create one deterministic audit child folder for audit-specific outputs.

## Acceptance
- A dual report-and-audit instruction remains one case and one provider Case/PO sequence; it is not split into two cases.
- The standard QDOS Case/PO folder is the canonical parent. A deterministic child named `A.<Case/PO>` is created beneath it for audit-specific work.
- Folder creation and lookup are idempotent and use persisted folder IDs; retries never create parallel parent or audit folders.
- The original instruction, ordinary report evidence and ordinary case images remain in the canonical parent according to the existing archive contract; only audit-specific outputs are routed to the audit child.
- The case page presents the archive links in plain handler language and makes the relationship between the case folder and audit folder clear without implementation terminology.
- Case/PO correction, folder rename or safe move updates/adopts the parent and child relationship without allocating a second sequence or losing persisted IDs.
- Ordinary QDOS cases and other providers are unchanged and never receive an audit child without an explicit audit requirement.
- Existing affected cases can be backfilled idempotently, with conflicts or ambiguous existing folders held for review rather than guessed.
- Tests cover first creation, retry, existing parent, existing child, wrong-parent collision, Case/PO correction, ordinary QDOS and non-QDOS cases.
- Live Box proof creates and mutates folders only beneath test root `392761581105` and records the final hierarchy and persisted IDs.

## Research
Distilled 2026-07-12 from the supplied audit note and source files. Text notes remain here and source
bytes resolve through [the evidence manifest](./evidence-manifest.json).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Source note](./evidence/source-evidence/audit-organization.md)
- [Sample email](./evidence-manifest.json)
- [Sample document](./evidence-manifest.json)
