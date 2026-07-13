# Changes — TKT-168: Add secure guided photo capture sessions

## Status

Implemented as an offline branch candidate on `codex/guided-capture-server`. Contract and staff UI
commits are present; the public API/schema slice is still subject to integration review and the full
verification run. No database delta, app setting, cloud resource or live data was changed by this
branch.

## Contract

- `api/openapi/capture.v1.yaml` defines the nine staff/public operations, finite status/error shapes,
  bounded shot-plan/expiry inputs and required `Idempotency-Key` headers.
- `api/src/generated/capture-api.ts`, `scripts/check-capture-contract.mjs` and
  `.github/workflows/capture-contract.yml` make generated types and contract validation reproducible.
- The contract is authoritative for the companion CollisionCapture client; staff/public transport
  changes must update the spec and generated consumers together.

## Staff workflow

- `packages/domain/src/dto/capture.ts` adds staff-safe session summaries and create/replace/cancel
  results. Existing list responses contain no capture secret.
- `mockup-app/src/data/rest-client.ts` and the data hooks expose the authenticated staff operations.
- `GuidedPhotoRequestPanel.tsx`, `ChaserPanel.tsx` and the Case detail Evidence/Chasers integration add
  plan/expiry selection, issue/replace/cancel controls and a one-time editable chaser draft while
  retaining the existing archive upload link.
- Rendered and data-client tests cover create, list, replace, cancel, chaser drafting and plain-language
  copy.

## Public API and data model

- `api/src/functions/capture.ts` registers staff issue/list/replace/cancel routes and public
  secret-exchange, manifest, upload-intent, upload-completion and submission routes behind capture
  configuration gates.
- `api/src/lib/capture-auth.ts` and `capture-plans.ts` keep secret/access handling and shot-plan rules
  independently testable. Public access is session scoped; replacement/cancellation advances the
  token generation.
- `api/src/lib/blob.ts` mints managed-identity user-delegation upload permissions for one staged path.
  `upload-validate.ts` is reused for structural image checks before an asset can be selected.
- Submission locks the case, requires the selected mandatory shots, creates review-pending evidence
  with original path/hash metadata, requests archive mirror work, requests readiness recomputation and
  writes strict audit in the same transaction.
- `migration/assets/schema/196_capture_session.sql` and
  `migration/assets/schema/deltas/2026-07-13-guided-capture.sql` add the session, requested-shot and
  staged-asset tables, evidence linkage, audit choices, constraints, indexes, forced RLS and app-role
  grants. `900_constraints.sql` carries canonical parity checks.

## Deliberately unchanged

- The existing staff Add evidence route, archive upload link and evidence review/acceptance controls.
- Automated damage, part or viewpoint recognition.
- Live Azure infrastructure, DNS, public edge/WAF policy, storage-container policy and app settings.
- Box content or metadata. The later live proof must remain beneath the designated test root.
