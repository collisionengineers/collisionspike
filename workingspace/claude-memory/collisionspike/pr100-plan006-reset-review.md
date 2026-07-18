---
name: pr100-plan006-reset-review
description: PR
metadata: 
  node_type: memory
  type: project
  originSessionId: 519d560c-d2f4-4442-96e1-82d8fe1ba9a7
---

PR #100 = `PLAN-006: reset repository structure and documentation` (branch `codex/plan-006-repository-reset`,
Codex-authored) — a whole-tree monorepo restructure (api/orchestration/functions→services/*, mockup-app→apps/web,
migration→database/*, docs slimmed, evidence→SHA-256 store). Reviewed 2026-07-15 via a 10-lane multi-agent audit;
binding-review record authored at **`docs/reviews/150726/`**. **Verdict: REQUEST CHANGES.**

**Ship-blockers (both invisible to the green CI — every gate fixture/snapshot was regenerated against the reduced
tree):**
1. **Stale base → feature reversion.** Branch is 57 behind (merge-base `81ae8fdf`); its restructure omits
   #73/#83/#87/#89's work — 5 tables (capture_session, mcp_http_session, mcp_image_ingest_rate_limit,
   archive_holding, evidence_deletion), the reference-corpus seed (910_seed_corpus.sql), 4 migrations, 2 SPA
   components + their routes. Confirmed ABSENT at the merge-base. A naïve merge/rebase reverts them; the rebase is
   NOT mechanical — it must re-apply 57 commits into the new layout, then re-review.
2. **TKT-207/208 ID collision.** Branch's PLAN-006 TKT-207/208 reuse IDs main gave different tickets (PLAN-004
   bulk-case-lock; MCP box-root). Different paths → merge keeps both, no dup-ID guard. Renumber before merge.

**Majors:** reconcile-repository-reset "0 unexplained" gate is tautological (can't detect content loss — this is
WHY blocker 1 is invisible; the real `.plan-006-baseline/compare.mjs` proof was removed from HEAD); CI (`ci.yml`,
which replaced docs.yml+capture-contract.yml) dropped the cross-repo parser vendor-source job + verify-live;
precedence violations (reset deleted 33 binding-review 190626 screenshots + rewrote all 25 ADRs, incl. ADR-0013's
image-based-prefill amendment).

**Investigated and CLEARED (don't re-flag):** runtime surface routes/DTOs/numeric-codes independently
baseline-diffed clean (modulo TKT-215's disclosed evavalidation retirement); evidence catalog lossless (0/550);
forbidden-references genuinely populated (35 hashed signatures — "No configured signatures found" is a mislabeled
clean-tree message, NOT vacuous); no fixtures in prod (real AST graph); SPA assets byte-identical; `verify-all`
34/34. Related: [[pr89-tkt034-landed-dark]], [[windows-worktree-esbuild-lock-cleanup]].
