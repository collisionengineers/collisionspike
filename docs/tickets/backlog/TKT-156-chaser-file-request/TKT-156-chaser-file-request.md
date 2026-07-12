---
id: TKT-156
title: Put an active archive upload link in every image chaser
status: backlog
priority: P1
area: box
tickets-it-relates-to: [TKT-023, TKT-061, TKT-111, TKT-148]
research-link: docs/tickets/backlog/TKT-156-chaser-file-request/evidence/operator-note.md
plan: PLAN-004
---

# Put an active archive upload link in every image chaser

## Problem
Chaser copy can include a link only when a Box File Request already exists, but the live template/copy lifecycle was left unfinished. Staff need every applicable image chaser to create or reuse a File Request for that Case/PO archive folder and include the resulting upload link in the copyable message.

## Evidence
- [Operator note](./evidence/operator-note.md) — chaser link requirement.
- TKT-061 — live Box/webhook path with the File Request template ID explicitly left as a remainder.
- TKT-111/TKT-148 — current chaser outbox/drafting and image-problem semantics.

## Proposed change
PROPOSED (not built): configure the template, make File Request creation/reuse an idempotent case-folder operation, persist its identity/link, and gate chaser readiness on a usable link.

## Acceptance
- An approved File Request template exists in Box test root `392761581105`; its ID is stored through the existing secret/config mechanism and documented in the live registry without exposing a credential.
- Creating or copying an image chaser for a case resolves the authoritative Case/PO Box folder and creates exactly one active File Request there when none exists.
- Retries, concurrent chasers and later chasers reuse the persisted active request/link rather than creating duplicates. An inactive/expired/deleted request is repaired or replaced with an audited reason.
- The copyable chaser message always includes the active HTTPS upload link and concise handler-approved wording; copying the message copies the link.
- The UI never shows a raw Box implementation name, template identifier, configuration key, or an apparently complete chaser whose upload link failed to provision.
- File Request creation failure leaves the chaser draft unsent/clearly incomplete and retryable; it does not silently send a linkless request for images.
- Uploading through the request triggers the existing Box webhook/evidence path, attaches the image to the correct case, classifies it, recomputes readiness and marks the relevant chaser response consistently.
- Request/folder identity is validated server-side and cannot target an arbitrary folder outside the case folder/test root.
- Tests cover first creation, duplicate/concurrent creation, reuse, inactive/expired repair, missing case folder, Box 4xx/5xx, message copy, webhook delivery and retry.
- Live proof in the designated test folder records template, copied request, message text/link, one real upload, resulting Box/evidence/classification/case state and zero writes outside the test root.

## Research
Distilled 2026-07-12 from the operator request and the explicit TKT-061 remainder.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
