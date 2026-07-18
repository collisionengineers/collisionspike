# 03 — Cloud estate cleanup → PLAN-009

**Status: non-binding working draft. Superseded on distillation.**
Distils into **PLAN-009**. Runs as a **parallel track** to PLAN-007/008 (disjoint files: bicep, cloud,
`LIVE_FACTS.json`). One ADR-0028 amendment (bicep layout). Validated against `main` at `de9c3f9d`; estate
facts from `docs/operations/cloud-inventory-2026-07-17.md`.

## Problem

The live estate carries clutter the repository already believes it removed, plus undocumented resources
and hygiene gaps. PLAN-006 was explicitly forbidden to make cloud writes (its locked decision: "no
deployment, cloud write, mailbox mutation or database mutation"), so the estate cleanup was always going
to need a successor plan. This is it.

## Outcome

The live estate matches the repository's intent: retired things are actually gone, undocumented things are
either documented or disposed, credential hygiene is closed, the bicep layout follows one convention, and
`LIVE_FACTS.json` records reality.

## Scope — ordered by reversibility (safest first)

1. **Retire `cespkeval-fn-6c6fxd` + storage `cespkevalst6c6fxd`.** The EVA-validation app is still running
   despite a documented retirement; its source is already removed from the repo. **Consumes PLAN-006
   TKT-215's audit verdict — does not re-audit.** Gated on TKT-215 reaching `done`.
2. **Confirm-then-dispose: `valuationbot-mcp` image and the `P2P Server` app registration.** Both are
   undocumented and MCP/integration-shaped, so either could belong to the AI-realignment axis or an
   external party. **Two steps by design:** (a) a read-only diagnostician pass establishes provenance and
   the operator rules; (b) only then, deletion. Deletion is irreversible — this gate is non-negotiable.
3. **Credential hygiene.** Resolve the two dangling references against the empty EVA Key Vault
   `cespkevakvufa3ci` (populate or remove the references, then dispose the vault if truly empty), and
   disable SCM/Kudu basic-auth on the 6 helper apps that still allow it.
4. **Bicep layout rationalisation.** Central `infrastructure/{api,orch,spa}.bicep` vs per-Python-service
   `services/functions/*/infra/main.bicep`. Pick one convention (centralise, matching PLAN-006's locked
   structure); record as an **ADR-0028 amendment**. **Check TKT-206's rider state first** — its riders edit
   six `infra/main.bicep` files for dangling ADR-0017 references, so this is a merge-conflict hazard;
   coordinate, do not collide.
5. **Helper-app consolidation ASSESSMENT (read-only).** Seven function sites each carry their own plan /
   storage / App Insights for 1–16 functions. Assess — but do not execute — whether consolidation's
   maintenance win beats its migration risk (cold-start, identity, deployment blast radius). Needs T9's
   ADR-0028 (three-tier topology) as the framing. **Output feeds PLAN-011's sharing calculus.**
6. **Refresh `LIVE_FACTS.json` + `docs/operations/live-environment.md` — LAST.** Free-Trial→PAYG, function
   counts (146 / 105), retired resources. Done last so the registry records *reality*, not intent.

## Locked decisions

- **Live writes require explicit operator authorisation per ticket** (AGENTS.md §Live-system safety) — a
  ticket authorising the change is necessary but not sufficient; the operator must additionally authorise
  the cloud mutation, and each is verified live afterward (source is not proof).
- **The untracked root working-copy directories** (`api/`, `orchestration/`, `functions/`, `ocr/`,
  `deploy/`, `mockup-app/`, `raw/`) are **user-owned**; disposing of them is an **operator checklist line,
  not agent work**.
- **Alerting is out of scope** — the "no alert rules / action group with no recipient" gap is real but is a
  separate observability effort. Flag it once in the close-out; do not build it here.

## Proposed tickets (rescan IDs at mint; ~6)

One per scope item above. Item 2 is two-phase (identify, then dispose) but may stay one ticket with an
operator-gate checkpoint recorded in `changes.md`.

## Dependencies / gates

- **PLAN-006 TKT-215 → `done`** gates ticket 1.
- **Plan 0 / T9 (ADR-0028)** gates tickets 4 and 5.
- Independent of PLAN-007/008 otherwise (disjoint files) — genuinely parallel.

## Risks

- **Irreversible deletion of ambiguously-owned resources** (`valuationbot-mcp`, `P2P Server`) — the whole
  reason for the confirm-then-dispose gate. TKT-215's verdict is the sole authority for the eval app; fresh
  judgement is not substituted for it.
- **Estate snapshot staleness** — `cloud-inventory-2026-07-17.md` will age. Mitigation: **re-run the
  `scripts/maintenance/cloud-inventory/01–05` runbook before and after** each estate mutation; App Insights
  KQL evidence is same-day-perishable (free tier) so bank it into the ticket `evidence/` immediately.
- **TKT-206 bicep collision** — mitigated by the check-first ordering in ticket 4.

## Verification

- Inventory runbook re-run before/after; the redaction sweep (`04-redact-sweep.ps1`) must exit 0.
- Live re-verification of each mutation (app gone, vault disposed, basic-auth off) — recorded with
  timestamps in `verification.md`.
- `LIVE_FACTS.json` refresh validated against a fresh inventory in the same change set.
