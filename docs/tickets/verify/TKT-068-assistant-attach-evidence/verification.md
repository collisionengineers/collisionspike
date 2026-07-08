# Verification — TKT-068: Attach files in the assistant and add them to a case (user-confirmed upload)

Verified by: ticket-verifier dispatch, 08-07-26

## Verdict
PENDING — offline-provable classes all pass (SPA build + 312 tests green, confirm-before-write path,
TKT-060 invariant, plain-language rejection); live E2E classes deferred pending SPA/API deploy (BUILD-DARK
this pass). This matches the expected ceiling. It is **not** `TESTED (offline)` because Acceptance lines 3
and 4 explicitly require *live* proof (401/403 probe, blob landing, `evidence`+audit rows, Evidence-tab
render) — offline-only proof is not sufficient for this ticket.

## Evidence
*(one artifact per Acceptance line; commit `3f011fb` = SPA attach-UX slice, `754c38a` = prior server route)*

1. **Drawer accepts image/PDF, describes as context only** — OFFLINE-PROVEN.
   `AssistantDrawer.tsx:234-247` — hidden `<input type="file" accept="image/*,application/pdf" multiple>` +
   paperclip button. `send()` (L125-126) builds `note = attachmentNote(held.map(f => f.name))` and posts only
   `{role, content}` text to `assistantChat` (L133) — **bytes never sent to the model**. `attachmentNote`
   (`attach-validate.ts:89-91`) emits names/counts only. Removable chips L216-231. Build green.

2. **Confirmation card ALWAYS before any write; explicit confirm required** — OFFLINE-PROVEN.
   `AttachConfirmCard` renders whenever `attachments.length > 0 && showAttachCard`
   (`AssistantDrawer.tsx:207-213`; `showAttachCard` set true only after a turn carried attachments). The
   card's `confirm()` (`AttachConfirmCard.tsx:122-149`) is the **sole** caller of
   `getDataAccess().uploadEvidence(...)`, fired only from the primary "Add N files to {case}" button. No
   upload path exists outside that human click. Case resolved **independently** server-side via
   `openVrmTwins` (L100), not from the model's word.

3. **`POST /api/cases/{id}/evidence/upload` staff-gated, blob + rows** — PARTIAL: server code proven offline;
   **live behavior DEFERRED**. `evidence-upload.ts` wraps the route in `withRole('CollisionSpike.User')`
   (L28) → fail-closed 401/403; `classifyUpload` gate (L46); `uploadEvidenceBytes` → Blob (L54);
   `INSERT INTO evidence(...)` (L56-61); `writeAudit({action: AUDIT_ACTION.evidence_added, ...})` (L71-77).
   Route registered `api/src/index.ts:25`; `AUDIT_ACTION.evidence_added = 100000049` + choiceset row present.
   All INSERT columns exist in `060_evidence.sql`. *Live 401/403 probe + actual blob landing + DB insert =
   deferred (needs deploy).*

4. **Files appear on Evidence tab + audit records actor** — DEFERRED (live render). Actor wiring present:
   `actorFromClaims(claims)` → `writeAudit(... actor)`. Rendered Evidence-tab preview (TKT-048 byte path)
   cannot be proven offline.

5. **Model has NO write tool — `TOOLS` SELECT-only (TKT-060 invariant)** — OFFLINE-PROVEN (load-bearing).
   `git show --stat 3f011fb -- api/` is **EMPTY** — the SPA slice touched zero api/ files.
   `toolsForRequest()` (`assistant.ts:137-148`) derives from `readCapabilities()` (SELECT-only); the only
   non-read addition is the pre-existing **dark-gated `propose_action`** (`assistantWriteTier()` off by
   default), which drafts a `ProposedAction` for human confirm and performs **no** DB write — and is **not**
   an upload/evidence tool. `execTool` switch is entirely SELECT. The model has no evidence-upload capability.

6. **Oversized/unsupported rejected in plain language** — OFFLINE-PROVEN.
   `attach-validate.ts:45-57`: `"That file is too big — the limit is 15 MB."` /
   `"That file looks empty, so I did not add it."` / `"I can only add photos and PDFs to a case."` Server
   mirror `api/src/lib/upload-validate.ts:19-30` uses identical wording. `attach-validate.test.ts` asserts no
   banned tokens (mime/blob/payload/multipart/endpoint/byte/401/403). 19/19 green; full suite 312/312.

**Gates:** `npm --prefix mockup-app run build` exit 0 · `npx vitest run` → 312 passed (21 files) ·
`attach-validate.test.ts` → 19 passed · `check-tickets` OK · `check-doc-links` OK.

## Pending / gaps
**Offline classes — PASSED:** Acceptance 1, 2, 5, 6 fully at code+build level; the server-route *code* for 3
(auth wrapper, blob, INSERT, audit) + its unit test; schema-compatibility of the INSERT.

**Live classes — DEFERRED to post-deploy (expected — BUILD-DARK, not bugs):**
- Live attach→confirm→upload chain on the deployed SPA: (a) API response, (b) Postgres `evidence` row +
  `evidence_added` audit row for the case, (c) image renders on the Evidence tab (TKT-048 byte path).
- Negative live probe: direct `POST …/evidence/upload` no-token → 401; wrong-role → 403.
- Invariant audit re-confirmed against the *deployed* commit.

**Naming note (not a failure):** Acceptance/ticket says `case_evidence`; the live table is named **`evidence`**
(`060_evidence.sql`) and the route correctly targets it — terminology shorthand, not a code defect.

**Honesty flag:** a dark-gated `propose_action` tool exists in `toolsForRequest()` (TKT-111 write-tier, off
by default). It drafts proposals for human confirm, performs no write, and is not an upload tool — so the
TKT-060 evidence-upload invariant holds — but `TOOLS` is not *literally* SELECT-only when that gate flips.

## How to re-verify
- **Offline (repeatable now):** `npm --prefix mockup-app run build`; `cd mockup-app && npx vitest run` (312)
  and `npx vitest run src/components/attach-validate.test.ts` (19); `npm --prefix api test`;
  `node scripts/check-tickets.mjs`; `node scripts/check-doc-links.mjs`; `git show --stat 3f011fb -- api/`
  (must be empty).
- **Live (after operator deploys SPA + API):** open the deployed SPA (`cespk-spa-dev`) assistant drawer →
  attach a real JPEG → name the case's registration → confirm the card. Then capture (a) the API response,
  (b) `SELECT file_name, kind_code, source_label FROM evidence WHERE case_id=…` and the `evidence_added` row
  in `audit_event`, (c) the image on the case Evidence tab. Then `POST …/api/cases/{id}/evidence/upload`
  with no `Authorization` header → expect 401; a `CollisionSpike`-unassigned token → expect 403.

## Confidence + unread surfaces
High confidence on the offline verdict — every offline-provable Acceptance line was read at source and
exercised (build + full test suite + isolated attach-validate run + both ticket gates). Could not read (by
design this pass): the deployed SPA and live API — the slice is BUILD-DARK, no deploy recorded. Live blob
landing, the Postgres row inserts, and the Evidence-tab render remain the only unproven surfaces, all gated
on the operator deploy.
