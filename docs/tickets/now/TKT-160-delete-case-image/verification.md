# Verification — TKT-160: Delete an individual case image from every active store

## Verdict
PENDING

## Evidence

PR #87 was rebased onto post-#83 `main` and **merged 2026-07-15**. The schema, Box façade, API and SPA
were deployed on 2026-07-16 with the destructive `DELETE_CASE_IMAGE_ENABLED` gate absent/default-off;
the Box leg remains test-root locked. A four-lane offline review (security, DB/schema, integration,
docs) found **no BLOCKER**; the security-critical design was verified solid:

- Authenticated `withRole('CollisionSpike.User')` route; wrong-case / non-image guards refuse before any
  store work; identity pinned at claim time and re-checked under `FOR UPDATE` in the finalizer.
- Cross-store order Archive(Box) → Blob → Postgres; `box_client.delete_file` re-validates scope FRESH
  (parent == persisted case folder, under the configured RW root) before mutating; 404/410 = idempotent.
- Delete capability exists only via the `SECURITY DEFINER complete_evidence_deletion` function (search_path
  pinned, `REVOKE ALL FROM PUBLIC`, `EXECUTE` to `cespk_app` only), guarded by claim-token + resolved store
  outcomes + identity match; `cespk_app` holds **no** table DELETE grant on `evidence` (the primary control).
- Replay suppression is keyed on per-file identity (not Message-ID / sha256), so a later explicit re-upload
  stays valid; merge-vs-deletion fail-fast (409) precedes the mutating merge helpers.

Offline suites pass on the reconciled 2026-07-15 review head: Data API **993** (including the gated-off
no-op and cross-store / partial-failure / replay suite), Archive function **274** (including the restored
`delete_file` scope lock), domain **559**, orchestration **508**, and web **545**. Audit codes were
renumbered to **100000063/64/65** at rebase (TKT-200 took 56–62).

## Review follow-ups (offline, non-blocking — ship dark)

- **No background retry sweeper**: `ix_evidence_deletion_retry` implies one, but a stuck `retry_needed`
  row only advances on a repeat user `DELETE`. Add an operator/timer retry path (or drop the implication).
- **RLS scoped-delete policy is inert defense-in-depth on the live path**: because the deletion runs inside
  the `SECURITY DEFINER` function (owned by a `BYPASSRLS` owner on live) and `cespk_app` never issues a
  direct evidence `DELETE`, `p_evidence_scoped_delete` is never evaluated. The real controls are the
  no-DELETE grant + the function's internal guards; the `900_constraints.sql` comment must not advertise
  the policy as "the control".
- **Store-erasure asymmetry**: Box `delete_file` moves the file to Box trash (recoverable) while the Blob
  is hard-deleted — reconcile the ADR-0012 "removed" wording or the Box behaviour.
- **Migration hygiene**: the delta relies on `p_evidence_rw` already existing (non-idempotent); verify
  canonical (`205`/`900`) vs delta index/policy parity against a fresh rebuild.

## Pending / gaps

The additive schema and deployables are live, but the feature is dark and no Box write or live case was
changed. Live proof outstanding: flip `DELETE_CASE_IMAGE_ENABLED` only for an approved test window, then
delete one test image
inside Box root `392761581105` and read back Blob, Box, database, UI, readiness and audit state; prove
partial-failure retry and replay suppression. This ticket cannot leave `now` until an independent verifier
records that live proof.

## How to re-verify
Follow `docs/operations/delete-case-image.md` in deploy order. Run cross-store deletion/retry/replay tests,
then delete one test image inside Box root `392761581105` and read back every store, the UI, readiness and
audit state.

## 2026-07-20 addendum

`DELETE_CASE_IMAGE_ENABLED` was flipped `true` live on `cespk-api-dev` by explicit operator direction
during the TKT-159 gate audit (see `changes.md`). This is an app-setting readback fact, not the
designated-test-folder live proof this ticket requires — the verdict stays `PENDING` and "How to
re-verify" above is unchanged and still outstanding.

## 2026-07-20 — SPA wiring gap found and fixed (offline only)

A TKT-159 follow-up audit found the "Delete image" control this ticket's own acceptance criteria require
was never actually reachable in `apps/web` (the mockup-app→apps/web port dropped the screen wiring, not
the component — see `changes.md`). That gap is now fixed: gate-checked button on every image card →
confirm dialog → `deleteCaseImage` → local state update. `tsc --noEmit` clean, full `apps/web` suite
556/556 passing, production build succeeds. This is still purely an offline code fix — it does not
change the verdict, does not touch Box/Blob/Postgres live data, and does not substitute for the
designated-test-folder proof this ticket needs to leave `now`.
