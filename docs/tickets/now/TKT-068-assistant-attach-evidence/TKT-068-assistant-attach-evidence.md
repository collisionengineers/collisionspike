---
id: TKT-068
title: Let the assistant understand images and add them to a case
status: now
priority: P1
area: ai
tickets-it-relates-to: [TKT-060, TKT-066, TKT-048, TKT-003]
research-link: docs/tickets/now/TKT-068-assistant-attach-evidence/evidence-manifest.json
plan: PLAN-001
---

# Let the assistant understand images and add them to a case

## Problem

Handlers receive photos/documents out-of-band (WhatsApp, desk scans) and want to hand them to
the assistant — "add these to the YT13 UTV case" — but the assistant has no attach affordance
and, deliberately, no write capability (TKT-060 read-only invariant). There is also no general
authenticated evidence-upload endpoint on the Data API: today evidence lands only via the
intake pipeline.

## Evidence

- `evidence/operator-note.md` — plan § 3 (2026-07-06 planning session).
- `apps/web/src/features/assistant/AssistantDrawer.tsx` — no attach control; turns are text-only.
- `services/data-api/src/features/assistant/chat-routes.ts` — tools are SELECT-only; no write tool exists (by design).
- Evidence landing path: intake activities upload to Blob `cespkevidstdev01` and insert
  `case_evidence` + audit rows — the pattern this endpoint mirrors.

## Proposed change

PROPOSED (not built) — the **model never performs the write**; the write is an explicit,
user-confirmed SPA action:

- **Drawer attach button** (accepts images/PDF). Attachments are held client-side until explicit
  confirmation; when image understanding is needed, their original bytes are supplied to the configured
  multimodal assistant in their original order under the repository-data authority.
- **Target identification** stays conversational: the assistant resolves the case via
  `lookup_case` (fixed by TKT-066); the SPA renders a confirmation card
  ("Add 2 files to CCPY26050?").
- **On confirm** the SPA calls a new authenticated endpoint
  `POST /api/cases/{id}/evidence/upload` (multipart; staff role): bytes land in Blob
  `cespkevidstdev01` via the existing evidence path; `case_evidence` + audit rows are inserted,
  mirroring the intake attachment landing (so previews/Box archival behave identically).
- Size/type limits enforced server-side; rejection is a plain-language message in the drawer.

## Acceptance

- [ ] The drawer accepts image/PDF attachments and describes them to the model as context only.
- [ ] A confirmation card naming the target case and file count is ALWAYS shown before any
      write; no upload happens without an explicit user confirm.
- [ ] `POST /api/cases/{id}/evidence/upload` requires a staff-role bearer token (401/403
      otherwise), lands bytes in Blob, and inserts `case_evidence` + audit rows.
- [ ] Uploaded files appear on the case's Evidence tab (previews work — TKT-048 byte-path) and
      an audit entry records the actor.
- [ ] The assistant model itself still has no write tool — `TOOLS` remains SELECT-only
      (TKT-060 invariant intact).
- [ ] Oversized/unsupported files are rejected with a plain-language message (UI-language rule:
      no engineering terms in rendered strings).

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline tests** — api unit tests: auth fail-closed (no token → 401; wrong role → 403),
   happy-path insert (evidence + audit rows), size/type rejection. SPA build green.
2. **Gate** — `node verify-all.mjs` green; api + SPA deploys recorded in
   [changes.md](./changes.md).
3. **Live E2E probe** — on the deployed SPA: attach a real image, confirm the card, and then
   prove the chain with (a) the API response, (b) a Postgres `case_evidence` row + audit row
   for that case, (c) the image rendering on the case's Evidence tab. Record all three in
   [verification.md](./verification.md).
4. **Negative live probe** — a direct `POST /api/cases/{id}/evidence/upload` without a token
   returns 401 (capture the response).
5. **Invariant audit** — record in verification.md that the deployed `TOOLS` set still contains
   no write tool (code citation of the deployed commit).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(§ 3); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)

## Reopened regression and authority ruling — 2026-07-13

The live assistant rejected four selected image files and could not identify the case from the registration
visible in them. The earlier names-only design is superseded. The operator has authorised sending the raw
image bytes to the configured multimodal assistant; PII or client-data content is not a reason to replace
the image with filenames or derived text. The human-confirm-before-write boundary remains binding.

### Acceptance

- Supported image attachments selected in the assistant are sent as actual image content to the configured
  multimodal model, not reduced to filenames, and the request preserves the text turn and image ordering.
- On the supplied vehicle-photo shape, the assistant can read a visible registration, resolve matching
  active cases, and explain whether there is one target, no target or multiple candidates. It does not
  claim to have read text that is not legible.
- One exact eligible target produces a confirmation card naming the case and every selected file. No case
  evidence, archive object or audit row is written before the handler confirms.
- Confirmation uploads each file through the canonical evidence path. Success is shown only after durable
  evidence identities are returned; the images then render on the case and enter normal classification,
  readiness and archive processing.
- An unreadable plate, conflicting identifiers or multiple active cases produces an explicit choice or
  refusal rather than guessing. The handler can search/select the intended case without reattaching files.
- Unsupported, oversized, empty or failed files remain individually visible with a retry/remove action;
  one bad file does not silently discard the rest and retry is idempotent.
- The live failure shown in the supplied screenshots is reproduced by a regression test and fixed: selecting
  the same supported file types no longer yields the generic “file was not added” response.
- Authentication, staff-role checks, size limits and explicit confirmation remain fail-closed. The model has
  no autonomous upload/write tool and cannot bypass the confirmation endpoint.
- New chat behavior follows TKT-067: abandoning a pending card clears its files without writing anything.

### Validation

- Request-shape tests inspect the outbound multimodal message and prove the original image bytes (or their
  lossless provider-supported representation), media type, order and text are present; a names-only request
  fails the test.
- Model-contract fixtures cover readable plate, unreadable plate, conflicting plates, non-vehicle image,
  exact-single case and same-VRM multiple-case outcomes without relying on nondeterministic free text.
- Upload integration tests cover auth, explicit confirmation, partial failure, duplicate retry, concurrent
  target change, evidence/audit creation, classification enqueue and archive-outbox behavior.
- Signed-in live verification uses an image that genuinely needs adding to an operator-designated existing
  case and captures the multimodal answer, confirmation card, successful response, evidence and audit rows,
  rendered preview, classification result and archive object. A cancelled attempt using genuine pending
  work proves zero writes. No live case or evidence is created solely for verification.

### Follow-up evidence

- [Operator image-understanding note](./evidence/followup-2026-07-13/issue2.md)
- [Operator upload-failure note](./evidence/followup-2026-07-13/issue3.md)
- [Raw-image authority ruling](./evidence/followup-2026-07-13/operator-note.md)
