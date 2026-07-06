# Operator plan excerpt — Precondition (blocker): terminal commands blocked by a failing hook

> From `PLAN-inspection-address-repair.md` (investigation/planning session 2026-07-06). The full
> plan is preserved at
> [TKT-075 evidence](../../TKT-075-inspection-corpus-pipeline/evidence/operator-note.md).

**All terminal commands are currently blocked** — the `.cursor/hooks/cursor-box-scope-guard.mjs`
hook times out (60s) and fails closed, rejecting every Shell call. Fix or disable that hook
before implementation (nothing can build/test/deploy until then).

## Live confirmation (2026-07-06, this distillation session)

A trivial `Get-ChildItem` shell call during ticket distillation was rejected with:

```
Rejected: Command execution was blocked by a hook: Tool blocked because this hook is configured
to fail closed (block when it fails). Hook ".cursor/hooks/cursor-box-scope-guard.mjs" returned
no output.
```

— i.e. the guard blocks **every** command (not just Box commands), because the adapter produced
no output before the harness's fail-closed deadline.
