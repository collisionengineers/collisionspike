---
name: pr73-tkt154-rebased-remediated
description: PR #73 (TKT-154 constrained MCP image ingestion) was rebased onto post-#99 main, review-remediated across 4 lanes, and MERGED to main 2026-07-15 (merge commit 2d98bdc3); shipped dark
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c7a881b-5f57-4ff9-92e3-c5384ff58f71
---

**PR #73** `codex/tkt-154-mcp-image-ingestion` (TKT-154, constrained MCP image-ingestion lane) was rebased onto post-#99 `main` (base `ae3bdb48`) and remediated on 2026-07-15, then **MERGED to `main` (merge commit `2d98bdc3`, all CI green)** and the branch deleted. Offline-gates were green at merge (api 835 / orch 476 / domain 1196 / SPA 525 tests; build; check-tickets 201; check-doc-links). It stays **offline-proven / dark** — `MCP_IMAGE_INGEST_ENABLED` is NOT flipped; live provisioning/deploy/proof remain gated (ticket stays in `now`, verdict PENDING).

**Review outcome:** no BLOCKERs; the security-critical core was verified sound (principal-bound sessions, fail-closed authz split, raster-only-capped-before-decode validation, fail-closed Box-root re-attestation, atomic rate limit, race-free registration binding). Remediated in 4 lanes: (A) `initializing`-session short TTL + cap eviction + bounded `readonly_staff` body; (B) classifier prompt scoped to preserve plate OCR + regression; (C) delta renamed `2026-07-13-tkt154-…` to sort after its tkt165 dep + canonical `195` constraint naming + `case_` lock-budget docs; (Evidence) removed retired-reciprocal-review references + phantom 48-test suite + stale counts — see [[reciprocal-ai-review-retired]].

**Deferred follow-ups (backlog, PLAN-004):** **TKT-207** (batch bulk `case_` mutations under the per-row registration advisory-lock budget) and **TKT-208** (consolidate the ~5 MCP Box test-root sources to one constant + Python `BOX_ALLOWED_ROOT_ID` checklist gap). Both fail-safe/closed today.

**How to apply:** if picking this up, the local branch was `pr73-rebase`. The remaining step is the operator merge decision (merge-commit style per repo convention). The other three of "the four" PRs (drafts #83/#87/#89) still need the same rebase-onto-main treatment.
