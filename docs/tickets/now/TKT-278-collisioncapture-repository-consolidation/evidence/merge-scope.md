# Merge scope — why collisioncapture's repository split was costing more than it saved

## Coupling already realized (the concrete costs this ticket closes)

- **Stale cross-repo contract pin.** `packages/contracts/openapi/source-lock.json` (collisioncapture)
  carried `sourceCommit: "PENDING_COLLISIONSPIKE_SERVER_COMMIT"` for a period after the real
  collisionspike commit existed — a manual round-trip step nobody had come back to finish.
- **Near-duplicate ticket/skill tooling.** collisioncapture's own `docs/tickets/` board, `scripts/
  check-tickets.mjs`/`ticket-move.mjs`/`check-skills-sync.mjs`, and `.agents/skills/ticket-*` were
  explicitly ported from this repo's own conventions ("same setup as the collisionspike ticket system")
  — meaning every improvement to this repo's ticket tooling had to be manually re-ported, or drift.
- **A documented near-miss.** Session memory (`capture-server-exists-tkt200.md`) records two sessions
  independently nearly re-implementing an already-deployed server because collisioncapture's own docs
  and `CCAP-006..010` tickets still said "not started" and cited a pre-reset API layout, after this
  repo's own repository reset had already moved things.
- **Parallel unpushed work on matching branch names.** `capture-hardening-2026-07-16.md` records work
  landing in sibling worktrees on both repos' branches (`capture-server` in collisionspike,
  `capture-build` in collisioncapture) in the same session — coordination that a single repo makes
  unnecessary.
- **A shared Azure resource group already.** collisioncapture's own (untracked) `.azure/deployment-plan.md`
  already targeted `rg-collisionspike-dev` — the two projects share infrastructure, not just a contract.

## What this merge is, and is not

This is a repository-structure and engineering-ownership consolidation: one canonical wire contract,
one runtime boundary (a browser client calling this repo's own API), now one repository. It is
explicitly **not** a decision that in-house guided capture is the selected image-receipt channel —
[ADR-0007](../../../../adr/0007-receipt-of-images.md) states that selection remains open, and commercial
guided-capture products remain live alternatives. See the amendment added to ADR-0007 and
[ADR-0034](../../../../adr/0034-guided-capture-repository-consolidation.md) for the full rationale.

## Precedent tension, addressed

The suite's own 2026-06-23/24 reorganisation deliberately split a single `collisionplugin` monorepo into
many independent per-project repositories, to decouple lifecycles and ownership — the opposite direction
from this merge. That precedent addressed genuinely independent-lifecycle projects. This pair shares one
canonical wire contract across a single browser boundary and already shares an Azure resource group —
not a superficial coupling, and the concrete costs above are the reason this specific pair is a
justified exception, not a reversal of the general precedent.
