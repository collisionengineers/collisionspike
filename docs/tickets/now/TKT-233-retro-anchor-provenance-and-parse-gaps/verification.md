# TKT-233 — verification

## Pre-deploy (offline, 2026-07-17 on the branch)

- U1: data-api `npm test` **1071 passed** (incl. `inbox-anchor-exclusion.test.ts` — three
  discriminators + NULL safety; case-scoped read keeps anchors; malformed caseId → 400);
  apps/web **547 passed** (incl. the `caseId` facet URL pin); packages/domain **594 passed**.
- U2: sibling suite **538 passed / 3 skipped / 0 failed**; red-check reproduced the live
  harvest with the own-domain tuple emptied, green with it in place. Vendored parser suite
  **396 passed / 9 skipped / 0 failed** — zero same-day environment-drift deltas;
  `verify_vendor_pin.py` **PASS engine-v2.25 @ 83164e6** (immutable tag verified, 36 files);
  `test_engine_vendored_in_sync.py` 3/3.
- U4: `test_explode_msg.py` green in the same run — genuine OLE fixture round-trip, magic-only
  detection, mislabeled/corrupt 422s, caps on the msg branch, `.eml` regression.

## Post-deploy probes (bank outputs here)

1. U1 (Chrome): Triage Inbox shows only real mailbox chips (All/desk@/engineers@/info@ —
   "Other source" gone); the two anchor rows absent from the list; case
   `b5ffe5e4` Emails tab still shows its reconstruction anchor.
2. U2 (ops SQL, separate authorization): run
   `database/operations/tkt233-clear-own-domain-claimant-emails.sql` — pre-check enumerates
   affected cases (known: b5ffe5e4 / AC14ACE), post-check 0; then confirm the SPA field is
   empty/staff-editable and no NEW case acquires an own-domain claimant email (SQL negative
   probe after the next reconstruction batch).
3. U4: re-drive a `.msg`-anchored archive folder (or synthetic probe via the deployed
   `/explode-eml` with the fixture): envelope carries real headers + To-address provenance;
   no "explode unavailable" warn for `.msg`.
4. Research follow-ups: one-off probe whether the three shared mailboxes have In-Place
   Archive enabled; extend `retro-deleted-probe` to sweep `recoverableitemsdeletions` for the
   22 hard-gone triggers before retention lapses.
