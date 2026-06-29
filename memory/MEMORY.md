# Memory index

- [SDLC sweep (2026-06-24)](sdlc-sweep-2026-06-24.md) — in-progress ultracode sweep of all docs/plans phases after PR #23 merge; build-offline/gated-off guardrails.
- [Exchange RBAC unblocks Graph intake](exchange-rbac-unblocks-graph-intake.md) — EXO RBAC-for-Apps grants the intake app scoped mailbox perms with no GA Entra consent (verified live 2026-06-26); poll, don't subscribe.
- [Azure API deploy + auth](azure-api-deploy-and-auth.md) — rebuild/redeploy recipe for the cespk-api-dev esbuild bundle (MUST ship node_modules; func publish drops it), the v2-token audience fix, the RLS least-priv login, and the secret-remediation posture.
- [Azure orchestration deploy](azure-orch-deploy.md) — Durable cespk-orch-dev deploy recipe + the esbuild import.meta.url crash that left it at 0 functions (fixed via build-orch.cjs); identity-based storage roles for Durable; deployed-but-not-live wiring.

## Domain & intake model

- [Inspection TYPE vs LOCATION ruling](inspection-type-vs-location-ruling.md) — binding operator ruling: Desktop Inspection (TYPE, always-on) ⊥ image-based-vs-address (LOCATION); desktop-% is NEVER a modality signal; RJS is address-based.
- [Queue & case model](queue-case-model.md) — 3 queues (Not Ready/Review/Held), Case/PO at intake, auto-merge by VRM with >1 candidate → Held (never silent), AX = Image Based Assessment.
- [Audit case-type](audit-case-type.md) — 2nd independent inspection auditing a 3rd-party report (A.-prefix); parser detection LIVE, but API/orch/SPA layers authored-not-applied (ADR-0014).
- [Enrichment mileage caveat](enrichment-mileage-caveat.md) — DVLA/DVSA enrichment live (gated by ENRICHMENT_ENABLED); DVSA mileage is an MOT-odometer estimate so near-new vehicles get none, by design.

## Working relationship

- [Activation boundary](activation-boundary.md) — Claude performs Azure activations directly; operator keeps only secret VALUES, live email sends, Entra GA consent, and prod-cutover confirmation (see docs/gated.md).
- [Working approach](working-approach.md) — safety data → always-current sources (never cached CSVs); FREE sources only for research; plans → docs/plans, research → docs/research.
- [User profile](user-profile.md) — digital/tooling lead at Collision Engineers Ltd; valuation-evidence domain (CAP/Cazana, Autotrader, CPR 35.6, EVA); expert dev; batched decisions.

## Cross-project context (suite-wide; reference-only)

- [Suite structure](suite-structure.md) — collisionsuite monorepo layout on Linux; folder-type taxonomy; nested gitignored repos; key renames.
- [base44 website push guard](base44-website-push-guard.md) — collision-engineers-website is the LIVE base44 site; never modify/push autonomously, always user-requested + double-checked.
- [Suite architecture overview](suite-architecture-overview.md) — pointer to ARCHITECTURE-OVERVIEW.{md,json}; two-worlds-joined-by-VRM; enrichment & rendering each built 4×; don't build on mcp-gateway/report-renderer.
- [Sibling project pointers](sibling-projects-pointers.md) — durable pointers to the parser engine (vendored source-of-truth), collisionrenderer, the valuation suite, DVLA/DVSA connector + RegLookup, and the skills repo.
