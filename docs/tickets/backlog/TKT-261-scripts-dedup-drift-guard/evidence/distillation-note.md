# Distillation note — TKT-261

**Source:** `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md`
(verification/pinning) plus the drift-avoidance rule in the series README. **Plan:** PLAN-010.

**What the guard protects:** the TKT-258 shared hash primitive and existing path normaliser (both stay
imported, not re-implemented) and the TKT-259 generated-directory predicate and set (one definition each). It
is the anti-re-duplication backstop for this plan.

**Design:** import/reference-aware (not lexical) so it does not false-flag the shared module itself or the test
fixtures; wired into `verify-all.mjs` with independent negative fixtures for (a) a local hash-core
re-implementation and (b) a second generated-directory policy or predicate bypass. Sibling `*.test.mjs` is
the established pattern under `scripts/checks/`. Ship last (after TKT-258–260) so it passes on merge.

PLAN-010 owns both assertions and their fixtures; completion does not depend on an unminted plan.
