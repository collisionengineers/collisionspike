# Changes — TKT-255: Rationalise the bicep layout to one convention

## Status

Implemented on branch `plan009/estate-nonmutating`. Bicep authoring/relocation only; no live deployment.

## What changed

- **One convention applied (A1).** The six per-service function host templates were relocated from
  `services/functions/<service>/infra/` to the central `infrastructure/functions/<service>/`, so all
  infrastructure-as-code now lives under the single `infrastructure/` root named in PLAN-006's locked
  structure. `infrastructure/config-capture/{api,orch,spa}.bicep` is unchanged. Ten files moved
  (box-webhook: `main.bicep` + `wire-box-secrets.ps1`; eva-sentry, location-assist, vehicle-enrichment:
  `main.bicep`; ocr: `main.bicep` + `acrpull-role.bicep` + `docintel.bicep`; parser: `main.bicep` +
  `main.json`), each a **byte-identical git rename (R100)** — no content edit.
- **ADR amendment (A2).** `docs/adr/0028-three-tier-compute-topology.md` gains a dated
  `## Amendment — one bicep layout convention (2026-07-19)` citing this ticket.
- **Doc reference updated.** `infrastructure/config-capture/README.md`'s "templates live under
  `services/functions/*/infra/`" line now points at `infrastructure/functions/<service>/`.
- **Provenance.** `scripts/maintenance/reconcile-repository-reset.mjs` `ownerTicket()` attributes
  `infrastructure/functions/` to TKT-255 (the reconciliation records the relocation as a byte-identical
  move).

## TKT-206 coordination and OCR discrepancy (A3)

- **Partition, not sequence.** TKT-206's ADR-0017 rider sweep edits the *content* (retention parameters)
  of the six per-service `main.bicep` files; TKT-255 does the *relocation* only, touching no bicep
  content. The two are partitioned by concern and do not collide. Because TKT-206 has not landed, its
  future rider edits now target the new `infrastructure/functions/<service>/main.bicep` paths (recorded
  in the ADR-0028 amendment).
- **OCR discrepancy flag.** The OCR service carries three templates (`main.bicep`, `acrpull-role.bicep`,
  `docintel.bicep`) and no ADR-0017 citation today; the 160726 review scope
  (`docs/reviews/160726/checklist.md` §c) still assigns it to the six-file rider set. Flagged here for
  TKT-206.
- **TKT-254 home.** The `basicPublishingCredentialsPolicies/scm` (`allow: false`) resource that TKT-254
  needs persisted in IaC now has its home at `infrastructure/functions/<service>/main.bicep`. TKT-254 is
  an operator-gated live-write (skipped in this non-mutating pass); no such resource is added here.

## Safety

No resource name, deployment parameter, or runtime behaviour changed (A4) — the relocation is
byte-identical, so an ARM what-if would show a layout-only change; `check:runtime-contract` is unaffected
(no route/DTO change). No live deployment was performed (A5).
