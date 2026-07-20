# Changes — TKT-276: Unify the two case status-recompute authorities

## One authoritative writer (A1)

- New `services/data-api/src/features/cases/status-recompute-core.ts` exports `runStatusRecompute` — the
  single authoritative writer of `case_.status_code` from a readiness recompute. Both `recomputeStatus`
  implementations now delegate to it:
  - `features/cases/case-support.ts` (staff) injects its `loadCaseFull` prefill probe + `loadCaseFullUsing`
    FOR UPDATE loader, an `actor`, and no generation ack; it returns `result.found` (boolean, unchanged).
  - `features/inbound/internal/service-support.ts` (internal/MSI) injects its `CASE_SELECT` preview +
    FOR UPDATE loader that layers `manualIntakeEvidenceState` onto the readiness input, the
    `' (internal recompute)'` audit suffix, no actor, and the durable generation.
- The `acknowledgeGeneration` vs `actor` difference, the audit suffix, the prefill probe, and the loader
  are the only parameters; the transition, `status_changed` audit, and `maybeSuggestOverviewChase` have
  one implementation.

## One generation-ack implementation (A2)

- `service-support.recomputeStatus` no longer re-inlines the `GREATEST/LEAST` generation-ack SQL; the core
  routes the ack through the canonical `acknowledgeStatusRecompute` (`status-recompute.ts`), the single
  `writeAuthority` for `status_recompute_completed_generation`. The SQL was byte-identical, so the ack
  outcome is unchanged.

## Coverage

- New `status-recompute-core.test.ts` exercises the unified writer directly (status change + audit suffix
  + actor + chase; the internal path's `(internal recompute)` suffix, no actor, and ack routing; the
  no-change, prefill-missing, and loader-missing branches) — closing the previously-untested internal
  recompute path.

## Result

`check:runtime-contract` byte-identical (191 routes, 56 DTOs, 7 schemas, 65 Postgres tables, 22 code
tables). `check:route-authority` PASS (still one internal-trust seam, no duplicate authority). All 1107
data-api tests pass.

**Structural delta.** This lane is locally net **+9** nonblank lines: the shared parametrised writer's
scaffolding (typed options + injected loaders) slightly outweighs the removed duplication in raw lines,
while resolving a genuine duplicate authority. Per the TKT-274 discipline, the completed audit-residual
consolidation **aggregate** is net-negative — TKT-275 (−28) + TKT-276 (+9) = **−19** — so no operator
non-negative exception is required. No live write.
