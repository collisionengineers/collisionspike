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

## Live (2026-07-17, deploy of `d6ee70de` — data-api + orchestration from
## `.artifacts/deploy` artifacts, parser remote build, SPA via swa)

1. **U1 VERIFIED (Chrome)**: Triage Inbox chips now `All (1490) · desk@ (528) ·
   engineers@ (592) · info@ (370)` — "Other source" GONE (was `All (1639) · Other source (2)
   · desk@ (615) · engineers@ (641) · info@ (381)`): ~149 anchor rows hidden, including
   eml-arm anchors that had been inflating the real-mailbox counts (the would-be fifth-chip
   class). Case `b5ffe5e4` Emails tab still lists its anchor
   "Retro reconstruction: A.PCH261343 — 576003.pdf" alongside 3 linked related emails —
   provenance retained on the case.
2. **U2 EXECUTED**: ops SQL cleared **81 cases** (pre-check 81 → post-check 0) — the harvest
   was systemic across providers, not just AC14ACE; full record in
   [evidence/ops-sql-run-2026-07-17.md](./evidence/ops-sql-run-2026-07-17.md). Transient
   firewall rule deleted (list back to AllowAzureServices only). Negative probe (no NEW
   own-domain claimant email after the next reconstruction batch) still to bank.
3. U4 live probe pending: re-drive a `.msg`-anchored archive folder (offline fixture
   round-trip already green).
4. Research follow-ups open: In-Place Archive enablement probe for the three shared
   mailboxes; `retro-deleted-probe` + `recoverableitemsdeletions` sweep for the 22 hard-gone
   triggers before retention lapses.
