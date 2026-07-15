# Lane F — SPA + Migration/DDL moves

**Scope:** `mockup-app/` → `apps/web` and `migration/` → `database/{baseline,migrations,seeds,tests,operations}`.
**Verdict:** the SPA move is clean; the **DDL "move" is not** — it silently drops 5 live tables, a corpus seed, 4
deltas, a column, and 10 audit codes, and the green gates miss it because the parity fixture was reduced in
lockstep. Findings 1–3 feed blocker #1. 6 issues.

### F1 — [BLOCKER · CONFIRMED] 5 tables (+ column + 10 audit codes) dropped, defined nowhere on the branch
`database/baseline/` (esp. `000_enums_lookups.sql`, `050_case.sql`, `060_evidence.sql`). Present on main, absent
on branch: `capture_session`, `mcp_http_session`, `mcp_image_ingest_rate_limit`, `archive_holding`,
`evidence_deletion`; also removed `case_.archive_holding_pending` column and audit_action codes
100000056–100000065 (a vocabulary the file marks "NEVER renumber"). **Confirmed added to main after the
merge-base** (all four sampled tables ABSENT at `81ae8fdf`, present on `origin/main` via #83/#87/#89/#73).
Branch baseline = 52 `CREATE TABLE` (matching the runtime-contract "52 tables"), i.e. the reduced set.
*Consequence:* re-provisioning from `database/baseline/` yields a schema missing 5 tables + a column + 10 audit
codes vs main/live. `check:database` cannot catch it — the parity corpus was cut to match. **This is the DDL
face of blocker #1 (stale-base reversion).**

### F2 — [BLOCKER/HIGH · CONFIRMED] Reference-corpus seed dropped
`migration/assets/schema/seed/910_seed_corpus.sql` (work providers / repairers / image sources / inspection
addresses) exists nowhere on the branch (`database/seeds/` keeps only 915/916/920). *Consequence:* a fresh DB
provision can no longer seed the corpus the domain depends on. **Not** explained by "exclude dark features" — this
is core seed data. Feeds blocker #1.

### F3 — [MEDIUM · CONFIRMED] 4 delta migrations dropped
`2026-07-13-guided-capture`, `-tkt034-archive-holding`, `-tkt154-mcp-image-ingestion`, `-tkt160-evidence-deletion`.
Net SQL: main 88 → branch 80. Ordering of surviving numbered files intact.

### F4 — [MEDIUM · CONFIRMED] Two SPA feature components dropped with their features
`apps/web/src`: `GuidedPhotoRequestPanel.tsx` (393L) and `ImageDeleteDialog.tsx` (86L) + tests. **De-referenced
cleanly** (zero remaining imports → build-safe), but real feature-code regression consistent with F1/F3.

### F5 — [INFO · CONFIRMED-clean] SPA move otherwise sound
All 12 binary assets (10 fonts + 2 PNGs) **byte-identical** (matching git blob SHAs); no dangling
`mockup-app/`/`../screens`/`../components` imports; `rest-client.ts` seam intact (`createRestDataAccess`, every
method targets `/api/*`, types now from `@cs/domain`); `@cs/web` + `workspaces: apps/*` + vite/tsconfig/deps
consistent. A deliberate flat→feature-folder restructure, not corruption. (Nit: duplicated header comment in
rest-client.ts.)

### F6 — [INFO · CONFIRMED] #10 no schema write; surviving DDL preserves identifiers
No migration-runner or live DDL execution added; `provision.sh` + `scripts/database/cutover/*.sh` are static
operator scripts not wired into `verify-all.mjs`/CI. Surviving baseline DDL preserves table names + stable `code`
integers (comment-only edits dropping the retired-platform naming, e.g. the legacy prefixed name → `action_reason`). Branch CLAUDE.md no longer
references `migration/assets/schema` (removed, not dangling) but doesn't clearly re-point to `database/baseline`
as canonical (minor doc gap).

**Verdict:** escalate F1–F2 before merge — the DDL move silently reverts live schema from #73/#83/#87/#89; green
gates are unreliable here because the parity fixture was reduced in lockstep.
