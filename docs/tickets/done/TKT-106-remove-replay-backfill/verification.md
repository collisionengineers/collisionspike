# Verification — TKT-106: Remove the non-viable replay-backfill driver + gate

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). The two
previously-pending live steps (app-setting deletion + redeploy/count re-verify) were completed in the
2026-07-09 lifecycle-wave deploy and are now independently confirmed by the verifier's own live reads.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

### Evidence
- **Driver gone from the live app (function count):** `az functionapp function list -g
  rg-collisionspike-dev -n cespk-orch-dev` (2026-07-10) → **74 functions, zero replay-named**
  (`grep -i replay` → none). The −5 drop landed at the 2026-07-09 lifecycle-wave deploy and is
  recorded in LIVE_FACTS functionCounts docDrift ("orch 70→71 NET: -5 replay-backfill registrations
  removed TKT-106, +6 dark TKT-095 detectors"); today's 74 = 71 +1 (D2/TKT-102) +1 (TKT-145)
  +1 (TKT-146) — trail consistent, no replay registration anywhere in it.
- **Gate deleted from live app-settings:** appsettings list → **`REPLAY_BACKFILL_ENABLED` absent**.
- **Code + deployed bundle grep-clean:** `orchestration/src` + `packages/domain` → only removal-note
  comments (index.ts:61, graph.ts:338, gates.ts:143); `deploy/orch/main.cjs` → only the TKT-106
  removal comment (line 2152) + Durable `isReplaying` idioms. Repo-wide `REPLAY_BACKFILL_ENABLED`
  (excluding docs/tickets + memory) → only the LIVE_FACTS changelog narrative +
  readiness-matrix removal rows. CLAUDE.md and docs/gated.md clean.
- **TKT-059 finding preserved:** docs/tickets/done/TKT-059-replay-wipe-rebuild/verification.md
  Finding 1 intact ("mailboxes do NOT retain history… 88 messages vs 390 inbound_email…
  non-viable"); BOARD closes TKT-059 citing the TKT-106 removal.
- **LIVE_FACTS + board updated:** gates block has no REPLAY_BACKFILL_ENABLED entry (removal narrated
  in the gates docDrift).
- **verify-all.mjs green:** implementer-recorded offline at the wave gate (orch build + vitest green
  post-removal; @cs/domain vitest 1058 passed) — deployed bundle independently grep-verified by the
  verifier instead of a local re-run.

### Pending / gaps
- Expected/procedural, not bugs: the verifier did not re-execute `node verify-all.mjs` (a mutating
  build gate, outside the read-only contract; this box also has the known environmental parser FAIL);
  the deployed bundle was verified clean directly. No DB checks required (pure removal).
- Doc nit (superseded by this transcription): the prior verification.md cited TKT-059 under
  docs/tickets/blocked/ — it lives under done/.

### How to re-verify
- `az functionapp function list … cespk-orch-dev --query "[].name" -o tsv | grep -ci replay` → 0.
- `az functionapp config appsettings list … --query "[].name" -o tsv | grep -i REPLAY` → empty.
- `rg "REPLAY_BACKFILL_ENABLED" --glob '!docs/tickets/**' --glob '!memory/**'` → registry narrative +
  readiness-matrix removal rows only.
- `rg -i "replay-backfill|replayBackfill|replay-manifest|listMessagesSince" orchestration/src packages
  deploy/orch/main.cjs` → removal-note comments only.

### Confidence + unread surfaces
High. Unread: no App Insights/KQL (nothing to observe for a removed function); no fresh verify-all
execution (mutating); the historical −5 drop evidenced by the LIVE_FACTS trail rather than direct
observation (three later deploys legitimately changed the count).
