# Database

This directory owns the PostgreSQL definition and its offline verification.

- `baseline/` is the ordered full-build definition for a new database.
- `migrations/` contains append-only, idempotent changes for an existing database.
- `seeds/` contains deterministic current reference data.
- `tests/` verifies code-table values and schema-facing contracts.
- `operations/` contains controlled provisioning and read-only operational helpers.

Persisted table names, column names, and numeric codes are public data contracts. Change them only
through an approved ticket and an additive migration. PLAN-006 performs no live schema write.

Operational procedure is documented in [Database operations](../docs/operations/database.md).
