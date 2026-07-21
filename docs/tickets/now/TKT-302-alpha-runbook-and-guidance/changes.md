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
