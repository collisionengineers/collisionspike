---
id: TKT-064
title: Auto-classify evidence images — role (overview/damage) + registration visible
status: backlog
priority: P2
area: pipeline
tickets-it-relates-to: [TKT-016, TKT-048, TKT-002]
research-link: docs/adr/0009-image-ai-ocr-m1-classification-m2.md
---

# Auto-classify evidence images — role (overview/damage) + registration visible

## Problem

On a case's **Evidence** tab every image's **Role** dropdown reads **`Unclassified`** and the
`Reg ✓ / No reg` badge is unset (operator-reported 2026-07-05 on case 85fedca4). Nothing decides
whether an image is a **vehicle overview** (full number plate visible), a **main-damage close-up**,
or neither — the two roles the EVA image rules require (`≥2 images incl. one overview with a visible
registration + one damage_closeup`, mirrored from `collisioncc` `image-rules.ts`). So the readiness
panel correctly says *"no overview with a visible registration; no main-damage close-up"* for almost
every case, and staff must open each photo and set the role by hand.

Two distinct gaps, both real:

1. **Image role (overview / damage_closeup / …) is not computed at all — by design, deferred to M2.**
   `orchestration/src/functions/activities/extractImages.ts:126` hard-codes
   `imageRoleCode: 'unknown'` with the comment *"role tagging is M2 (ADR-0009); default unknown"*.
   There is no classifier anywhere in the pipeline; the Data-API seam accepts an `imageRoleCode`
   (`orchestration/src/lib/data-api.ts:417`) but no producer ever sets a real value.

2. **Registration-visible OCR runs on too narrow a slice.** `PLATE_OCR_ENABLED=true` and
   `callPlateOcr` sets `registration_visible`, but **only inside `extractImages`** — i.e. only for
   images **extracted from a PDF** (gated on `pdfMapper()`). Images that arrive as direct email
   attachments, WhatsApp media, or Box uploads never pass through `extractImages` (they have no
   local blob — see [[TKT-048]], ~39 % of evidence is Box-only), so `registration_visible` stays
   null for them. On case 85fedca4 every image is Box-only → OCR never ran on any of them.

Consequence: the EVA-readiness gate can essentially never be satisfied automatically, and the
image-ordering / two-preview rules (overview first, then damage) have nothing to order by.

## Change (proposal — scope to confirm with operator)

A vision-classification pass over evidence images, producing `imageRoleCode` + `registrationVisible`:

- **Role classifier.** Send the image bytes to a vision model (the existing keyless AOAI `gpt-5`
  multimodal deployment — same one the [[TKT-060]] chat + email triage use) with a constrained
  prompt → one of `overview` / `damage_closeup` / `interior` / `document` / `other`. Persist via the
  existing `imageRoleCode` seam. Gate it (`IMAGE_ROLE_CLASSIFY_ENABLED`, default off); cost + latency
  budget at intake concurrency 1 is small but must be measured.
- **Registration OCR on ALL images, not just PDF-extracted.** Now that
  `GET /api/evidence/{id}/content` ([[TKT-048]]) can fetch **any** image's bytes (blob **or** Box),
  run plate-OCR on direct-attachment / Box / WhatsApp images too — either a new evidence-level
  activity or an on-demand/backfill endpoint keyed by evidence id.
- **Backfill.** A one-shot job to classify the existing ~1,592 image-blob + Box images so live cases
  benefit, not just new intake (mirror the retro/backfill driver pattern).
- **Human-in-the-loop stays.** Auto-classification is a *suggestion* — staff can still override the
  role dropdown / exclude toggle; never auto-accept into the EVA set without the human check.

Supersedes the "role tagging is M2" deferral in
[ADR-0009](../../adr/0009-image-ai-ocr-m1-classification-m2.md); pairs with the AI image-analysis tooling in
[[TKT-016]] and needs the now-shipped preview byte-path from [[TKT-048]].

## Acceptance

- [ ] New-intake images get a real `imageRoleCode` (not `unknown`) from the classifier when the gate
      is on; the role dropdown reflects it.
- [ ] `registration_visible` is set for images regardless of source (direct attachment / Box / WhatsApp),
      not only PDF-extracted ones.
- [ ] A backfill pass classifies existing evidence; a case that genuinely has an overview-with-reg + a
      damage close-up flips its readiness `Images` check to green without manual role-setting.
- [ ] Classification is gated (default off), audited, and cost/latency measured at intake concurrency.
- [ ] Staff can still override any auto-assigned role / exclusion (no silent auto-accept into EVA).
