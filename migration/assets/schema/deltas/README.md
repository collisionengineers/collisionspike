# migration/assets/schema/deltas/

Idempotent, additive, **operator-applied** DDL scripts for a database that is already
**live** — as opposed to a fresh rebuild.

- **The canonical files** one level up (`../000_enums_lookups.sql` … `../900_constraints.sql`)
  are the **full-rebuild truth**: the ordered sequence a brand-new `cespk-pg-dev`-shaped
  database is built from (`000` first, `900` last — see
  `docs/HISTORICAL/migration/20-data-and-schema-migration.md` §3). Every schema change
  lands there too, so a fresh rebuild always reaches the same end state as the live
  database.
- **This directory** carries the *same* change again, but shaped to run safely against a
  database that is already live and already has the pre-change schema — it cannot
  `CREATE TABLE` from scratch, so instead it uses `ALTER TABLE … ADD COLUMN IF NOT
  EXISTS`, `INSERT … ON CONFLICT (code) DO NOTHING`, `CREATE INDEX IF NOT EXISTS`, and so
  on, wrapped in a single `BEGIN … COMMIT`. Every delta must be safe to run **more than
  once** against the same database (every statement no-ops on a repeat run).

**Naming:** `YYYY-MM-DD-<slug>.sql` — one file per live-apply event. A delta is never
edited after it has been applied live; if a mistake is found, author a new delta that
corrects it (the same never-renumber/append-only discipline `000_enums_lookups.sql`
uses for `choice_*` codes).

**Applying a delta is operator-gated.** An agent authors the file; a human runs it
against the live database — see [`docs/azure/postgres.md`](../../../../docs/azure/postgres.md)
for the connection pattern and [`docs/gated.md`](../../../../docs/gated.md) for the
specific pending item and its runbook. Nothing under this directory is applied
automatically by `verify-all.mjs` or CI.

**Once applied, a delta stays in the repo** as the historical record of what changed and
when — it is not deleted or moved after use.
