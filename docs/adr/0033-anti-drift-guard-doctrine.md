# ADR-0033 — Standing drift is caught by a modality-appropriate terminal guard, registered from plan metadata

**Status:** Accepted 2026-07-20 per [PLAN-012](../tickets/plans/PLAN-012-repository-hardening.md) ([TKT-271](../tickets/done/TKT-271-anti-drift-guard-doctrine-and-meta-guard/TKT-271-anti-drift-guard-doctrine-and-meta-guard.md)).

## Decision

A consolidation — collapsing duplicated code, tooling, or state to a single home — is durable only when a
**terminal drift guard** fails a future re-duplication. Each guard uses the analysis mode that matches the
mechanism it protects; a naive lexical ban is **not** an accepted mode. Four modes are recognised:

- **`ast-import`** — AST/import analysis of TypeScript source syntax. The guard parses each file with the
  TypeScript compiler and inspects real syntax nodes, distinguishing an import binding from a local
  re-declaration. Used for source-shape single-source rules (PLAN-007's managed-identity mint boundary,
  [TKT-251](../tickets/done/TKT-251-server-runtime-forbidden-pattern-guard/TKT-251-server-runtime-forbidden-pattern-guard.md);
  PLAN-008's route/authority inventory,
  [TKT-266](../tickets/done/TKT-266-route-authority-inventory-guard/TKT-266-route-authority-inventory-guard.md)).
- **`import-reference`** — import/reference analysis of a shared-source policy: the shared internal must be
  **imported**, never re-implemented, outside its one home (PLAN-010's scripts single-source guard,
  [TKT-261](../tickets/done/TKT-261-scripts-dedup-drift-guard/TKT-261-scripts-dedup-drift-guard.md)).
- **`behavioural-fixture`** — cross-language behavioural fixtures: one shared corpus is run through each
  language's own callables and the columns are pinned, with each real difference either reconciled or
  recorded as an explicitly approved allowed divergence (PLAN-011's vendored-parser parity guard,
  [TKT-269](../tickets/done/TKT-269-vendored-parser-cross-language-parity-guard/TKT-269-vendored-parser-cross-language-parity-guard.md)).
- **`machine-evidence`** — machine-readable evidence comparison for live state, where source cannot prove
  the fact (registry-versus-evidence and credential-gated live comparison; owned by PLAN-012's
  `LIVE_FACTS` integrity work).

Guards are **production-scoped** where the risk is a production property (the managed-identity and
route/authority guards inspect production graphs, not tests) and never rely on string matching that a
comment or doc mention would trip.

Plan classification is machine-readable. **Every plan carries a validated `plan-kind`**
(`feature` / `remediation` / `consolidation` / `governance`). A **consolidation** plan additionally
declares three flat frontmatter fields the ticket parser already reads: `terminal-guard` (the guard
ticket, which must be a member of the plan), `terminal-guard-command` (its `check:*` command), and
`guard-mode` (one of the four modes above). The **canonical guard register is derived from that metadata**,
never hand-maintained. A meta-guard
([`check:guard-register`](../../scripts/checks/check-guard-register.mjs)) fails when a plan is missing
`plan-kind`, a consolidation plan is missing guard metadata, a terminal-guard ticket is not a plan member,
a registered command is absent from the offline aggregate verifier (`verify-all.mjs`), or a registered
guard lacks mode-appropriate negative fixtures. It runs in CI.

## Rationale

The five-plan hardening series produced four terminal guards that deliberately use **different** proof
techniques, because the risks differ: a re-implemented TypeScript primitive is an AST property, a
re-declared shared tooling internal is an import property, a silently diverging Python/TypeScript rule is a
behavioural property, and a stale live fact is not a source property at all. A single universal guard —
lexical or one-size AST — would raise false positives on the shared module, its fixtures, and every doc
that names the primitive, and would still miss the behavioural and live-state classes entirely.

Before this decision the guards existed but plan frontmatter did not identify consolidation plans or their
guard. A future plan could quietly omit itself from a hand-kept list with nothing to catch the omission,
and nothing distinguished a plan that legitimately needs no terminal guard from one that forgot. Deriving
the register from required metadata makes the omission itself a gate failure, and asserting the command is
wired into `verify-all.mjs` prevents a guard from being declared but never run.

## Consequences

`docs/governance/anti-drift-guards.md` records this doctrine for human readers and links the meta-guard.
PLAN-007/008/010/011 are backfilled with their `plan-kind: consolidation` and terminal-guard triples, and
every other plan carries its `plan-kind`. The parity guard is wired as a first-class `check:parity` command
so all four terminal guards register uniformly. Adding a new consolidation plan without a valid, wired,
fixture-backed terminal guard is now a gate failure; classifying a plan and choosing its guard mode is a
required, reviewable authoring step. Changing this doctrine — for example, admitting a lexical guard mode
or dropping the metadata requirement — would require a new ADR or a dated superseding amendment.
