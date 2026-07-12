# Verification — TKT-165: Make Add evidence upload the selected files

## Verdict

PENDING — the individual offline checks below are `TESTED (offline)`, but the database delta,
deployment and designated-test-case Chrome/Postgres/Blob/Box proof are still outstanding. This is not
a ticket-level verification verdict.

## Offline evidence

- Full API suite: **62 test files / 610 tests passed**.
- Full orchestration suite: **30 test files / 399 tests passed**.
- Full SPA suite: **35 test files / 437 tests passed**.
- Full Domain suite: **52 test files / 1,102 tests passed**.
- The final review-closure focus run passed API **25** and rendered/helper SPA **13** tests; the
  earlier focused TKT-165 API, orchestration and SPA coverage remains in the full suites above.
- The PR review regression run passed all **24** focused orchestration tests and proves repeated
  Archive gate-off sweeps do not record failures for Box-backed rows while Blob-backed staff rows
  continue to classify.
- Production builds passed for `@cs/api`, `@cs/orchestration`, `@cs/domain`, and `mockup-app` (Vite).
- `node verify-all.mjs`: **8 passed / 0 failed / 13 explicitly skipped**; its compiled suites include
  Domain **1,102**, API **610**, orchestration **399**, and SPA **437** passing tests.
- Ticket, documentation-link, shared-skill and Postgres migration-parity validators passed.
- `build-api.cjs` produced a syntax-valid bundle with Sharp externalised. A clean Linux-targeted
  production install supplied `sharp-linux-x64-0.35.3.node` and `libvips-cpp.so.8.18.3`; `file`
  identified both as x86-64 ELF shared objects.

The focused tests prove:

- Add evidence searches Not ready, Review and Held, uploads before navigation, and stays put on mixed
  failure or stale target. Rendered tests also prove that a search which hides the selected target
  clears it and disables submission, and that two immediate clicks issue one request;
- exact-key replay and exact-key concurrency permit one Blob owner; fresh-key same-content races
  either reuse the evidence or persist their distinct path as cleanup-owned; a key reused for another
  target or manifest is refused before Blob storage;
- merged/removed targets and masquerading file content are refused; a valid file in a mixed batch can
  still complete truthfully;
- evidence, strict audit, archive outbox and readiness generation roll back together when durable work
  fails; stale-target and rollback paths leave the exact Blob path discoverable for leased,
  reference-checked cleanup;
- a cached legacy request with no new source/header gets one stable server-derived batch identity and
  identity-bearing replay response; rollout order is API before orchestration/SPA;
- JPG/PNG/WebP/PDF validation rejects MIME/extension disagreement, HEIC/HEIF, masquerades and
  header-only/truncated containers. Real 2×2 JPEG, PNG and WebP fixtures pass a full pixel decode;
  structurally plausible fake containers fail. Decode work is sequential per request file and is
  capped at 32 million pixels, four channels, 128 MB raw output and five seconds;
- PDF `startxref` coverage accepts a classic cross-reference table and a cross-reference stream with
  more than 2 KB of stream data, while rejecting the reviewed two-object repro whose offset points at
  an ordinary object before a later `/Type /XRef` object. It also rejects `/Type /XRef` outside the
  pointed object's dictionary;
- staff photos are claimed from Blob, classified through the existing policy, and stamped by exact
  evidence id + case id + the one source-owned locator; old first-attempt rows remain eligible and a
  provider opt-out becomes explicit manual review;
- canonical and live-delta DDL contain the target-bound batch/item tables and cleanup index; the
  canonical policy loop and live delta both force RLS on `staff_evidence_upload` and
  `staff_evidence_upload_item`, with least-privilege non-delete grants.
- the exact cleanup race is covered: generation A writes then fails, its cleanup is reclaimed,
  retry generation B succeeds at a different path, and a late generation-A delete leaves B's Blob
  and canonical evidence path untouched;
- duplicate filenames retain their original per-file indexes from API response through both UIs.
  A partial assistant-confirmation result remains an error with Retry, reuses the same key, and
  reaches Done only after every original index has a persisted evidence id.

## Honest gaps

- `2026-07-12-tkt165-staff-evidence-upload.sql` has not been applied live.
- API, orchestration and SPA changes have not been deployed.
- No file, case, Blob object or Box folder was changed during this implementation pass.
- TKT-166's New case document/manual upload lifecycle remains pending and is not certified by this
  ticket.
- Browser accessibility and 200% zoom were implemented with native buttons, labelled inputs,
  `aria-live` progress/results and a responsive layout, but require deployed Chrome confirmation.
- The existing generic auth suite proves bearer/role rejection; the new route is registered behind
  `CollisionSpike.User`. A deployed unauthenticated 401 and inaccessible-case probe remain required.

## Live re-verification

1. Apply the TKT-165 delta, then verify `staff_evidence_upload` and
   `staff_evidence_upload_item` have forced RLS and `uq_evidence_staff_upload_item` exists.
2. Deploy in the compatibility-safe order: API first, orchestration second, SPA last. Smoke each
   surface before continuing.
3. In Chrome, use Add evidence on a designated test case whose archive folder is beneath test root
   `392761581105`: select Held as well as a normal open case; upload one harmless JPG and one PDF.
4. Verify the response contains two evidence ids, the case Evidence tab shows both, Postgres has the
   two canonical rows plus understandable `evidence_added` audits, and Blob has the two deterministic
   paths.
5. Repeat the same request/idempotency key and double-click simulation; prove row, audit, archive
   generation and Box file counts do not increase.
6. Verify the PDF archive generation completes beneath the test root. Verify the photo is initially
   pending its image check, then classification stamps the exact row, readiness is recomputed, and an
   eligible photo is mirrored once beneath the same test root.
7. Repeat with one unsupported/masquerading file and one valid file; confirm the valid identity is
   reported, the refused file remains visible for retry, and the page does not navigate.
8. Probe the endpoint without a bearer token (expect 401), with a stale/removed/merged case (expect
   refusal before storage), and at narrow width plus 200% zoom with keyboard-only controls.
