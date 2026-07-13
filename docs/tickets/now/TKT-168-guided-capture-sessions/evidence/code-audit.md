# Code audit — TKT-168 guided capture sessions

Date: 2026-07-13
Branch inspected: `codex/guided-capture-server`

This is source evidence only. It does not prove deployment or live behavior.

## Canonical contract

- `api/openapi/capture.v1.yaml` contains nine operation IDs: staff create/list/replace/cancel and
  public exchange/manifest/create-upload/complete-upload/submit.
- The status vocabulary is finite (`open`, `complete`, `expired`, `revoked`, `locked`). Upload intent
  and submit require an `Idempotency-Key` header.
- `scripts/check-capture-contract.mjs` and `.github/workflows/capture-contract.yml` validate and
  regenerate `api/src/generated/capture-api.ts` to detect drift.

## Staff surface

- `mockup-app/src/components/GuidedPhotoRequestPanel.tsx` issues approved plans with bounded expiry,
  lists summaries and exposes replace/cancel controls only for open sessions.
- `mockup-app/src/components/ChaserPanel.tsx` consumes a newly returned URL once to build an editable
  guided-photo request. The normal archive-upload template remains present.
- `mockup-app/src/data/rest-client.ts` calls the four authenticated staff routes. The list DTO has no
  URL or secret field.
- The Case detail Evidence action routes the handler to the Chasers surface; the terminal-case state
  disables issuing a new request.

## Public boundary and storage

- `api/src/lib/capture-auth.ts` hashes the bootstrap secret with configured pepper material and signs
  short-lived session/generation-scoped access. `capture-auth.test.ts` covers tamper, expiry, wrong
  session and generation invalidation.
- `api/src/functions/capture.ts` registers public routes with anonymous platform auth but performs its
  own session authorization before returning a manifest or accepting an upload/submit operation.
- `api/src/lib/blob.ts` adds one-path user-delegation SAS creation through the existing managed
  identity credential; no account key is returned.
- Upload completion downloads the staged object, computes SHA-256, compares declared and actual size,
  reuses structural content validation and requires decoded image dimensions before selecting it.
- Submission uses the existing case mutation lock and transaction, materialises selected photos as
  excluded/review-pending evidence, then requests archive mirror and readiness work and writes strict
  audit.

## Data model

- `196_capture_session.sql` defines `capture_session`, `capture_session_shot` and `capture_asset`, with
  expiry/session indexes, exact session-shot ownership, one selected non-repeatable shot, one evidence
  row per asset, forced RLS and non-delete app grants.
- `2026-07-13-guided-capture.sql` is the additive live delta candidate. The canonical enum/lookups,
  evidence linkage and `900_constraints.sql` were updated with the same capture vocabulary.

## Not established by this audit

- No live schema or application setting was read or changed.
- No edge, WAF, DNS, CORS, storage-container lifecycle or rate-limit configuration was inspected.
- No real upload permission was minted and no staging object was written.
- No staff-to-public-to-evidence end-to-end run or physical-device camera run was performed.
- The companion CollisionCapture client and its draft PR require their own browser/device evidence;
  this audit covers the authoritative CollisionSpike side only.
