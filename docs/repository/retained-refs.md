# Retained references

This ledger records deliberate exceptions to the one-ticket/one-active-branch rule. Do not delete a listed
reference without a replacement recovery proof and an explicit recorded disposition.

| Ref | Head | Owner | Reason | Disposition |
| --- | --- | --- | --- | --- |
| `codex/workingspace-ai-plans` | `765bd19beb3b2623ee38351227d3874d636a6d2b` | Operator | Private evidence branch containing the four original evaluation commits integrated by TKT-199. | **Do not delete or rewrite.** Retain exactly at this head. |

Recovery bundle locations and the 30-day retention window are recorded outside Git under
`collisionsuite-recovery/collisionspike/`.

## Worktree lifecycle

The canonical checkout is `active/collisionspike` on a clean `main` equal to `origin/main`.
Run `node scripts/worktree.mjs init` once in that checkout, then use `create`, `adopt`, `doctor`,
`publish`, `status` and `remove` instead of hand-making feature worktrees. Feature branches are
ticket branches and may have at most three attached worktrees; the `runtime`, `schema` and `evidence`
lanes are exclusive. `npm run hygiene` is the read-only repository report.
