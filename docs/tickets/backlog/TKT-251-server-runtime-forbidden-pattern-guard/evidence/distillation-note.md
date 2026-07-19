# Distillation note — TKT-251

**Source:** `01-server-runtime-foundation.md` ticket 5 (drift guard) + reconciled review Gate 0 item 12.
**Plan:** PLAN-007.

**Requirement:** the guard must be **import/AST-aware, not lexical**, and **scoped to production TypeScript**.
A naive `grep IDENTITY_ENDPOINT` would falsely flag the Python function services (which legitimately mint
their own tokens under their own doctrine, owned by PLAN-011), the `/tests` tree, and documentation that
mentions the variable. So the guard must parse TypeScript imports/identifiers and assert the token-mint
surface lives only in `packages/server-runtime`.

**Sequencing:** ship this last (after TKT-248–250 remove the nine copies) so it passes on merge; a negative
fixture proves it fails on a synthetic re-introduction. Wire into `verify-all.mjs` (the aggregate offline
runner) and CI.

**Generalisation:** PLAN-012 harvests this guard, the PLAN-008 authority/route guard, and the PLAN-010
inventory/repo-shape guards into the standing anti-drift rule set so the pattern is enforced repository-wide,
not per plan.
