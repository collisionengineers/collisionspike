# Verification — TKT-068: Attach files in the assistant and add them to a case (user-confirmed upload)

## Verdict
TESTED (offline) — partial (server path only)

## Evidence
- `api/src/lib/upload-validate.test.ts` — `classifyUpload` accepts images + PDFs, rejects other types and
  >15MB.
- `node verify-all.mjs` API gate green.

## Pending / gaps
- **Assistant attach-UX not built** — the ticket's headline (attach a file *in the assistant*) is the
  remaining slice; hence `next`, not `verify`.
- **By design, no model upload capability** (ADR-0024) — the assistant proposes/answers; bytes come only
  from a human file-picker.
- **Not deployed.** Live proof (a staff upload lands a blob + `evidence` row + `evidence_added` audit) is
  pending the SPA attach-UX slice + deploy.

## How to re-verify
Offline: `npm --prefix api test`. Live (after the UX slice + deploy): from the SPA, attach an image to a
case; confirm the blob, the `evidence` row, and the `evidence_added` audit event.
