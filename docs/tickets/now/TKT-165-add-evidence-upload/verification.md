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
- The claim-boundary review regression runs passed API **27** and orchestration **33** focused tests.
  They prove Archive gate-off excludes Box-backed rows before lease/attempt accounting while
  Blob-backed staff rows continue to classify.
- Production builds passed for `@cs/api`, `@cs/orchestration`, `@cs/domain`, and `@cs/web` (Vite).
- `node verify-all.mjs`: **8 passed / 0 failed / 13 explicitly skipped**; its compiled suites include
  Domain **1,102**, API **610**, orchestration **399**, and SPA **437** passing tests.
- Ticket, documentation-link, shared-skill and Postgres migration-parity validators passed.
- `scripts/build/build-api.cjs` produced a syntax-valid bundle with Sharp externalised. A clean Linux-targeted
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
- a cached earlier request with no new source/header gets one stable server-derived batch identity and
  identity-bearing replay response; rollout order is API before services/orchestration/SPA;
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

- The TKT-165 upload schema is present live. The new
  `2026-07-15-tkt165-evidence-added-audit.sql` corrective delta is committed but not yet applied;
  live code-table parity still fails only for missing `100000049 / evidence_added`.
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
2. Deploy in the continuity-safe order: API first, orchestration second, SPA last. Smoke each
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

## Independent verification update — 2026-07-14

### Verdict

FAILED

### Evidence

1. **Acceptance 1 — TESTED (offline), deployed surface identified; no successful live submission.**
   `AddEvidence` restricts target search to `not-ready`, `review`, and `held`, resolves one selected
   case, submits selected files to the staff-evidence upload route, and opens the case only after every
   returned item has an evidence identity. Live asset `/assets/index-CbUqeEAY.js` contains `Add
   evidence`, `/evidence/upload`, `held`, the supported file types and upload flow. The live API
   inventory contains `uploadCaseEvidence`. No signed-in browser replay was performed.
2. **Acceptance 2 — TESTED (offline); live route reached validation/commit but did not succeed.**
   Server tests cover staff-role authorization, terminal/merged/stale target rejection before storage,
   content-signature checks, filename/content mismatches, truncated files, limits and plain-language
   refusals. The sole authenticated live invocation reached `uploadCaseEvidence` but returned 400 for
   every item due to the audit lookup failure under Acceptance 7.
3. **Acceptance 3 — TESTED (offline).** Picker and server accept JPEG/JPG, PNG, WebP and PDF. Decoder
   tests exercise real bytes plus extension/MIME masquerades and truncated inputs.
4. **Acceptance 4 — TESTED (offline).** The SPA keeps one stable submission in progress, blocks a
   second submit, shows progress/results, and navigates only after every file has an evidence ID.
   Rendered tests cover upload-before-navigation and double-submit protection. No successful live
   browser proof exists because the deployed API commit fails.
5. **Acceptance 5 — TESTED (offline), not verified live.** The API binds a stable idempotency key to
   case and manifest, hashes content, handles exact replay and same-content deduplication, and fences
   concurrent/stale generations. No successful live replay could be observed.
6. **Acceptance 6 — TESTED (offline), not verified live.** SPA tests retain target/files after failure
   and provide truthful retry; API tests cover mixed batches, rollback/cleanup, and partial/total
   failures. The live request returned 400 and orchestration cleanup completed; no signed-in UI
   observation confirmed retained form state.
7. **Acceptance 7 — FAILED live.** At `2026-07-13T11:47:21Z`, authenticated case
   `a7e923b6-3791-4d3b-afb0-40dd5f5f9287` submitted four files (`fake1.png` through `fake4.png`) to
   `uploadCaseEvidence`. The request returned 400, and every file logged `insert or update on table
   "audit_event" violates foreign key constraint "audit_event_action_code_fkey"`. Current source
   writes strict audit action `AUDIT_ACTION.evidence_added = 100000049` in the same transaction after
   evidence/archive/readiness work. The canonical fresh schema seeds `100000049`, but deployable live
   deltas do not: `2026-07-12-tkt165-staff-evidence-upload.sql` creates upload structures but never
   inserts the lookup, and the only later nearby enum delta inserts `100000052`. The transaction
   therefore cannot commit evidence, Archive record, readiness transition or its audit. At
   `11:49:44Z`, cleanup claims and four `internalStaffUploadCleanupComplete` calls returned 200,
   proving failed-attempt cleanup rather than evidence creation. A seven-day request query found no
   later successful `uploadCaseEvidence` call.
8. **Acceptance 8 — TESTED (offline), FAILED live end-to-end.** Source/tests use user-origin label
   `Add evidence`, not assistant wording. Because the transaction fails, no successful live `Add
   evidence` audit exists.
9. **Acceptance 9 — TESTED (offline), not verified live.** Server commit revalidates target and
   generation; the live request did not commit.
10. **Acceptance 10 — PENDING.** Keyboard, focus/accessibility, narrow layout and 200% zoom were not
    independently exercised in a signed-in deployed browser.
11. **Acceptance 11 — TESTED (offline) from checked-in suites and ticket records, but not rerun in
    this pass.** A focused rerun could not start because this clean verifier worktree has no local
    Vitest install; no dependency install or retry was performed.
12. **Acceptance 12 — FAILED.** The feature is deployed, but the only authenticated natural upload
    returned 400. There is no successful deployed-Chrome proof, committed database evidence/audit,
    retained Blob success artifact, Archive mirror under the configured test root, or completed
    classification/readiness proof. Later 200 cleanup calls prove cleanup only.

### Pending / gaps

- **Blocking live defect:** apply the committed idempotent audit-action delta for `100000049`
  (`evidence_added`) before the API is used again. The canonical bootstrap schema does not update an
  existing live database.
- Then prove live JPG/PDF upload, returned evidence identities, post-navigation rendering, database
  evidence and exact audit, retained Blob, Archive mirror under test root, classification/readiness,
  replay/double-click deduplication, partial failure/retry, stale/merged/auth refusals and accessibility
  at keyboard/narrow/200% zoom.
- Direct PostgreSQL and Blob inventories, signed-in Chrome, and resulting Archive mirror were unread.
  No synthetic case/upload, firewall change, Archive mutation or production stimulus was introduced.

### How to re-verify

1. Add and apply an idempotent live delta for audit action `100000049`; read it back before using the
   route.
2. With explicit authorization, use a designated test case under `BOX_FOLDER_ROOT_ID=392761581105`
   and upload one valid harmless JPG and PDF through **Add evidence**. Confirm progress, evidence IDs,
   navigation only after both IDs, and case rendering.
3. Correlate App Insights; query PostgreSQL for evidence and exact audits; verify retained Blob,
   Archive mirror paths under the test root, classification and readiness.
4. Replay/double-click to prove no duplicates; exercise mixed valid/invalid plus retry, then
   stale/merged/terminal/unauthorized targets with no pre-storage writes.
5. Complete keyboard, focus, narrow-width and true-200%-zoom deployed-Chrome checks.

### Confidence + unread surfaces

**High confidence in the FAILED verdict.** It is supported by the authenticated live 400, repeated
foreign-key error, successful cleanup telemetry, absence of later success, and source/schema/delta
cross-check identifying the missing `100000049` live seed. Unread surfaces are a direct current
PostgreSQL lookup, Blob inventory, signed-in UI/accessibility run and any Archive mirror; these remain
necessary after the fix but cannot overturn the observed failed acceptance.
