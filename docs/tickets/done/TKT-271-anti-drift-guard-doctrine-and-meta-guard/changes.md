# Changes — TKT-271: Establish the anti-drift guard doctrine and meta-guard

## Doctrine (A1)

- **ADR** [`docs/adr/0033-anti-drift-guard-doctrine.md`](../../../adr/0033-anti-drift-guard-doctrine.md)
  (Accepted 2026-07-20) defines the four guard modes — `ast-import`, `import-reference`,
  `behavioural-fixture`, `machine-evidence` — with production scoping and an explicit rejection of naive
  lexical matching. Indexed in `docs/adr/README.md`.
- **Governance page** [`docs/governance/anti-drift-guards.md`](../../../governance/anti-drift-guards.md)
  records the modes, the plan classification, the derived register, and the meta-guard; linked from
  `docs/governance/README.md`.

## Machine-readable classification (A2)

- `scripts/maintenance/ticket-system.mjs` exports `PLAN_KINDS`, `GUARD_MODES`,
  `CONSOLIDATION_PLAN_KIND`, and `TERMINAL_GUARD_FIELDS`.
- `scripts/checks/check-tickets.mjs` now requires a valid `plan-kind` on every plan.
- All twelve plans are backfilled with `plan-kind`. The four consolidation plans additionally declare
  their terminal-guard triple: PLAN-007 → TKT-251 / `check:managed-identity-mint` / `ast-import`;
  PLAN-008 → TKT-266 / `check:route-authority` / `ast-import`; PLAN-010 → TKT-261 / `check:scripts-dedup` /
  `import-reference`; PLAN-011 → TKT-269 / `check:parity` / `behavioural-fixture`.

## Derived register + meta-check (A3/A4)

- `scripts/checks/check-guard-register.mjs` (new) derives the canonical register from plan metadata and
  fails on: a plan missing `plan-kind`; a consolidation plan missing guard metadata; an invalid
  `guard-mode`; a terminal-guard ticket that is not a plan member; a non-consolidation plan declaring
  guard fields; a command that is not a package script or is not wired into `verify-all.mjs`; and a guard
  lacking mode-appropriate negative fixtures.
- The PLAN-011 behavioural guard is elevated to a first-class `check:parity` npm script (runs the
  `parser-parity` vitest in isolation) so all four terminal guards register and wire uniformly.
- `check:guard-register` and `check:parity` are wired into `verify-all.mjs`'s `checks` array.
- `scripts/checks/check-guard-register.test.mjs` (new) covers the happy path plus the missing-kind,
  missing-guard, non-member, invalid-mode, unwired-command, not-a-script, and missing-fixture cases.

## No live write (A5)

Documentation, plan frontmatter, checks, and their tests only. No deploy, cloud, database, mailbox, or
secret mutation.
