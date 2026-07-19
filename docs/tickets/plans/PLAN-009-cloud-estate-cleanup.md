---
id: PLAN-009
title: Cloud estate cleanup
status: active
tickets: [TKT-252, TKT-253, TKT-254, TKT-255, TKT-256, TKT-257]
depends-on: [TKT-215, TKT-246]
---

# PLAN-009 — Cloud estate cleanup

## Outcome

The live estate matches the repository's intent: resources the repo already believes retired are actually
gone, ambiguously-owned resources are documented or disposed under an operator gate, credential hygiene is
closed, the bicep layout follows one convention, and `LIVE_FACTS.json` records reality (offer type, function
counts, retirements). This runs as a parallel track to the code plans — its files (bicep, cloud runbook,
`LIVE_FACTS.json`) are disjoint from PLAN-007/008.

## Locked decisions

- **Live writes require explicit operator authorisation per ticket** (AGENTS.md, Live-system safety). A
  ticket authorising a change is necessary but not sufficient: the operator must additionally authorise each
  cloud mutation, and each is verified live afterward — source is not proof of live behaviour.
- **Ordered by reversibility, safest first.** Irreversible disposals (a container image, an app
  registration) sit behind a two-phase confirm-then-dispose gate; read-only provenance and an operator ruling
  precede any deletion.
- **The estate snapshot ages.** Re-run the read-only cloud-inventory runbook
  (`scripts/maintenance/cloud-inventory/01`–`05`) before and after each mutation; App Insights KQL evidence is
  same-day-perishable on the free tier, so bank it into the ticket `evidence/` immediately.
- **Alerting/observability is out of scope.** The "no alert rules / action group without a recipient" gap is
  real but is a separate effort; flag it once at close-out, do not build it here.
- **Anti-drift for the estate is reconciliation, not a code guard.** Unlike the code plans, the estate has no
  forbidden-pattern to ban; its standing guarantee is `LIVE_FACTS.json` kept reconciled to a fresh read-only
  inventory (TKT-257 + the runbook). PLAN-012 generalises that into a standing `LIVE_FACTS`-integrity check.
- The earlier draft's "untracked root working-copy directories" decision is **removed** — those directories
  no longer exist in the working tree (PLAN-006's path migration already resolved them; verified 2026-07-19).

## Sequence

1. TKT-252 retires the EVA-validation app and its storage account, consuming TKT-215's read-only no-use audit
   verdict (it does not re-audit). Live write — operator-authorised; gated on TKT-215 reaching `done`.
2. TKT-253 confirms-then-disposes the ambiguously-owned `valuationbot-mcp` container image and the
   `P2P Server` app registration: phase (a) read-only provenance and an operator ruling; phase (b) deletion
   only after the operator authorises. Irreversible — the gate is non-negotiable.
3. TKT-254 closes credential hygiene: resolve the dangling EVA references against the empty EVA Key Vault
   (populate or remove the references, then dispose the vault only once confirmed truly empty — keys and
   certificates need an elevated read the current identity lacks), and disable SCM/Kudu basic-publishing
   auth on the helper apps that still allow it.
4. TKT-255 rationalises the bicep layout to one convention (centralise, matching PLAN-006's locked structure)
   and records it as an amendment to the platform-topology ADR minted by TKT-246; it coordinates with
   TKT-206's ADR-0017 rider sweep, which edits the same per-service `infra/main.bicep` files.
5. TKT-256 assesses (read-only; does not execute) helper-app consolidation: each function app carries its own
   App Service plan and storage account, but Application Insights is already largely shared, so plan/storage
   consolidation would not simplify telemetry. Weigh the maintenance win against migration risk (cold-start,
   identity, deployment blast radius). Output feeds PLAN-011's sharing calculus.
6. TKT-257 refreshes `LIVE_FACTS.json` and `docs/operations/live-environment.md` **last** — correcting the
   stale offer (Free Trial → PAYG), the app-tier function counts, and the retired resources — from dated
   read-only evidence, so the registry records reality rather than intent.

## Gates

- PLAN-006 **TKT-215** → `done` gates ticket 1 (TKT-252); TKT-215 is currently in `verify`.
- **TKT-246** (platform ADR backfill, reserving 0026–0030) gates tickets 4 and 5: TKT-255's amendment targets
  the platform-topology ADR that TKT-246 mints, and TKT-256 uses that topology as its framing. TKT-246 is in
  `backlog`; this series does not pre-assign the specific ADR number.
- Otherwise independent of PLAN-007/008 (disjoint files) — genuinely parallel.

## Close-out

The plan closes only when all members are `done`: the retired app and storage are gone, the ambiguous image
and app registration are disposed or documented under an operator ruling, credential hygiene is closed, the
bicep layout follows one recorded convention, the consolidation assessment is filed, and `LIVE_FACTS.json`
plus `live-environment.md` match a fresh read-only inventory in the same change set. Each live mutation is
separately operator-authorised and verified live afterward; the redaction sweep exits clean; the alerting gap
is flagged once for a separate effort.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/6 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 6 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-252](../backlog/TKT-252-retire-eva-validation-app-and-storage/TKT-252-retire-eva-validation-app-and-storage.md) | backlog | Retire the EVA-validation app and its storage |
| [TKT-253](../backlog/TKT-253-dispose-ambiguous-image-and-app-registration/TKT-253-dispose-ambiguous-image-and-app-registration.md) | backlog | Confirm-then-dispose the ambiguous image and app registration |
| [TKT-254](../backlog/TKT-254-credential-hygiene-eva-vault-and-scm-basic-auth/TKT-254-credential-hygiene-eva-vault-and-scm-basic-auth.md) | backlog | Close credential hygiene on the EVA vault and helper-app SCM basic auth |
| [TKT-255](../backlog/TKT-255-bicep-layout-rationalisation/TKT-255-bicep-layout-rationalisation.md) | backlog | Rationalise the bicep layout to one convention |
| [TKT-256](../backlog/TKT-256-helper-app-consolidation-assessment/TKT-256-helper-app-consolidation-assessment.md) | backlog | Assess helper-app consolidation (read-only) |
| [TKT-257](../backlog/TKT-257-refresh-live-facts-and-environment/TKT-257-refresh-live-facts-and-environment.md) | backlog | Refresh LIVE_FACTS and the live-environment doc |
<!-- /GENERATED:PROGRESS -->
