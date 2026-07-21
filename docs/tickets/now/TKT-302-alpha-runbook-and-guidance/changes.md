# Changes — TKT-302

## 2026-07-21 — ticket minted (PLAN-015 Slice E)

Ticket created from PLAN-015.

## 2026-07-21 — implementation

- New `docs/operations/alpha-testing.md` — the full phased cutover runbook: ordering
  constraints (Slice-A-before-EVA-flip hard dependency; quiesce-then-backup-then-wipe; same-day
  evidence banking), Phases 0–7 (deploy dark → Exchange RBAC for
  `instructions@collisionengineers.co.uk` → intake re-scope + quiesce → backup → wipe/reseed →
  blob clear + capture-off + alpha gate trims → EVA UAT shadow enable → acceptance smokes +
  registry updates), the local shadow bring-up checklist, and rollback. Indexed from
  `docs/operations/README.md`.
- `docs/operations/database.md` — new "Full backup, wipe and reseed (alpha reset)" section:
  the Entra-admin/`SET ROLE csadmin` session (stale KV admin password noted; transient firewall
  rule with trap-delete), RLS-complete `pg_dump --role=csadmin`, baseline-currency pre-flight,
  schema drop + `USAGE` re-grant, baseline rebuild with `900_constraints.sql` last, seeds in
  order, `case_po_floor` continuity re-seeding at `GREATEST(old_floor, observed_db_max)`,
  post-rebuild probes, and the restore path.
- New `docs/product/staff-forwarding-guide.md` — handler-language one-pager: plain Forward (not
  "Forward as attachment" — wrapped emails lose their photos), one provider email per forward,
  instructions and photo emails only, QDOS only, never bulk-copy history, staff sender is
  expected. Indexed from `docs/product/README.md`.

## 2026-07-21 — correction: database firewall/WSL wording (operator flag)

The operator flagged the backup/wipe/reseed section's connection guidance as wrong. Verified
live (read-only `az postgres flexible-server firewall-rule list`, 2026-07-21): a **standing**
per-IP rule `dev-machine-1-2026-07-20` exists for the operator workstation and matches its
current public IP — the section's "add a transient rule, trap-delete it" instruction would have
deleted the operator's deliberate standing rule. Also verified the Windows side of the
workstation has no `psql`/`pg_dump` (WSL has both), so WSL is a tooling location, not a network
requirement — firewall rules are by public IP and WSL egresses through the host's IP.
`docs/operations/database.md` rewritten accordingly: standing rule named and protected, IP-drift
pre-check added, transient-rule guidance scoped to non-standard machines only.
