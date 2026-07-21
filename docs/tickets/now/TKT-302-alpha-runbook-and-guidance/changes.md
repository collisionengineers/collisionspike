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

## 2026-07-21 — cutover EXECUTED (Phases 0–5 + partial 7)

The runbook was executed the same day under explicit operator direction; the full dated record
is [evidence/cutover-2026-07-21.md](./evidence/cutover-2026-07-21.md). Outcome: deploy-dark done,
Exchange scope extended (all four mailboxes InScope=true), legacy subscriptions pruned, backups
banked (RLS-complete dump + 12,930/12,930 blob ledger), database wiped/rebuilt (66 tables,
27 floors, QDOS26 continues at 812), blob container cleared to zero, capture + alpha trims off
(TKT-200 exposure closed), SPA deployed. The alpha mailbox subscription bootstrapped ~16:05Z
after ~1.5 h of Exchange RBAC propagation (steady state verified) — live intake is watching the
alpha mailbox. Remaining residuals: Phase 6 (vendor UAT credentials) and the real-arrival
behavioural smokes.

Execution corrections folded back into the docs this pass: the `func publish --javascript` flag;
psql `\copy` performs no variable interpolation (920 needs a resolved-path copy — `database.md`
+ this ticket record the working route); 920 adds a one-off backup table (+1 on the post-rebuild
count); blob backups on Windows must reconcile case-insensitive name collisions (104 hit here).

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
