# Checklist — Review 150726 (PR #100 `PLAN-006` repository reset)

Preliminary sign-off sheet for `bfb3fa408e`. **Historical verdict: REQUEST CHANGES.** The current Stage-3
state is in the [final review](./final-review.md). Reproduce the gates with `node verify-all.mjs` +
`node scripts/checks/*.mjs` in a worktree of the branch tip; evidence in [`evidence/`](./evidence/).

## Hard merge blockers
| # | Blocker | State | Owner | Gate-visible? |
|---|---|---|---|---|
| 1 | Stale base (57 behind) → reverts #73/#83/#87/#89 (5 tables, corpus seed, 4 migrations, 2 SPA features + routes) | **OPEN** | author (rebase + re-apply features into new layout) | **No** |
| 2 | TKT-207/208 ID collision with main's PLAN-004/box tickets | **OPEN** | author (renumber PLAN-006 tickets) | **No** |
| 3 | `mergeable=CONFLICTING`, no approving review | **OPEN** | author (clears with #1) + reviewer | Yes (GitHub) |

## PLAN-006 locked decisions — audit result
| # | Locked decision | Result | Evidence |
|---|---|---|---|
| 1 | Locked tree structure | ✅ PASS | `check:layout` 2889 paths |
| 2 | Ticket specs are authority; generated views can't drift | ✅ PASS (generation is `--check` byte-identical) | Lane C |
| 3 | `LIVE_FACTS.json` + `live-environment.md` sole env authority | ✅ PASS (moved, co-located, no leakage) | Lane B |
| 4 | Git history is recovery path; no archive stubs | ⚠️ **partial** — true, but the gate meant to *prove* losslessness cannot (M1) | Lane A |
| 5 | Evidence SHA-256, manifest preserves every use + filename | ✅ PASS (0/550 unmapped, byte-verified) | Lane A |
| 6 | 4 workingspace files move as a dir, exact names+hashes | ✅ PASS (identical blob OIDs) | Lane A |
| 7 | Runtime routes/DTOs/auth/resource-names/db-ids/numeric-codes unchanged | ✅ PASS **vs the stale base** (2 disclosed TKT-215 deltas); ❌ **not vs current main** (blocker #1 adds main's newer routes/tables) | Lanes D, F |
| 8 | No fabricated records / fixtures imported into production | ✅ PASS (real AST graph, 0 prod fixture imports) | Lane D |
| 9 | `.agents` canonical; adapters generated | ✅ PASS (byte-for-byte `--check`) | Lane G |
| 10 | No deployment / cloud / mailbox / DB write | ✅ PASS (static .sql only; no runner wired) | Lane F |
| 11 | TKT-205 preserved not imported; TKT-206 advisory | ✅ PASS (absent from branch; runtime policy not bundled) — TKT-216 is minor scope-bleed | Lane C |

## Objective gates (reproduced locally on `ba675336`)
- `node verify-all.mjs` → **34 passed, 0 failed** (TS builds+tests ×4 workspaces, 6 Python suites, all structural checks). ✅
- Full offline `check:*` battery → all PASS (see [`evidence/gate-battery.md`](./evidence/gate-battery.md)). ✅
- Caveat: every green gate is computed on the **post-reset tree**; several (reconciliation, runtime-contract,
  database parity) are self-referential and cannot detect blocker #1. Green ≠ complete.

## Per-lane sign-off
| Lane | Issues (C/Maj/Med/Min) | Changes made and actions taken |
|---|---|---|
| A · Reconciliation | 0 / 3 / 0 / 1 | Audited `reconcile-repository-reset.mjs`; confirmed tautological validator (M1). Recommend strengthening to byte-assert keep/move + commit `compare.mjs` proof. **No code changed by this review.** |
| B · Docs integrity | 0 / 0 / 2 / 2 (+2 High precedence) | Confirmed precedence violations (190626 screenshots, ADR rewrites) and clean migrations (requirements→product, MAINTENANCE→governance). Recommend restoring/annotating the binding review + ADR amendments. |
| C · Tickets | **1 blocker** / 0 / 1 / 2 | Verified TKT-207/208 collision against main. Recommend renumber + rebase-regenerate BOARD. Verification honesty confirmed clean. |
| D · Runtime surface | 0 / 0 / 1 / 3 | Independently baseline-diffed routes/DTOs/codes → clean modulo 2 disclosed deltas. Recommend committing the baseline or anchoring the gate to it. |
| E · Python / vendor pin | 0 / 0 / 3 / 1 | Confirmed vendored engine AST-equal + pin valid; flagged in-repo docstring edits (ADR-0018) + stale PROVENANCE. `evavalidation` removal confirmed **intentional** (TKT-215). |
| F · SPA + DDL | **1 blocker** (DDL reversion) / 0 / 2 / 2 | Confirmed 5-table + seed + migration + SPA-component drops trace to the stale base. SPA move itself clean. Feeds blocker #1. |
| G · Agents / CI | 0 / 2 / 0 / 3 | Built the CI-subsumption table; found the parser-vendor-source + verify-live drops (M2) and pre-push removal. Adapter generation sound. |
| H · Purge / outputs | 0 / 0 / 0 / 3 | **Red flag disproven** — forbidden-signatures has 35 real signatures. Flagged the mislabeled message + missing non-empty guard. Output removal clean. |

## Honesty notes (per house watch-outs)
- The reset is **not** a botched job — its structural engineering is largely sound and several suspected
  defects (forbidden-signatures vacuity; runtime-surface loss; fixtures-in-prod) were **investigated and
  cleared**. The blockers are about *staleness* and *false-assurance gates*, not sloppy moves.
- All "removed content" findings are **git-recoverable**; they are flagged where the *live tree* now says less
  than a higher-precedence source (binding review / ADR) or where a gate gives false confidence.
- This review performed **no** live Azure calls and changed **no** repository code; it only authored this
  folder. Merge/verification remains PENDING on the author clearing blockers 1–3 and a Stage-3 re-review.
