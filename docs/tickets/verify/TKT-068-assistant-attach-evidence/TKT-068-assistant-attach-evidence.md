---
id: TKT-068
title: Attach files in the assistant and add them to a case (user-confirmed upload)
status: verify
priority: P2
area: ai
tickets-it-relates-to: [TKT-060, TKT-066, TKT-048, TKT-003]
research-link: docs/tickets/verify/TKT-068-assistant-attach-evidence/evidence/operator-note.md
plan: PLAN-001
---

# Attach files in the assistant and add them to a case (user-confirmed upload)

## Problem

Handlers receive photos/documents out-of-band (WhatsApp, desk scans) and want to hand them to
the assistant — "add these to the YT13 UTV case" — but the assistant has no attach affordance
and, deliberately, no write capability (TKT-060 read-only invariant). There is also no general
authenticated evidence-upload endpoint on the Data API: today evidence lands only via the
intake pipeline.

## Evidence

- `evidence/operator-note.md` — plan § 3 (2026-07-06 planning session).
- `mockup-app/src/components/AssistantDrawer.tsx` — no attach control; turns are text-only.
- `api/src/functions/assistant.ts` — tools are SELECT-only; no write tool exists (by design).
- Evidence landing path: intake activities upload to Blob `cespkevidstdev01` and insert
  `case_evidence` + audit rows — the pattern this endpoint mirrors.

## Proposed change

PROPOSED (not built) — the **model never performs the write**; the write is an explicit,
user-confirmed SPA action:

- **Drawer attach button** (accepts images/PDF). Attachments are held client-side and described
  to the model as context ("user attached 2 photos named …") — bytes are never sent to AOAI.
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
