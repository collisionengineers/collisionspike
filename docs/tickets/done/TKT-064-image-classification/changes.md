# TKT-064 — changes (resolved 2026-07-06)

Resolved as the image-classification pillar of the "backfill / reverify all active cases" pass.
Live counts live in the registry ([LIVE_FACTS.json](../../../../LIVE_FACTS.json) / its `verifiedBy` log) — not repeated here.

## What was built + run

- **gpt-5 vision classifier** against the existing `digital-3339-resource` AOAI deployment (no new
  model provisioning). One call per image returns `role` (overview / damage_closeup / additional /
  other), `registration_visible` + `plate_text`, and `person_reflection`. Validated against
  ground-truth images before scaling (roles, registration legibility, and photographer-reflection
  detection all correct).
- **One-shot backfill over existing evidence** (closes TKT-064 acceptance "backfill ~existing images"):
  - blob-backed images fetched via the `evidence` container (managed-identity read);
  - Box-only images fetched via the retained **box-webhook `GET /api/box/files/{id}/content`** facade
    (the TKT-048 byte path) — so registration/role now cover Box-only evidence too (closes gap 2).
  - Stamped `image_role_code` + `registration_visible`; **excluded** person-reflection images
    (`exclusion_reason`); marked non-vehicle `other` **not** `accepted_for_eva`; overview/damage/
    additional vehicle photos auto-accepted. Idempotent (only touched `image_role_code = unknown`).
- **Reverify**: recomputed `status_code` for the active set with the real `statusForReviewCase`
  logic (`packages/domain/src/contracts/case-status.ts:199-222`), moving the newly image-passing
  cases off the image gate.

## Outcome + honest limit

Image detection is fixed — a large slice of active cases now clear the EVA image rule (from zero).
But **no case reached `ready_for_eva`**: the required-field gate (dominated by empty
`inspection_address`, then `accident_circumstances`) is now the blocker. That is data-entry /
inspection-address-corpus work, not image classification.

## Live pipeline — DONE (deployed 2026-07-06)

`services/orchestration/src/platform/image-classify.ts` (gpt-5-vision, reusing `aoai.ts`'s managed-identity
`mintCognitiveToken`) is wired into **`extractImages`** (PDF-embedded images) and
**`classifyPersist`** (direct email attachments) behind the new default-off
`IMAGE_ROLE_CLASSIFY_ENABLED` gate, and the orchestration app was rebuilt + republished with the
gate **on**. So **new** intake images now auto-classify. Never-throws — a classify failure falls
back to role `unknown`, intake is never blocked. No API/RBAC change was needed (the evidence route
already persists the fields; the orch MI already holds the AOAI role).

## NOT done (follow-ups)

- The **box-webhook** (Box-upload) live-classify path — a separate Python-function deploy.
- Retry the ~1% blob + ~6% Box images that errored in the backfill (unsupported MIME / box-fetch size caps).
- Human-in-the-loop role override in the review UI (TKT-064 acceptance item).
