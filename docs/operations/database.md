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

## Full backup, wipe and reseed (alpha reset)

Destructive, operator-executed procedure (PLAN-015 Phase 3–4; see
[alpha testing](./alpha-testing.md) for the surrounding quiesce points). Requires an
explicitly-authorized reset window with intake quiesced; never run it against a system still
receiving mail.

**Admin session.** Run the client wherever `psql`/`pg_dump` are installed — on the current
operator workstation that is WSL (the Windows side has neither tool); WSL is a tooling detail,
not a network requirement. Authenticate as the Entra administrator with an OSS-RDBMS access
token as the password (`az account get-access-token --resource-type oss-rdbms`), then
`SET ROLE csadmin` (the schema owner — bypasses forced RLS). The Key Vault `pg-admin-password`
is stale; the Entra token path is the working one.

**Firewall.** Server firewall rules are by public IP, and WSL egresses through the host
machine's IP — one rule covers both environments. The operator workstation already has a
standing rule (`dev-machine-1-2026-07-20`, verified 2026-07-21); do **not** delete it as part of
this procedure. Before starting, confirm it still matches the machine's current public IP
(`az postgres flexible-server firewall-rule list -g rg-collisionspike-dev --server-name
cespk-pg-dev` — an ISP-reassigned IP breaks it silently). Only when working from a different
machine, add a transient rule for that machine's IP and delete **that transient rule** when
done.

**1. Backup (RLS-complete).**

```
pg_dump "host=cespk-pg-dev.postgres.database.azure.com dbname=collisionspike user=<entra-admin-upn> sslmode=require" \
  --role=csadmin -Fc -f collisionspike-<date>.dump
```

`--role=csadmin` matters: without it, forced RLS filters rows and the dump is silently partial.
Also capture, as CSV alongside the dump: the full `case_po_floor` table AND the per-prefix maximum
sequence currently observed in `case_.case_po` — step 5 re-seeds from these.

**2. Pre-flight baseline currency.** `database/baseline` is the ordered full-build definition and
every migration must already be represented in it — spot-verify the newest
`database/migrations/*.sql` against the baseline files before dropping anything. Any gap: apply
the missing migration after step 4 and record the divergence in the owning ticket.

**3. Wipe.** As `csadmin`:

```
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO cespk_app;
```

The schema drop destroys the schema-level grant; the explicit re-grant restores it. Per-table
grants come back from the baseline files themselves.

**4. Rebuild.** Apply `database/baseline/*.sql` in filename order with `900_constraints.sql`
LAST, all from current `main` (the constraints file must be the main-branch version). Then the
seeds, in order and with the absolute CSV paths `database/seeds/README.md` requires:
`910_seed_corpus.sql` → `915_corpus_email_address_match.sql` →
`916_provider_domain_corrections.sql` → `920_replace_suggested_addresses.sql`.

**5. Re-seed Case/PO floors.** For every prefix captured in step 1:

```
INSERT INTO case_po_floor (prefix, floor_seq, note)
VALUES ('<prefix>', GREATEST(<old_floor>, <observed_db_max>), 'alpha reset <date> continuity floor');
```

Floors are the designed post-reset continuity mechanism — minting takes
`GREATEST(db_max, floor_seq) + 1`, so numbering continues instead of restarting and colliding.
Sanity-check floors against real-world maxima (Archive folder names, EVA), not just the wiped
database.

**6. Post-rebuild probes.** Expect: the baseline table count; RLS enabled AND forced on the
protected tables (spot-check with `SELECT relname, relrowsecurity, relforcerowsecurity …`);
`work_provider` count matching the seed corpus with QDOS active; `case_` and `inbound_email`
empty; `case_po_floor` populated. Offline, `node database/tests/code-table-parity.mjs` must stay
green. If a transient firewall rule was added for a non-standard machine, delete it (the
standing workstation rule stays).

**Restore path.** `pg_restore` of the `-Fc` dump into a freshly created database (or after the
same wipe), then re-run step 6's probes. The dump is complete (taken as `csadmin`), so no
re-seeding is needed after a restore.
