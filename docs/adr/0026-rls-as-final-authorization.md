# ADR-0026 — Row-level security is the final authorization boundary

**Status:** Accepted 2026-07-20 per operator approval ([TKT-246](../tickets/done/TKT-246-platform-adr-backfill/TKT-246-platform-adr-backfill.md)).

## Decision

The Data API is the only deployed PostgreSQL client (out-of-band maintenance scripts such as
`scripts/database/vehicle-enrichment/remediate.mjs` open their own pool as the `staff` role to read
`case_` rows), and it connects as the non-owner login `cespk_app`
(`NOSUPERUSER`, `NOBYPASSRLS`), so the authored row-level security is enforced rather than bypassed as
it was for the schema owner `csadmin` — see the header of
[`db/client.ts`](../../services/data-api/src/platform/db/client.ts) and `pgUser`/`pgAppRole` at
[`api.bicep:39-46`](../../infrastructure/config-capture/api.bicep). Every backend connection is opened
with the libpq startup option `-c app.role=<PGAPPROLE>`, which defaults to `staff`; the live app runs a
single pool whose role is whatever `PGAPPROLE` resolves to (`client.ts:52-61`). `getPool()` accepts any
alphabetic value and does NOT reject a non-`staff` role (`client.ts:54`), so the single-staff-role
posture currently rests on `PGAPPROLE` being deployed as `staff`, not on the pool refusing other values.

The [RLS policies](../../database/baseline/900_constraints.sql) key on `current_setting('app.role')`:
the audit trail is append-only (INSERT/SELECT for any role, no UPDATE policy, admin-only DELETE); the
work tables allow read/insert/update for `staff` under a RESTRICTIVE admin-only DELETE; vehicle and
estimator tables are SELECT/INSERT only. Every table enumerated in `900_constraints.sql` — the work,
evidence, audit, capture, and vehicle/estimator tables — is `ENABLE` **and** `FORCE` row-level security;
the runtime-writable `app_setting` table and the `choice_*` lookups are deliberately left without RLS,
so this boundary is not database-wide. On the role-keyed work and evidence tables a missing or
non-`staff`/`admin` context fails closed — the policies evaluate false (the append-only audit trail is
the deliberate exception: its INSERT/SELECT policies are unconditional and admit any app role). Then
`assertStaffRlsContext()` reads the live backend's `app.role` and throws before the MCP route reaches a
protected table (`client.ts:97-104`). The intended destructive/admin path is a SEPARATE pool opened `-c app.role=admin`
behind a verified superuser token; that separate pool is NOT yet built, and the staff pool must not be
repurposed by pointing `PGAPPROLE` at `admin`.

## Rationale

This is a single-tenant, staff-only app, so RLS is not multi-tenant row filtering. Primary authorization
for STAFF routes is the route layer — Entra JWT audience plus the `CollisionSpike.User`/`.Superuser`
app-roles enforced in `withRole` ([`staff-auth.ts`](../../services/data-api/src/platform/auth/staff-auth.ts)).
Non-staff callers reach the same pool through other route seams: provider intake via `withApiKey`
([`api-key-auth.ts`](../../services/data-api/src/platform/auth/api-key-auth.ts)), public guided capture
via its session credentials, and internal service-to-service calls via `withServiceAuth`
([`service-support.ts`](../../services/data-api/src/features/inbound/internal/service-support.ts)). RLS is the last,
independent line beneath it: even if a route bug or a mis-scoped caller reaches the database, the
connection still cannot mutate the audit trail or issue a destructive delete
(`900_constraints.sql:126-190`). The role is set per connection rather than as a role-default GUC because
Azure Flexible Server forbids `csadmin` from persisting that default (`client.ts:14-16`).

## Consequences

- The app never runs as owner or superuser and issues no DELETEs against the protected work, evidence,
  or audit tables; the ephemeral capture tables (`capture_session_resume_token`, `capture_rate_limit`)
  are the deliberate exception — they carry no RESTRICTIVE no-delete policy and the app purges their rows
  during guided-capture rotation/revocation/completion and stale-window cleanup. A destructive capability
  on the protected tables must be a distinct admin pool plus a verified token, never a widening of the
  staff pool.
- The audit trail and vehicle/estimator evidence are append-only in the database, not by application
  convention; a new work/evidence table gains this boundary only once it is `ENABLE`/`FORCE` RLS with an
  authored policy — until then it is NOT covered (as the un-RLS'd `app_setting` and `choice_*` tables
  show), so RLS coverage must be added deliberately per table rather than assumed database-wide.
- The evidence-delete control is the withheld table grant plus a guarded `SECURITY DEFINER` function,
  not RLS: that function's `BYPASSRLS` owner means the RESTRICTIVE `p_evidence_scoped_delete` is
  defense-in-depth only (`900_constraints.sql:255-280`).
- Granting `cespk_app` ownership or `BYPASSRLS`, dropping `FORCE`, or pointing the app at `csadmin`
  silently removes this boundary and must not be done.

Realized by [system-overview.md](../architecture/system-overview.md) ("role and row-level policies are
the final data boundary"), [operations/database.md](../operations/database.md), and
[roles-and-permissions.md](../product/roles-and-permissions.md).
