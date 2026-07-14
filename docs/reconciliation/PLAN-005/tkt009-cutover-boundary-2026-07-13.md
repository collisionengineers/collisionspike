# TKT-009 cutover boundary correction — 2026-07-13

## Operator ruling

PLAN-005 and TKT-009 work may harden and rehearse the future production-cutover plan. They do not
authorize the production cutover. The final cutover remains blocked until all of the following are
present and explicitly approved together:

- the dated, signed-off job spreadsheet and its recorded checksum;
- authenticated and verified production EVA API access;
- an independently confirmed production Archive root plus explicit approval for writes and retargeting;
- verified backup and restore evidence;
- a frozen zero-write dry-run ledger/hash and named operator approval of that exact hash.

Outlook remains read-only. Ordinary Archive writes remain under the test root. Missing EVA access is
recorded as `not queried`, but it blocks execution rather than being treated as an optional signal.

## Interrupted deployment and restoration

An attempted TKT-009 rollout was stopped after the operator clarified the boundary. The exact state is:

| Surface | Final state after correction |
|---|---|
| API | Restored from clean pre-PR-86 commit `9bbab2e71ca71a53785e69890cab0c9cd27e056b`; deployment bundle SHA-256 `D2C41B32B206C4D2FB4C3E402E1BF4FE216050E43E843CE2C032C91416861A35` |
| API inventory | 111 functions; zero TKT-009-only registrations; Outlook-link route returns 404; normal no-auth boundary returns 401; SPA CORS preflight returns 204 |
| Orchestration | Original deployment retained and restarted; 87 functions; state `Running` |
| SPA | Not deployed |
| Graph subscriptions | Not rotated, deleted or recreated |
| EVA | Not called |
| Archive | No folder/file/config write and no production-root retarget |
| Final mailbox-key cutover delta | Not applied; the command was terminated before it reached Postgres |
| Temporary database firewall rule | None remains; only the pre-existing `AllowAzureServices` rule was present after cleanup |

The additive Phase-A Outlook-link schema was applied before the ruling. It leaves the previous runtime
compatible and does not itself activate links, subscription rotation or the final composite-key cutover.
It remains in place rather than performing an unapproved destructive schema rollback. Its presence must
be re-confirmed during the eventual approved preflight.

## Recovery evidence

- Full logical pre-window database dump:
  `C:\Users\PC\Documents\GitHub\collisionsuite-recovery\collisionspike\20260713T200620Z\db\plan005-tkt009-precutover-20260713T213239Z.dump`
- Dump size: 4,506,083 bytes.
- Dump SHA-256: `cc40d82f78c098d7c681f03446ba16325b82a9f84e777d11cef9b4f5088d5318`.
- `pg_restore --list`: 595 catalog entries.
- Azure on-demand physical backup was unavailable on the server's Burstable tier; the logical dump is
  the retained recovery artifact.

## Work allowed before approval

- Correct the Graph duplicate-subscription assumption.
- Build bounded, one-mailbox-at-a-time rotation and catch-up tooling.
- Add offline tests, dry-run manifests, caps, refusal paths, checkpointing and rollback instructions.
- Rehearse against fixtures or a non-production copy.
- Keep TKT-009 and the production-cutover ticket pending/blocked.

Do not pause live services, apply final DDL, rotate subscriptions, deploy the TKT-009 API/orchestration/SPA,
query EVA, write to production Archive folders or retarget the Archive root until every gate above is met
and the operator explicitly opens the cutover window.
