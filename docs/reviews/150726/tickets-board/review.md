# Lane C — Tickets & BOARD sync

**Scope:** the 207-ticket reconciliation + BOARD parity + the "ticket specs are authority; generated views
can't drift" invariant (#2). **Verdict:** ticket integrity is mostly sound, but there is **one confirmed
merge-breaking ID collision the passing gate cannot see.** The branch's own `check:tickets` is green *by
construction* — it only sees the branch's tickets, never main's. 4 issues + verified-clean invariants.

### C1 — [BLOCKER · CONFIRMED] `TKT-207` & `TKT-208` reuse IDs main already assigned to different tickets
The branch was cut from merge-base `81ae8fdf` (#98); main then advanced (#83/#87/#89) and independently created
`TKT-207`/`TKT-208` for different work. **Verified by direct read:**
- Branch `TKT-207` = "Build the complete repository inventory and disposition ledger" (PLAN-006, `verify`);
  main `TKT-207` = "Batch bulk case_ mutations under the registration advisory-lock budget" (PLAN-004, `backlog`).
- Branch `TKT-208` = "Catalog evidence…"; main `TKT-208` = "MCP box-root single source".

Both pairs live at **different folder paths**, so a real merge keeps both → **duplicate `TKT-207` and `TKT-208`
IDs on main**. There is **no duplicate-ID guard** in `ticket-system.mjs`/checks, and BOARD is generated from all
discovered tickets — so post-merge BOARD silently renders two rows each and the coverage gate still passes.
*Fix:* renumber the PLAN-006 tickets (and their `tickets-it-relates-to` graph) before merge.

### C2 — [MEDIUM · CONFIRMED] Branch never picked up main's newer tickets (TKT-205/206 added; TKT-154/160 moved)
`docs/tickets/now/TKT-205-repository-worktree-governance` and `TKT-206-remove-runtime-data-policy-controls` are
**absent** from the branch (they postdate the base); TKT-154/160 sit in `backlog/` on the branch but `now/` on
main. Not a dishonest branch-side status edit — a stale-base artifact. Feeds blocker #1 (rebase must regenerate
BOARD/index against current main). Merge-conflict severity PLAUSIBLE.

### C3 — [LOW · CONFIRMED] Evidence spec-text stale after SHA-store relocation
Binaries moved from each ticket's `evidence/` into `tests/fixtures/evidence/sha256/…` with a sibling
`evidence-manifest.json` (originalPath→storagePath); **bytes preserved** (3 blobs verified against original
sizes 158847/50482/16155). But specs still name in-folder paths like `` `evidence/current-dashboard.png` ``
(e.g. `TKT-155-…:19`, TKT-170). These are inline-code spans, not markdown links, so `check:docs` stays green
while the human-facing reference is stale. Traceability nit, no data loss.

### C4 — [LOW · CONFIRMED] `TKT-216` (PLAN-004 EVA route repair) bundled into this PLAN-006 reset
Mild scope-bleed — an integration ticket riding a docs/structure reset; no ID collision (216 free on main).

### Verified clean (non-findings)
- **#2 upheld.** `ticket-generate.mjs` generates BOARD.md / README index / operator-actions / per-plan progress
  from frontmatter with a `--check` **byte-identity drift gate**. Branch BOARD rows match folders/frontmatter
  (spot-checked TKT-020/207/208/154/160/216). Generated views cannot drift from the branch's own tickets.
- **Verification honesty clean.** TKT-207/210/214 all carry **"TESTED (offline)"**, sit in `verify`, and list
  explicit Pending/gaps; TKT-214 even discloses unremediated npm advisories. **No** VERIFIED-LIVE/done-from-code
  claims. All 10 PLAN-006 tickets (TKT-020, 207–215) correctly in `verify`.
- **#11 scope boundary honored.** TKT-205/206 runtime/schema changes are not bundled.

**Headline:** ship-blocker is the TKT-207/208 ID collision (C1), invisible to the green gate — rebase onto
current main and renumber the PLAN-006 tickets before merge.
