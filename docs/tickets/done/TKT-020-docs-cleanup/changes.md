# Changes — TKT-020: Repository structure and documentation reset

## Status
verify — the PLAN-006 repository implementation is present on the working branch and the ticket is in
the verification queue for independent review of the final tree.

## Commits
- 70a3bb57 — establish PLAN-006 baselines and programme.
- a57720d9 — relocate the immutable workingspace.
- b224c54b — move runtime roots into the monorepo layout.

## Files touched
- Root entry points, workspaces and aggregate verification.
- apps, services, packages, contracts, database, infrastructure, tests, scripts and tools.
- Canonical documentation, tickets, agent sources and generated adapters.

## Summary
The repository now follows the PLAN-006 layout and current-only documentation model. Evidence is
content-addressed, workingspace bytes are unchanged, runtime source is feature-owned, repository
instructions have one canonical source, and ticket/document views are generated. The implementation
does not deploy, mutate live data or change cloud configuration.
