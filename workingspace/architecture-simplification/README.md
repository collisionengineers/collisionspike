# Architecture simplification — plan series (drafts)

**Status: non-binding working drafts. Superseded on distillation.**
These documents are exploratory. They do **not** supersede accepted ADRs, ticket specs, or binding
reviews (`workingspace/` is scratch space, not authority — see AGENTS.md §Repository data authority).
Each numbered draft below is the design source for a governed `PLAN-NNN` document plus a ticket batch.
Once a draft is distilled into its `PLAN-NNN` + tickets, **the governed artifacts win** and the draft
here is frozen historical context. Do not implement from these drafts directly; implement from the
minted tickets.

Authored 2026-07-17. Validated against `main` at `de9c3f9d`.

## Why this series exists

The operator asked for a detailed series of plans to **reduce duplicated functions, align capabilities
through canonical routes, and cut clutter and overarchitecture**. The stated cost model is
drift-avoidance: duplicated or near-identical functions make the codebase drift, because a fix applied
to one copy silently diverges from the others. Two inputs anchor the effort:

- `workingspace/adr-rewrite.txt` — the operator-reviewed ADR consistency review + rewrite plan
  (Review 160726). It corrects wrong assumptions across ~17 of 25 ADRs and mints follow-up tickets
  T1–T9. It executes **first** (Plan 0) so every later plan cites corrected ADRs.
- `docs/operations/cloud-inventory-2026-07-17.md` — a fresh, read-only inventory of the live estate
  (56 Azure resources, 9 function sites, £50.71/month). It is the ground truth for the estate lane.

## The perspectives applied throughout

- **Simplicity.** Every lane must yield **net-negative** structure (fewer files / less code), reported
  per PR. Rule-of-three before abstracting: a mechanism duplicated 3+ times earns a shared home; a
  single-caller wrapper gets inlined, not generalised. No new plan machinery — reuse the existing
  PLAN/ticket/review system. A de-cluttering effort must pass its own test.
- **Cost.** Cloud cash is not the prize: total spend is ~£51/month and estate retirements save pennies.
  The real costs are (a) the maintenance and drift cost of duplicated code, (b) the agent/session token
  cost of the effort itself, (c) verification cost. AI Foundry spend (58% of the bill) belongs to the
  separate AI-realignment axis, not this series.
- **Drift-avoidance.** One canonical home per mechanism, plus a **forbidden-pattern guard** that makes
  each dedup stick (e.g. `IDENTITY_ENDPOINT` may appear only inside the shared package). Where sharing
  is impossible (TypeScript ↔ Python, vendored parser), use **copies-in-sync guard tests** instead of a
  shared module.
- **Safety / governance.** Read-only until a ticket authorises change; live cloud writes additionally
  need explicit operator authorisation (AGENTS.md §Live-system safety). Dark, gated lanes are
  **deliberate, not dead** (`LIVE_FACTS.json` `safetyGates` / `deliberatelyUnavailable` is authority);
  they are preserved, never "cleaned up". Irreversible estate deletions use confirm-then-dispose with an
  operator ruling in the middle.

## The documents

| # | Draft | Distils into | New ADRs |
|---|---|---|---|
| 00 | [Overview, findings register, and Plan 0 handoff](./00-overview-register-and-plan0-handoff.md) | — (framing + Plan 0 runbook) | — |
| 01 | [Shared server-runtime foundation](./01-server-runtime-foundation.md) | PLAN-007 | one (server-runtime package boundary) |
| 02 | [Canonical service routes](./02-canonical-service-routes.md) | PLAN-008 | amendments (adopts T8) |
| 03 | [Cloud estate cleanup](./03-cloud-estate-cleanup.md) | PLAN-009 | one amendment (bicep layout) |
| 04 | [Scripts and tooling dedup](./04-scripts-and-tooling-dedup.md) | PLAN-010 | — |
| 05 | [Python runtime doctrine and cross-language parity](./05-python-doctrine-and-parity.md) | PLAN-011 | one (Python packaging doctrine) |

## Dependency graph

```
Plan 0  (execute workingspace/adr-rewrite.txt — DELTA PASS REQUIRED, see 00)
        mints T1–T9, incl. T8 (trust seam) and T9 (ADR 0026–0030 backfill)
   │
   ├─> PLAN-007  server-runtime foundation      (also gated on PLAN-006 TKT-210 → verify)
   │        └─> PLAN-008  canonical routes       (T8 = forced step 1; step 4 waits on T9/ADR-0030)
   │
   ├─> PLAN-009  estate cleanup   (parallel track; ticket 1 gated on TKT-215 → done; ticket 5 on T9)
   │        └─> PLAN-011  Python doctrine + parity   (needs PLAN-009's helper-app assessment)
   │
   └─  PLAN-010  scripts/tooling dedup   (gated only on full PLAN-006 close-out)
```

Two parallel tracks open after Plan 0: **code** (007 → 008) and **estate** (009 → 011), with 010
joining once PLAN-006 closes out. Rough total: ~23 new tickets plus Plan 0's nine and the adopted T8.

## Number reservations (record in every authoring PR — parallel sessions mint too)

- **ADR numbers 0026–0030** are reserved by Plan 0's T9 (platform-ADR backfill). New ADRs in this
  series therefore start at **0031** (PLAN-007) and continue upward (PLAN-011's Python-doctrine ADR).
- **Tickets:** highest existing ID at authoring time is **TKT-237**; the next free is **TKT-238**, but
  **rescan all status folders at the moment of minting** — the AI-realignment axis and the retro lane
  both mint concurrently.
- **PLAN numbers:** PLAN-006 is the highest existing; this series claims **PLAN-007 … PLAN-011**. The
  AI-realignment effort will also mint its own PLAN-NNN — coordinate the number at its authoring PR.

## What this series explicitly excludes

- **PLAN-006 close-out** (TKT-210 completion + the verify sweep) — its own effort; this series *gates
  on* it, never restates it.
- **AI-realignment axis** — the MCP tool surface, the model evaluation bench, the agent harness, and AI
  Foundry spend. Tracked in `workingspace/ai-realignment-plans/`; will mint its own PLAN.
- **Alerting / observability** — the "no alert rules, action group with no recipient" gap is real but is
  a separate operations effort. Flagged once in PLAN-009's close-out, nothing more.
- **TKT-206 retention removal** and its dangling-reference riders — a separate P0; PLAN-009 coordinates
  with it (bicep merge-conflict risk) but does not absorb it.
- **Untracked working-copy clutter** at the repo root (`api/`, `orchestration/`, `functions/`, `ocr/`,
  `deploy/`, `mockup-app/`, `raw/`) — user-owned local directories; an operator checklist item, never
  agent deletion.
