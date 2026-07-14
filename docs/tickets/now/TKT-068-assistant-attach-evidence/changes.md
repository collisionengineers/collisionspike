# Changes — TKT-068: Let the assistant understand images and add them to a case

## Status
now — the SPA attach-UX slice is code-complete + offline-green on the `feat/plan-001-vision-family` branch
(BUILD-DARK; not deployed), ready for the verify sweep once the operator deploys. The server path landed
earlier. The model still gets **NO upload capability** (TKT-060 invariant; `api/` untouched this slice).
Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 2; ADR-0024.

## Commits
- `754c38a` — ai: PLAN-001 Phase 2 (evidence upload route + validation; no model upload tool).
- (this slice, pending commit) — ui: assistant drawer attach affordance + user-confirmed upload (SPA only).

## Files touched
### Server groundwork (commit `754c38a` — DO NOT re-touch)
- `api/src/functions/evidence-upload.ts` — `POST /api/cases/{id}/evidence/upload` (multipart, staff role,
  size/type guard, blob + `evidence` row + audit `evidence_added`). Route in `api/src/index.ts`.
- `api/src/lib/upload-validate.ts` (+ `upload-validate.test.ts`) — `classifyUpload` (images + PDFs, ≤15MB).
- `api/src/lib/audit.ts` + `migration/assets/schema/000_enums_lookups.sql` — `evidence_added` action code
  (`100000049`) + its `choice_audit_action` row.
- `mockup-app/src/data/rest-client.ts` + `data/index.ts` — `uploadEvidence` data method.

### SPA attach-UX slice (2026-07-08 — this session, SPA only)
- `mockup-app/src/components/attach-validate.ts` (+ `.test.ts`, 19 cases) — pure client helpers:
  `classifyAttachment` / `partitionAttachments` (client-side mirror of the server size/type gate, same
  plain-language reasons), `detectCaseRef` (sniff a registration / Case/PO from the conversation to
  pre-fill the confirm card), `attachmentNote` / `fileCountLabel` (the names-only context text + plural
  labels). No I/O — unit-testable.
- `mockup-app/src/components/AttachConfirmCard.tsx` — the human-confirm gate. Resolves the target case
  INDEPENDENTLY against the server via `openVrmTwins` (registration → open cases; ungated), names the
  case + file count, and only on an explicit confirm calls `getDataAccess().uploadEvidence`. Mirrors
  `ConfirmActionCard`'s re-fetch/render/confirm shape. Success / partial-rejection feedback in-card.
- `mockup-app/src/components/AssistantDrawer.tsx` — a paperclip attach button + hidden `image/*,
  application/pdf` picker; held files shown as removable chips; a picked turn appends a names-only
  context note to the model message (bytes never sent); the confirm card surfaces after the turn.

## Summary
### Server groundwork
Built the human-driven server path: a staff-authorised multipart upload route that validates size/type,
stores bytes, records an `evidence` row, and audits `evidence_added`. Per ADR-0024 **the model gets no
upload tool** — bytes only ever come from a human file-picker.

### SPA attach-UX slice (2026-07-08)
Wired the conversational attach UX to that existing route, entirely SPA-side:

1. **Attach** — a paperclip in the drawer composer opens a picker constrained to photos + PDFs. Files are
   held CLIENT-SIDE as removable chips; oversized/unsupported files are turned away immediately with a
   plain-language reason (the same wording the server uses) — the server stays the enforcer.
2. **Describe to the model as context only** — sending a turn with attachments appends "Attached N files:
   …" (names/counts) to the message so the model can resolve the target case via its existing read-only
   `lookup_case` tool. **The bytes are never sent to the model.**
3. **Confirm card ALWAYS before any write** — `AttachConfirmCard` resolves the target case independently
   (server truth via `openVrmTwins`), names it + the file count, and requires an explicit "Add N files to
   CCPY26050" click. No upload fires without that confirm.
4. **On confirm** → `uploadEvidence(caseId, files)` → the existing staff route; in-card success / partial
   feedback.

**Design note / deviation flagged:** the upload route keys on the internal case id (GUID), but the model's
`lookup_case` returns only Case/PO + registration, and the SPA's Case/PO→id resolver (global search) is
default-OFF/in-soak. So the confirm card resolves the target by **registration** via the always-available,
ungated `openVrmTwins` (the assistant surfaces the registration even when the handler names a Case/PO), with
the human confirming/correcting the registration in the card. This keeps the slice honest and independent of
any gated feature.

**TKT-060 invariant intact:** `api/src/functions/assistant.ts` was NOT touched this slice — `toolsForRequest()`
still derives from `readCapabilities()` (SELECT-only) + the dark-gated `propose_action`; the write is a pure
SPA action a human triggers.

## Reopened 2026-07-13

Fresh live screenshots show the selected images failing to add, and the assistant cannot inspect their
registration because the implementation sends filenames only. The operator has removed the PII/client-data
restriction and explicitly requires raw multimodal image input. The prior names-only implementation and
its verification ceiling are superseded; confirmation-before-write remains unchanged.
