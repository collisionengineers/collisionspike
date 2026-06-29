# Historical

Decommissioned / superseded material kept for provenance. **Nothing here is current.**
Live state: [CURRENT_STATUS.md](../../CURRENT_STATUS.md); forward work: [ROADMAP.md](../../ROADMAP.md).

- [`PLAN.md`](./PLAN.md) — the original narrative plan (predates the Power-Platform → Azure migration).
- [`DEPLOY-RUNBOOK.md`](./DEPLOY-RUNBOOK.md) — the Power-Platform-era deploy runbook (superseded by [docs/azure/](../azure/README.md)).
- [`box-integration-pivot/`](./box-integration-pivot/) — the Phase-7 Box-pivot research set.
- [`migration/`](./migration/) — the executed Power-Platform → Azure cutover record (narrative plans).

> **Note:** the live Postgres DDL (`migration/assets/schema/*.sql`) was **kept in place** at the repo-root
> `migration/assets/` — it is still cited as canonical by [live-environment.md](../architecture/live-environment.md),
> [data-model.md](../architecture/data-model.md), and [docs/azure/postgres.md](../azure/postgres.md). Only the
> narrative `NN-*.md` migration plans are archived here.
