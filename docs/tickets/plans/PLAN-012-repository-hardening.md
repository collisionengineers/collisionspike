---
id: PLAN-012
title: Repository hardening and standing drift guards
status: active
tickets: [TKT-270, TKT-271, TKT-272, TKT-273, TKT-274]
depends-on: [PLAN-007, PLAN-008, PLAN-009, PLAN-010, PLAN-011]
---

# PLAN-012 — Repository hardening and standing drift guards

## Outcome

The repository is audited for any duplication or drift the series did not already remove, and a standing set
of anti-drift guards, structure rules, and integrity checks makes the whole class of problems — silent
duplication, multi-path capabilities, cross-language divergence, and stale live-state — non-recurring. After
this plan, re-introducing any of them fails a check.

## Locked structure (the standing anti-drift rule set)

- **One home per mechanism.** A mechanism duplicated three or more times earns a shared module; single-caller
  wrappers are inlined; every consolidation reports a net-negative file/LOC delta.
- **Guards are AST/import-aware and language-scoped.** No lexical bans (they false-flag other languages and
  docs). Every plan ships its terminal guard wired into `verify-all.mjs`, and a meta-check asserts each is
  present.
- **Package boundary.** `@cs/domain` is browser-safe and SDK-free; `@cs/server-runtime` is server-only and
  SDK-allowed; the two never merge, enforced by the production-dependency bundle boundary.
- **One authoritative writer per transition; one registered path per capability** (the route/authority guard).
- **Cross-language duplication that cannot be shared is pinned by behavioural parity guards**, not merged.
- **`LIVE_FACTS.json` is the sole exact live-state registry**, reconciled to a fresh read-only inventory; the
  governance ledgers stay byte-preserving.
- **Governance artifacts stay reviewable at the distillation boundary** — the `workingspace/** -diff`
  rendering must not hide the plan/ticket derivation in PR review.

## Locked decisions

- This plan builds nothing new functionally; it **audits** and it **adds checks and rules**. No live write.
- It is the **tail** of the series: it harvests the terminal guards authored by PLAN-007
  (`IDENTITY_ENDPOINT`), PLAN-008 (route/authority), PLAN-010 (single-source), and PLAN-011 (behavioural
  parity), and generalises them — it does not re-implement them.
- The hardcore audit is **read-only**; any residual finding becomes a new ticket, not an in-place change here.

## Sequence

1. TKT-270 runs the hardcore repository duplication/drift audit (read-only, subagent-driven): inventory every
   remaining duplicate mechanism, multi-path capability, cross-language divergence, and stale live-state
   beyond what PLAN-007–011 remove, and file each residual finding as a new ticket. The audit certifies
   coverage or names the gaps.
2. TKT-271 establishes the anti-drift guard doctrine and the meta-guard: document the guard convention
   (AST/import-aware, production-scoped, language-aware) as a governance page and ADR, register the terminal
   guards from PLAN-007/008/010/011, and add a meta-check asserting every plan's terminal guard is wired into
   `verify-all.mjs`.
3. TKT-272 records the repository-structure and package-boundary rules: extend PLAN-006's locked structure
   with the `@cs/domain` vs `@cs/server-runtime` boundary and the single-source repo-shape policy (from
   PLAN-010), enforced by `check:production-dependencies` and the layout check.
4. TKT-273 adds the `LIVE_FACTS` and ledger integrity standing check: a gate that fails when `LIVE_FACTS.json`
   diverges from a fresh read-only inventory beyond tolerance, and when a governance ledger is not
   byte-preserving — the estate anti-drift generalisation from PLAN-009.
5. TKT-274 restores reviewability at the distillation boundary and records the rule-of-three doctrine:
   address the `workingspace/** -diff` rendering so the plan/ticket derivation stays diff-visible in PR review
   (Gate 0 item 11), and record the rule-of-three plus net-negative-structure discipline as a standing check.

## Gates

- Depends on **PLAN-007/008/009/010/011** — it harvests their terminal guards and generalises them, so it
  should land after they distill, when the meta-guard can reference real guards.
- The audit (TKT-270) is read-only; residual findings are new tickets, not in-plan changes.

## Close-out

The plan closes only when all members are `done`: the hardcore audit is filed with either a clean coverage
certificate or residual tickets; the anti-drift guard doctrine and meta-guard are in place and every plan's
terminal guard is registered and wired into `verify-all.mjs`; the repository-structure and package-boundary
rules are recorded and enforced; the `LIVE_FACTS`/ledger integrity check is gating; and the
distillation-boundary reviewability plus the rule-of-three discipline are in place. A synthetic re-introduction
of any removed drift class — a second `IDENTITY_ENDPOINT` mint, a duplicate capability route, a second auth
helper, a re-implemented inventory core, a cross-language rule divergence, or a stale `LIVE_FACTS` value —
fails a check. No member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/5 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 5 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-270](../backlog/TKT-270-hardcore-repository-drift-audit/TKT-270-hardcore-repository-drift-audit.md) | backlog | Run the hardcore repository duplication and drift audit |
| [TKT-271](../backlog/TKT-271-anti-drift-guard-doctrine-and-meta-guard/TKT-271-anti-drift-guard-doctrine-and-meta-guard.md) | backlog | Establish the anti-drift guard doctrine and meta-guard |
| [TKT-272](../backlog/TKT-272-repository-structure-and-package-boundary-rules/TKT-272-repository-structure-and-package-boundary-rules.md) | backlog | Record and enforce the repository-structure and package-boundary rules |
| [TKT-273](../backlog/TKT-273-live-facts-and-ledger-integrity-check/TKT-273-live-facts-and-ledger-integrity-check.md) | backlog | Add the LIVE_FACTS and ledger integrity standing check |
| [TKT-274](../backlog/TKT-274-distillation-reviewability-and-rule-of-three/TKT-274-distillation-reviewability-and-rule-of-three.md) | backlog | Restore distillation-boundary reviewability and record the rule-of-three |
<!-- /GENERATED:PROGRESS -->
