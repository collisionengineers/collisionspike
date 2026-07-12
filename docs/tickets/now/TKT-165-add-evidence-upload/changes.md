# Changes — TKT-165: Make Add evidence upload the selected files

## Status

Implemented and tested offline on `codex/tkt-165-add-evidence`. The dispatching loop still owns the
ticket-status move, live database delta, deployment and independent verification.

## Commits

- `7999d33` — make the staff evidence upload target-bound, replay-safe and usable from Add evidence.
- `cc70081` — make Add evidence and New case report complete, partial and top-level failures truthfully.
- `c424adb` — close the independent review's storage-lifecycle, rolling-rollout, validation and
  classifier handoff gaps.
- `4f1b48d` — close the re-review's JPEG/PNG/WebP container, unknown-extension and older-delta gaps.
- `a5871f8` + `5e15969` — make JPEG marker walking boundary-aware and require encoded PNG/WebP
  payload data rather than accepting frame/container headers alone.
- `6a42855` + `01b34bd` + `76bd0bc` + `2df3242` — validate JPEG frame/scan component tables and
  require PDF `startxref` offsets to resolve to a classic cross-reference table or the specific
  cross-reference stream object's dictionary.
- `5ca464b` — give every upload lease a unique Blob generation, fully decode image pixels with
  bounded native work, preserve exact duplicate-file identity in responses, and cover the real
  rendered retry workflows.

## Files touched

- `mockup-app/src/screens/AddEvidence.tsx`, `add-evidence-submit.ts`, and
  `evidence-upload-result.ts` — Held-aware case search, aligned picker, remove/retry/progress/result
  states, visible top-level 401/403/500 failures, and navigation only after every file has a
  persisted evidence identity.
- `mockup-app/src/data/rest-client.ts`, `AttachConfirmCard.tsx`, `ManualIntake.tsx`, and the shared
  attachment validator — one authenticated upload client with explicit source labels and stable
  idempotency keys for each staff surface. A mixed `207` can no longer be presented as complete New
  case success.
- `api/src/functions/evidence-upload.ts` and `api/src/lib/upload-validate.ts` — server-side count,
  aggregate/per-file size, mutually consistent extension/type and structural byte checks;
  active-target revalidation; case-bound batch manifests; SHA-256 deduplication; strict audit,
  archive and readiness work. Cached legacy clients receive a server-derived stable identity and
  the same identity-bearing response, so the API can safely deploy before the SPA.
- The same API path now gives every claimed upload generation its own Blob path. A cleanup worker
  holding an expired generation can delete only that old path after a retry has succeeded. JPEG,
  PNG and WebP files must also survive a full all-frame pixel decode through Sharp, bounded to 32
  million pixels, four channels, 128 MB decoded output and five seconds per file.
- `api/src/functions/internal.ts`, `orchestration/src/functions/box-classify-sweep.ts`, and their data
  client — staff-uploaded photos enter the existing durable image-classification lane from Blob.
  Photos remain classifier-owned and not ready while the image check is pending; eligible photos are
  released to archive work by the classification stamp. Staff rows never age out before a first
  attempt; a stable provider AI opt-out becomes an explicit staff-review disposition rather than an
  endless retry. Cross-lane rows send only the locator owned by their source lane.
- `migration/assets/schema/195_staff_evidence_upload.sql`,
  `migration/assets/schema/deltas/2026-07-12-tkt165-staff-evidence-upload.sql`, and
  `migration/assets/schema/900_constraints.sql` — target/actor/source/manifest binding plus one
  durable owner row per file/Blob path, cleanup leases/backoff, forced RLS for both upload tables and
  non-delete app grants.
- `docs/azure/deploy.md` — additive delta → API → orchestration → SPA is the binding rollout order for
  this contract. The API bundle externalises Sharp and its production package installs and verifies
  the Linux x64 glibc Sharp/libvips binaries explicitly.
- Rendered Add evidence and assistant-confirmation tests now exercise the actual components rather
  than helper functions alone: upload-before-navigation, a filtered-out selected target,
  synchronous double-submit protection, partial and total failure retention, duplicate filenames,
  stable retry keys and accessible result announcements.

## Summary

The Add evidence action no longer treats navigation as attachment. A staff retry or double-click
cannot duplicate the evidence row, archive work or audit, and the same retry key cannot be reused for
different files or another case. A unique durable owner bridges Blob storage and the database
transaction: a stale target, rollback, crashed upload or same-SHA race leaves an owned cleanup row,
never an undiscoverable object, and the wake-safe orchestration sweep removes only an unreferenced
owner path. Mixed failures remain on the form with the selected case and files; complete success opens
the case only after the response contains every evidence identity. The UI and server now promise the
same formats: JPG, PNG, WebP and PDF. HEIC/HEIF and `.eml`/`.msg` are not advertised because this path
cannot safely process them end to end.

TKT-166 remains a separate pending New case intake ticket. This implementation does not claim that
the document/manual case-creation path now uploads instructions or extra files end to end.
