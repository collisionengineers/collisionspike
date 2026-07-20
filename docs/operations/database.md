# Database operations

The live server is `cespk-pg-dev`, database `collisionspike`. Applications connect as the non-owner
`cespk_app` login. Row-level security is enabled and forced; privileged ownership is reserved for
approved schema and verification work.

Decision of record: [ADR-0026](../adr/0026-rls-as-final-authorization.md).

## Repository layout

- `database/baseline` — complete clean-install schema.
- `database/migrations` — ordered, reviewable changes.
- `database/seeds` — current reference/corpus data only.
- `database/tests` — baseline, migration, permission, mapping, and invariant checks.
- `database/operations` — safe operator queries and narrowly scoped procedures.

## Change rules

- A repository change does not authorize applying SQL live.
- Preserve existing table/column names and persisted numeric codes unless a separately accepted contract
  change says otherwise.
- Make changes forward-compatible with the currently deployed code and give rollback/repair semantics.
- Never place production case rows or secret material in seeds.
- Test from an empty database and from the previous migration level.
- Test the application login, absent-context denial, append-only protections, and role-specific policies.

## Read-only verification

Prefer narrowly scoped `SELECT` statements with an explicit reason and timestamp. Counts in a live intake
system are point-in-time evidence, not durable documentation. Update exact verified counts only in
`LIVE_FACTS.json`.
