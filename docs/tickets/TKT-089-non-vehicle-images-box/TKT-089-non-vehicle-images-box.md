---
id: TKT-089
title: Confirm non-vehicle images (signatures/logos) are no longer captured or stored on Box
status: backlog
priority: P2
area: evidence
tickets-it-relates-to: [TKT-047, TKT-002, TKT-090]
research-link: docs/tickets/TKT-089-non-vehicle-images-box/evidence/operator-note.md
---

# Confirm non-vehicle images (signatures/logos) are no longer captured or stored on Box

## Problem

Operator: "Need to confirm non-vehicle images such as signatures are no longer being
captured/stored on box." TKT-047 deployed a non-inline raster floor on the orchestration app
(2026-07-02) for **email signature attachments** — but its own live proof is still pending, and
the dropped screenshot shows a **second lane it never covered**: images extracted from *PDF
documents* — provider letterhead/logo crops (a QDOS Assistance logo, an "Association"/MGA
banner, from `LtrtoEngineerIn__RJS_UnknownVRM_img_1_1/2`) — sitting in a case's evidence list as
classifiable images. Non-vehicle images pollute the evidence view, the Box archive, and the EVA
photo-selection flow.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/letterhead-logos-as-evidence.png` — PDF-extracted letterhead/logo images shown as
  case evidence (same case as TKT-090's filename bug — the two share a source document).
- [TKT-047](../TKT-047-email-sigs-box/TKT-047-email-sigs-box.md) — the email-attachment raster
  floor, deployed but awaiting live proof.
- PDF image extraction: TKT-002 lane (parser/vendored engine, ADR-0018 dual-home).

## Proposed change

PROPOSED (not built):

- **Audit (the operator's actual ask)**: sweep recent live cases' evidence rows + Box case
  folders for signature/logo-shaped images arriving after the TKT-047 deploy; classify each as
  email-attachment lane (TKT-047 regression?) or PDF-extraction lane (uncovered).
- **PDF lane filter**: in the sibling engine, suppress letterhead/logo crops from document image
  extraction (e.g. page-region + dimensions + aspect heuristics, mirroring the raster-floor
  approach) with fixtures on the dropped sample's source PDF class.
- **Backfill decision**: list existing non-vehicle evidence images and put the delete/keep
  decision to the operator (Box delete is ACK-only per ADR-0017 — removal may be
  evidence-row-only).

## Acceptance

- [ ] A written audit exists: counts of non-vehicle images captured after the TKT-047 deploy,
      split by lane (email attachment vs PDF extraction).
- [ ] Email lane: zero post-deploy signature captures (closing TKT-047's live proof), or the
      regression is fixed.
- [ ] PDF lane: the sample document re-parses with letterhead/logo crops suppressed while real
      vehicle photos still extract (fixtures in the sibling suite).
- [ ] The backfill decision for existing non-vehicle images is recorded and executed (audited).

## Verification requirements (proof standard — all classes required before `done`)

1. **Data audit** — the Postgres/Box sweep queries + results recorded in
   [verification.md](./verification.md).
2. **Offline tests** — sibling fixtures proving logo suppression + vehicle-photo retention;
   suite green; re-vendor recorded.
3. **Gate + deploy** — `node verify-all.mjs` green; parser/orch deploys recorded in
   [changes.md](./changes.md).
4. **Live probe** — a live re-parse (or fresh intake) of a letterhead-bearing document yields no
   logo evidence rows and no logo files in the Box case folder.
5. **Recall guard** — a genuine vehicle-photo email/PDF still lands its images in evidence + Box.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/non-vehicle-images/`; raw
material in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
