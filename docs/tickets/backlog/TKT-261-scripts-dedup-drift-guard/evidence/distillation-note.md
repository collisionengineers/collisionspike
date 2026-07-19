# Distillation note — TKT-261

**Source:** `04-scripts-and-tooling-dedup.md` (verification/pinning) + reconciled review Gate 0 item 12.
**Plan:** PLAN-010.

**What the guard protects:** the TKT-258 shared hash/normalise core (stays imported, not re-implemented) and
the TKT-259 single generated-directory set (one definition). It is the anti-re-duplication backstop for this
plan.

**Design:** import/reference-aware (not lexical) so it does not false-flag the shared module itself or the
test fixtures; wired into `verify-all.mjs` with a negative fixture (sibling `*.test.mjs` is the established
pattern under `scripts/checks/`). Ship last (after TKT-258–260) so it passes on merge.

**Generalisation:** PLAN-012 harvests this guard, PLAN-007's `IDENTITY_ENDPOINT` guard, and the PLAN-008
route/authority guard into the standing repository-wide anti-drift rule set.
