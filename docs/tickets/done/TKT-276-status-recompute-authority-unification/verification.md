# Verification — TKT-276: Unify the two case status-recompute authorities

## Verdict

PASS

## Evidence

- **A1 — one writer.** Both `recomputeStatus` functions delegate to `runStatusRecompute`
  (`status-recompute-core.ts`); the single `UPDATE case_ SET status_code` + `status_changed` audit +
  `maybeSuggestOverviewChase` live there. Staff and internal paths keep their observable responses
  (boolean vs `StatusRecomputeResult`) and call it with their existing parameters.
- **A2 — one ack.** The internal path routes its generation ack through `acknowledgeStatusRecompute`; the
  inline `GREATEST/LEAST` SQL is gone. `route-authority-inventory.json` still lists one `writeAuthority`
  for `status_recompute_completed_generation`.
- **Behaviour-preserving.** `node scripts/checks/check-runtime-contract.mjs` → 191/56/7/65/22, identical
  to baseline. `node scripts/checks/check-route-authority.mjs` → PASS (one internal-trust seam, no
  duplicate authority). `npm run test --workspace @cs/api` → **1107 passed** (110 files), including the
  new `status-recompute-core.test.ts` (5) that covers the internal path's suffix + no-actor + ack routing
  and the no-change / missing branches.
- **Structural delta.** Local lane +9 nonblank lines (shared-writer scaffolding vs removed duplication);
  the completed audit-residual consolidation aggregate is **−19** (TKT-275 −28 + TKT-276 +9), so the
  TKT-274 net-negative discipline is satisfied without an operator exception.
- **No live write.**

## Commands

```
npm run build --workspace @cs/api
node scripts/checks/check-runtime-contract.mjs
node scripts/checks/check-route-authority.mjs
npm run test --workspace @cs/api
```

## Pending / gaps

None.
