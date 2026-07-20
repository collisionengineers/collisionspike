# Anti-drift guards

A consolidation only stays consolidated if a future re-duplication **fails a check**. This page records
the standing guard doctrine; the decision of record is
[ADR-0033](../adr/0033-anti-drift-guard-doctrine.md).

## Guard modes

Each terminal guard uses the analysis mode that matches the mechanism it protects. A naive lexical ban is
never an accepted mode — it would false-fail the shared module itself, its fixtures, and every doc that
names the primitive, and would miss behavioural and live-state risks entirely.

| Mode | What it analyses | When to use it |
| --- | --- | --- |
| `ast-import` | TypeScript source syntax, parsed with the compiler; import bindings distinguished from local re-declarations | A production source primitive must have one home (e.g. the managed-identity mint, the route/authority inventory) |
| `import-reference` | Import/reference graph of a shared tooling internal | A shared script internal must be imported, never re-implemented, outside its home |
| `behavioural-fixture` | One shared fixture corpus run through each language's own callables; columns pinned, divergences reconciled or explicitly allowed | A rule is independently implemented in more than one language and cannot be shared |
| `machine-evidence` | Machine-readable evidence compared with a registry | The fact is live state that source cannot prove (e.g. `LIVE_FACTS.json` vs read-only evidence) |

Guards are **production-scoped** where the risk is a production property, and run under the offline
aggregate verifier (`verify-all.mjs`).

## Plan classification and the guard register

Every plan declares a validated `plan-kind` in its frontmatter:

- `feature` — delivers new product capability.
- `remediation` — fixes, reconciles, or cleans up existing state.
- `consolidation` — removes structural duplication behind a terminal drift guard.
- `governance` — establishes rules, docs, or checks with no functional change.

A **consolidation** plan additionally declares three flat fields:

- `terminal-guard` — the guard ticket (must be a member of the plan).
- `terminal-guard-command` — its `check:*` command.
- `guard-mode` — one of the four modes above.

The canonical register is **derived from this metadata**, never hand-maintained. The current register:

| Plan | Terminal guard | Mode | Command |
| --- | --- | --- | --- |
| [PLAN-007](../tickets/plans/PLAN-007-server-runtime-foundation.md) | TKT-251 | `ast-import` | `check:managed-identity-mint` |
| [PLAN-008](../tickets/plans/PLAN-008-canonical-service-routes.md) | TKT-266 | `ast-import` | `check:route-authority` |
| [PLAN-010](../tickets/plans/PLAN-010-scripts-and-tooling-dedup.md) | TKT-261 | `import-reference` | `check:scripts-dedup` |
| [PLAN-011](../tickets/plans/PLAN-011-python-doctrine-and-parity.md) | TKT-269 | `behavioural-fixture` | `check:parity` |

Regenerate the live table from metadata with `node scripts/checks/check-guard-register.mjs --json`.

## The meta-guard

[`check:guard-register`](../../scripts/checks/check-guard-register.mjs) derives the register and fails when:

- a plan is missing `plan-kind`, or declares one outside the allowed set;
- a consolidation plan is missing any terminal-guard field, or declares an invalid `guard-mode`, or names a
  terminal-guard ticket that is not a plan member;
- a non-consolidation plan declares terminal-guard fields;
- a registered command is not a package script, or is not wired into `verify-all.mjs`;
- a registered guard lacks mode-appropriate negative fixtures (a `scripts/checks/fixtures/<name>/`
  directory plus `check-<name>.test.mjs` for the source modes; a `*-parity-vectors.json` corpus with an
  allowed-divergence vector for the behavioural mode).

The meta-guard runs in CI and under `verify-all.mjs`; its negative cases are covered by
`scripts/checks/check-guard-register.test.mjs`.
