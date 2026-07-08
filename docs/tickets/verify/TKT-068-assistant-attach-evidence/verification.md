# Verification — TKT-068: Attach files in the assistant and add them to a case (user-confirmed upload)

## Verdict
TESTED (offline) — SPA attach-UX slice built + offline-green; live E2E PENDING (deploy required).

## Evidence (offline-proven this session, 2026-07-08)
- **SPA build + typecheck green** — `npm --prefix mockup-app run build` (`tsc -b && vite build`) passes.
- **Client helper unit tests** — `mockup-app/src/components/attach-validate.test.ts` (19 cases) green:
  `classifyAttachment` accepts photos + PDFs, rejects oversized / empty / unsupported with the SAME
  plain-language reasons the server uses; `detectCaseRef` sniffs a registration / Case/PO from conversation
  text; a "no engineering terms" assertion guards the rejection strings.
- **Full SPA suite** — `npx vitest run` in `mockup-app`: 21 files / 312 tests green (no regressions).
- **`node verify-all.mjs`** — Code App (tsc + vite build), Code App (vitest), and Code App red-budget gates
  all PASS. (The one FAIL, `Function parser — pytest`, is the documented pre-existing Windows-env failure,
  unrelated — this slice touches only `mockup-app/src`.)
- **Server path (prior)** — `api/src/lib/upload-validate.test.ts` green; API gate green.
- **TKT-060 invariant** — `git status -- api/` is empty this slice; `api/src/functions/assistant.ts`
  `toolsForRequest()` still derives from `readCapabilities()` (SELECT-only) + the dark-gated
  `propose_action` — no write/upload tool. The upload is a pure SPA action a human confirms.

## Pending / gaps (live classes — for the verifier/operator, DEFERRED to after deploy)
- **Live E2E chain** — on the deployed SPA: attach a real image → confirm the card → prove (a) the API
  response, (b) a Postgres `evidence` row + `evidence_added` audit row for that case, (c) the image renders
  on the case's Evidence tab (TKT-048 byte path).
- **Negative live probe** — a direct `POST /api/cases/{id}/evidence/upload` with no token returns 401;
  wrong-role returns 403.
- **Invariant audit at the deployed commit** — re-confirm the deployed `TOOLS` set carries no write tool.

## How to re-verify
Offline: `npm --prefix mockup-app run build` + `npx vitest run` (in `mockup-app`); `npm --prefix api test`.
Live (after deploy): from the deployed SPA open the assistant, attach a photo, name the case's registration,
confirm the card; then check the API response, the `evidence` + `evidence_added` rows, and the Evidence-tab
render; plus the no-token 401 / wrong-role 403 probes.
