# E2E review — 2026-06-22

This is an automated, adversarially-verified, read-only end-to-end review of the `collisionspike` spike: every finding below was cross-checked against the live environment, the committed source, and the binding docs before being retained, and weak or unsupported claims were dropped. It is analysis only — no code, config, flows, or live resources were changed in the course of this review.

| Dimension | Confirmed | Dropped | Top issue | File |
| --- | --- | --- | --- | --- |
| Azure resource overlap, duplication & waste (#3) | 6 | 2 | Per-function observability sprawl (6 Log Analytics workspaces + 7 App Insights, one set per Function) plus an orphaned managed workspace in a hidden RG | [azure-waste](./azure-waste.md) |
| Dead code & legacy fallbacks — backend (Functions, flows, parser) (#7) | 9 | 1 | [HIGH] Vendored parser has diverged from the sibling repo on B2 claimant contact extraction with no engine-source parity test | [deadcode-backend](./deadcode-backend.md) |
| Dead code, bloat & time bombs — Code App frontend (#7) | 11 | 0 | CaseDetail review-screen edits (field corrections, photo roles, exclusions, notes) never persist to Dataverse in the live deployed Code App | [deadcode-frontend](./deadcode-frontend.md) |
| Ticking time bombs — config, secrets, gates, deploy (#7) | 4 | 3 | Live enrichment Function holds DVSA/DVLA secrets as plain-text app settings; a bicep redeploy resets them to KV refs against an empty vault, breaking enrichment | [timebombs-infra](./timebombs-infra.md) |
| Provider / inspection address-matching logic — overlap & correctness (#9) | 5 | 0 | [HIGH] `district_matches()` startswith bug — B5 spuriously swallows B50, a cross-district false match contradicting its own docstring/plan and untested | [address-matching](./address-matching.md) |
| Orphaned / built-but-unwired features (#10) | 6 | 0 | Code App "Look up vehicle (DVLA/DVSA)" button is a permanent dead affordance — no enrichment connector/transport was ever injected, so it always returns "not connected" | [orphaned-features](./orphaned-features.md) |

## Headline actions

- **Azure waste:** Consolidate the per-function observability sprawl (6 Log Analytics workspaces + 7 App Insights) onto a single shared workspace and clean up the orphaned managed workspace in the hidden RG.
- **Backend dead code:** Reconcile the vendored parser's divergence from the sibling repo on B2 claimant contact extraction and add an engine-source parity test to guard against future drift.
- **Frontend dead code:** Wire CaseDetail review-screen edits (field corrections, photo roles, exclusions, notes) to persist back to Dataverse — they are silently dropped in the live deployment today.
- **Infra time bombs:** Move the live enrichment Function's DVSA/DVLA secrets into Key Vault and provision the vault before any bicep redeploy, so a redeploy can't reset them to references against an empty vault and break enrichment.
- **Address matching:** Fix the `district_matches()` startswith bug so B5 no longer swallows B50, and add a cross-district regression test covering the contradiction with its own docstring/plan.
- **Orphaned features:** Either inject the enrichment connector/transport behind the Code App "Look up vehicle (DVLA/DVSA)" button or remove the dead affordance, since the backing enrichment Function is already live.
