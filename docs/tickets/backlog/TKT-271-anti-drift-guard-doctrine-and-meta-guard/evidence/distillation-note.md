# Distillation note — TKT-271

**Source:** the four plans' terminal-guard tickets + reconciled review Gate 0 item 12. **Plan:** PLAN-012.

**The four terminal guards to register + generalise after implementation:**
- TKT-251 (PLAN-007) — AST/import analysis for managed-identity mints outside `packages/server-runtime`.
- TKT-261 (PLAN-010) — import/reference analysis for the single-source inventory and repo-shape policies.
- TKT-266 (PLAN-008) — AST/import route inventory for authority within a caller/auth/action lane, with explicit
  delegation.
- TKT-269 (PLAN-011) — cross-language behavioural parity for parser rules vs `@cs/domain`.

**Doctrine to record (ADR + governance page):** use the structure that corresponds to the contract. Syntax
rules use AST/import analysis; shared-source rules use import/reference analysis; cross-language contracts
pin observable behaviour; live facts compare machine evidence. A naive lexical ban can false-flag other
languages and docs.

**Machine-readable classification:** require a `plan-kind` on every plan. Consolidation plans additionally
declare flat `terminal-guard`, `terminal-guard-command`, and `guard-mode` fields. `check:tickets` validates
them, and the canonical register is derived from the plan corpus so an omitted hand-list entry cannot hide a
missing guard.

**Implementation gate:** TKT-251/261/266/269 must be `done` before this ticket certifies their command and
fixture wiring.
