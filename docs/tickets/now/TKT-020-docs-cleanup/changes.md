# Changes — TKT-020: Stale-plan cleanup + root-doc reconciliation

## Status
done

## Commits
- `94902ce` — work-todo-spike mega-commit → initial stale-plan cleanup pass.
- `756d71f` — deployed bundles + registry truth-up after corrective deploy.
- `14a916d` — truth-up the board to verified-live status.
- `b5d51fd` — registry point-in-time reset after the clean-slate reset.

## Files touched
- `docs/plans/**` (HISTORICAL banners on Power Platform-era plans)
- root docs (README / CURRENT_STATUS / ROADMAP reconciliation)
- the live registry mirror

## Summary
`docs/plans/` and several root docs still described the decommissioned Power Platform era (Dataverse / Power Automate / Code App / `pac` / CCG) as if live. This work applied HISTORICAL banners to the stale plans and reconciled the root docs to the live Azure PaaS reality, including the 2026-06-29 production mailbox cutover. Live state is centralised in the registry — see ../../architecture/live-environment.md.
