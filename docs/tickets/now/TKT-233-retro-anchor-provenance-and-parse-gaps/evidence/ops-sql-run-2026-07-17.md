# TKT-233 ops SQL run — 2026-07-17

`database/operations/tkt233-clear-own-domain-claimant-emails.sql` executed once against
`cespk-pg-dev/collisionspike` (WSL psql, Entra admin + `SET ROLE csadmin`, transient firewall
rule `tkt233-transient-ops` created for 82.8.225.120 and deleted immediately after — rule list
back to `["AllowAzureServices"]`).

## Result — the defect was systemic, not a one-off

- **Pre-check: 81 rows** had `eva_claimant_email = 'engineers@collisionengineers.co.uk'`
  (every hit was the engineers@ address; no other local parts). Far beyond the known AC14ACE
  instance: affected cases span QDOS/A.QDOS (12), QCL (4), OAK (3), and one each of
  BLACK26020, SWAN26006, AX26037, A.PCH26051, RJS26001, MP26011, KBS26022 — plus 55 cases
  with no Case/PO yet. Known instance `b5ffe5e4` (AC14ACE) confirmed in the list.
- `UPDATE 81`, committed.
- **Post-check: 0.**
- Idempotence: predicate now matches nothing; a re-run is a no-op.

Full pre-check row list (id, case_po, value) captured in the session terminal; ids above
suffice for audit — the UPDATE touched exactly the pre-check set (81 = 81).

Root cause and the preventing engine fix (own-domain rejection, sibling engine-v2.25) are in
[changes.md](../changes.md); the parser had been harvesting the instruction boilerplate's
"send reports to engineers@collisionengineers.co.uk" as the claimant's email wherever a
document carried it and no better candidate existed (`fallback_email_sole` shape).
