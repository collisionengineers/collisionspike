# Database migrations

Each file is an idempotent, transactional change for an existing PostgreSQL database. The ordered
files in `../baseline/` describe a fresh build; every effective schema change must be represented in
both forms so they converge on the same current schema.

Rules:

- Name a migration `YYYY-MM-DD-<slug>.sql`.
- Never edit a migration after it has been applied; add a corrective migration.
- Preserve existing persisted numeric codes.
- Prefer additive nullable columns, guarded constraints, `ON CONFLICT`, and `IF NOT EXISTS` where
  they make replay safe.
- Keep application releases safe with both schema states during rollout.
- Do not apply a migration merely because it exists in a branch or pull request.

CI parses and checks these files offline. Applying one to a live database requires the normal
operator approval and the procedure in [Database operations](../../docs/operations/database.md).
