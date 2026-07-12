---
id: TKT-020
title: Stale-plan cleanup + root-doc reconciliation
status: now
priority: P2
area: docs
tickets-it-relates-to: [TKT-019]
research-link: docs/plans/work-todo-spike/docs-cleanup/research/plans-dir.md
---

# Stale-plan cleanup + root-doc reconciliation

## Problem
`docs/plans/` and several root docs still describe the decommissioned Power Platform era (Dataverse /
Power Automate / Code App / `pac` / CCG) as if live, and carried a stale intake/Box/mailbox story that
predated the 2026-06-29 production cutover.

## Evidence
The live system is the **Azure PaaS** stack (Postgres / Functions / SWA); Power Platform was deprovisioned
2026-06-27. Verified-live state: **intake is LIVE on the production mailbox set info@ + engineers@ + desk@**
(digital@ removed), 3 Graph **PUSH** subscriptions, the durable renewer RESOLVED the expiry time-bomb;
**Box is LIVE** (JWT Server Auth, `BOX_*` gates on); `ENRICHMENT_ENABLED` + `PDF_MAPPER_ENABLED` true —
all per the registry [live-environment.md](../../../architecture/live-environment.md) / [`LIVE_FACTS.json`](../../../../LIVE_FACTS.json).

## Proposed change (delivered)
Added HISTORICAL banners to the confirmed-stale Power-Platform-era plan files (preserving the domain
knowledge); reconciled `CURRENT_STATUS.md` / `ROADMAP.md` / `README.md` / `AGENTS.md` / `CLAUDE.md` and the
delta-poll wording in `docs/architecture/microsoft-stack.md` / `docs/README.md` / `docs/activation` to the
verified-live state; replaced stale `OPEN_ITEMS.md` references with `ROADMAP.md` / `docs/gated.md`; kept
all live numbers in the registry only.

## Acceptance
No active doc routes a reader down a decommissioned path or asserts the pre-cutover intake state;
`node scripts/check-doc-links.mjs` stays green (links / orphans / leakage).

## Reopened follow-up — 2026-07-12

The repository has changed materially since this ticket closed and concrete ticket/registry contradictions now exist. Perform a fresh whole-repository truth pass after the production-readiness work lands.

### Acceptance
- A machine-assisted inventory covers root documents, `docs/**`, ADRs, runbooks, diagrams, ticket indexes/plans, API contracts, environment examples, comments that claim runtime behavior, and linked sibling/plugin guidance.
- Every present-tense feature, gate, endpoint, mailbox, archive path, resource name and deployment statement is reconciled against the current code and read-only live evidence; volatile facts remain in the registry rather than being copied into prose.
- Historical Power Platform material stays clearly banded as historical and cannot be mistaken for an active deployment or command path.
- The documented intake, parsing, enrichment, evidence, archive, MCP, chaser, readiness, submission and remediation lifecycles match the implemented and deployed paths, including honest unresolved gaps.
- Contradictory ticket claims (including completed tickets whose gate/live caveat has since changed) are corrected with dated follow-ups rather than silently rewriting old evidence.
- Dead links, orphans, duplicate authority, stale screenshots/diagrams, banned handler-facing implementation language and misleading “production ready” claims are removed or corrected.
- Generated documentation and source-of-truth mirrors have one owner and a reproducible parity check.
- `check-doc-links`, `check-tickets`, `check-skills-sync` and relevant docs/markdown checks pass, followed by a reviewer sampling every major lifecycle against code and live registry evidence.

## Research
- Operator stubs: [plans-dir.md](../../../plans/work-todo-spike/docs-cleanup/plans-dir.md) · [root-roadmap.md](../../../plans/work-todo-spike/docs-cleanup/root-roadmap.md)
- Research packs: [research/plans-dir.md](../../../plans/work-todo-spike/docs-cleanup/research/plans-dir.md) · [research/root-roadmap.md](../../../plans/work-todo-spike/docs-cleanup/research/root-roadmap.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Regression changes](./changes-regression-12-07-26.md)
- [Operator follow-up](./evidence/operator-followup-12-07-26.md)
