# Verification — TKT-255: Rationalise the bicep layout to one convention

## Verdict

TESTED (offline, layout-only). Verified 2026-07-19 on branch `plan009/estate-nonmutating`. No live
deployment performed.

## Evidence

- **A1 — one convention applied.** `git ls-files infrastructure/functions` shows the six services'
  templates centralised under `infrastructure/functions/<service>/`; `services/functions/*/infra/` is
  gone. `infrastructure/config-capture/` is unchanged. The mixed central/per-service split is resolved to
  the single `infrastructure/` convention from PLAN-006's locked structure.
- **A2 — ADR amendment.** `docs/adr/0028-three-tier-compute-topology.md` carries
  `## Amendment — one bicep layout convention (2026-07-19)`, citing TKT-255 as the driver;
  `check:docs` resolves the amendment's links.
- **A3 — no collision with TKT-206.** `changes.md` records the partition (TKT-255 relocates; TKT-206
  edits content) and the OCR-discrepancy flag; the ADR amendment records that TKT-206's future riders
  target the new paths.
- **A4 — layout-only.** `git diff --stat` for the move shows **10 files changed, 0 insertions(+),
  0 deletions(-)** — all `R100` renames; no resource name, deployment parameter, or runtime behaviour
  changed. `npm run check:runtime-contract` stays clean (bicep is not a runtime route/DTO). The
  governance ledgers regenerate with the relocation recorded as a byte-identical move (0 unexplained).
- **A5 — no live deployment.** Bicep authoring/relocation only; no `az deployment` / ARM mutation was
  performed by this ticket.

## Pending / gaps

None for the layout rationalisation. The `basicPublishingCredentialsPolicies` IaC resource that TKT-254
will persist has its home prepared (`infrastructure/functions/<service>/main.bicep`) but is not added
here — TKT-254 is an operator-gated live-write outside this non-mutating pass.

## How to re-verify

`git log --follow --stat` any moved template to confirm the `R100` byte-identical rename; confirm
`infrastructure/functions/<service>/` holds the six services' templates and `services/functions/*/infra/`
is absent; confirm the ADR-0028 amendment is dated and resolves; `npm run check:layout`,
`check:inventory`, `check:reconciliation`, `check:docs`, `check:runtime-contract` all pass.
