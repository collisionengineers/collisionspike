---
id: PLAN-012
title: Repository hardening and standing drift guards
status: active
tickets: [TKT-270, TKT-271, TKT-272, TKT-273, TKT-274]
depends-on: [PLAN-007, PLAN-008, PLAN-009, PLAN-010, PLAN-011]
plan-kind: governance
derivation-summary: docs/tickets/plans/PLAN-012.derivation.md
---

# PLAN-012 — Repository hardening and standing drift guards

## Outcome

The repository is audited for duplication and drift the series did not already remove. Each mechanically
governable risk is assigned a structural, behavioural, or evidence-comparison guard appropriate to that risk;
intentional boundaries and non-mechanical exceptions remain explicit and reviewable.

## Locked structure (the standing anti-drift rule set)

- **One home per equivalent mechanism.** Three or more structurally equivalent implementations trigger a
  consolidation review; they share a home only when their contract, owner, lifecycle, security policy, and
  failure semantics are compatible. Intentional differences are recorded instead of flattened.
- **Guards use the mechanism's real structure.** TypeScript source rules use AST/import analysis, shared
  tooling rules use import/reference analysis, cross-language rules use behavioural fixtures, and live-state
  rules compare machine-readable evidence. Naive lexical bans are not accepted.
- **Package boundary.** `@cs/domain` is browser-safe and SDK-free; `@cs/server-runtime` is server-only and
  SDK-allowed. The production-dependency check enforces both the SPA-to-server boundary and the
  domain-to-server dependency boundary.
- **One authoritative writer per transition and caller/auth/action lane.** Explicit BFF-to-service delegation
  and intentionally distinct protocols remain valid.
- **Cross-language duplication that cannot be shared is pinned by behavioural parity guards**, not merged.
- **`LIVE_FACTS.json` is the sole exact live-state registry.** A committed machine-readable evidence snapshot
  and field map support offline verification; a separate credential-gated read-only command compares the
  governed fields with Azure.
- **Governance artifacts stay reviewable at the distillation boundary.** Every new plan carries a derivation
  summary even when its user-owned source draft is unchanged; `workingspace/` bytes and attributes stay
  untouched.
- **Structural deltas are decision evidence, not a semantic proxy.** Implementation lanes report file and
  nonblank-line deltas. The completed consolidation is net-negative overall or records an operator-approved
  exception; an intermediate scaffold PR is not rejected solely because its local delta is positive.

## Locked decisions

- This plan builds nothing new functionally; it **audits** and it **adds checks and rules**. No live write.
- It is the **tail** of the series: it registers the completed terminal guards from PLAN-007
  (`IDENTITY_ENDPOINT`), PLAN-008 (route/authority), PLAN-010 (single-source), and PLAN-011 (behavioural
  parity). It does not re-implement them or claim they all use the same analysis technique.
- The hardcore audit's queries are **read-only**. Its repository writes are limited to the dated report,
  its required changes/verification evidence, finding-to-owner references in existing or new ticket specs,
  lifecycle stubs for new tickets, and generated ticket/governance views needed to keep those artifacts in
  parity.
- `verify-all.mjs` remains offline. A workflow must not label an offline run as proof of live-registry parity.

## Sequence

1. TKT-270 runs the hardcore repository duplication/drift audit (read-only queries, subagent-driven):
   inventory every remaining equivalent mechanism, duplicate authority within a lane, cross-language
   divergence, tracked-doc/registry disagreement, and registry/evidence disagreement beyond what
   PLAN-007–011 remove. Each finding maps to an exact existing owner, a new ticket, or an intentional
   exception.
2. TKT-271 establishes the anti-drift guard doctrine and the meta-guard: document the guard convention
   as a governance page and ADR, add required machine-readable plan classification and terminal-guard
   metadata, register the guards from PLAN-007/008/010/011, and assert each classified consolidation plan's
   command is wired into the offline verification suite.
3. TKT-272 records the repository-structure and package-boundary rules: extend PLAN-006's locked structure
   with the `@cs/domain` vs `@cs/server-runtime` boundary and the single-source repo-shape policy (from
   PLAN-010), enforced in both dependency directions by `check:production-dependencies` and the layout check.
4. TKT-273 adds the `LIVE_FACTS` evidence and comparison contract: an offline committed-snapshot check, a
   separate credential-gated Azure comparison, and explicit reuse of the existing inventory and
   reconciliation checks without duplicating their algorithms.
5. TKT-274 restores reviewability at the distillation boundary and records the rule-of-three doctrine:
   require a derivation summary for changed or unchanged source drafts without touching `workingspace/`, and
   record the equivalence-qualified rule-of-three plus completed-lane structural-delta discipline.

## Gates

- The plan document depends on **PLAN-007/008/009/010/011** being distilled. Implementation is more strictly
  gated: TKT-251/261/266/269 must be `done` before TKT-271; TKT-247/259 before TKT-272; and TKT-257/258 before
  TKT-273.
- TKT-270's report lands before TKT-271–274 use its findings.
- Audit queries and Azure comparison are read-only. No member changes `workingspace/`, deploys, or mutates
  cloud, database, mailbox, or Archive state.

## Close-out

The plan closes only when all members are `done`: the audit records complete scoped coverage; every residual
finding has an owner or exception; classified consolidation plans have valid terminal-guard metadata and
wiring; both package-boundary directions are enforced; the offline registry/evidence check and genuine
credential-gated live comparison are distinct and passing; existing ledger checks remain canonical; and every
new plan's derivation is reviewable without changing user-owned drafts. Negative fixtures cover each registered
guard mode. Non-mechanical risks remain named rather than being falsely certified by a lexical or file-count
check. No member performs a live write.

## Artifacts

- [Derivation summary](./PLAN-012.derivation.md)

<!-- GENERATED:PROGRESS -->
## Computed progress

**2/5 done (40%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 2 |
| Next | 0 |
| Backlog | 3 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-270](../done/TKT-270-hardcore-repository-drift-audit/TKT-270-hardcore-repository-drift-audit.md) | done | Run the hardcore repository duplication and drift audit |
| [TKT-271](../done/TKT-271-anti-drift-guard-doctrine-and-meta-guard/TKT-271-anti-drift-guard-doctrine-and-meta-guard.md) | done | Establish the anti-drift guard doctrine and meta-guard |
| [TKT-272](../backlog/TKT-272-repository-structure-and-package-boundary-rules/TKT-272-repository-structure-and-package-boundary-rules.md) | backlog | Record and enforce the repository-structure and package-boundary rules |
| [TKT-273](../backlog/TKT-273-live-facts-and-ledger-integrity-check/TKT-273-live-facts-and-ledger-integrity-check.md) | backlog | Add the LIVE_FACTS and ledger integrity standing check |
| [TKT-274](../backlog/TKT-274-distillation-reviewability-and-rule-of-three/TKT-274-distillation-reviewability-and-rule-of-three.md) | backlog | Restore distillation-boundary reviewability and record the rule-of-three |
<!-- /GENERATED:PROGRESS -->
