# Changes — TKT-281: Mount the guided-capture staff panel into CaseDetail

## Status
done

## Commits
No code changes in this ticket's own history — closed as duplicate/absorbed into TKT-200, which made the
fix (see `docs/tickets/now/TKT-200-guided-capture-sessions/changes.md`'s 2026-07-20 entry, landed via
PR #143, commit `dd182697`/merge `ae6c0fad`).

## Files touched
- n/a (this ticket) — see TKT-200's `changes.md` for the actual wiring commit.

## Summary
Renumbered from collisioncapture's `CCAP-012` during the TKT-278 repository merge. At the time, verification
found the component and its API plumbing were fully built and unit-tested but never mounted into the live
CaseDetail view, so this was deliberately **not** closed as a duplicate of TKT-200 — a genuine, distinct gap.
While this ticket sat in `backlog`, a parallel TKT-159 gate-audit follow-up found and fixed the identical
gap directly under TKT-200 (same root cause: the `mockup-app` → `apps/web` reconciliation merge `bbe20b3e`
dropping screen-level wiring). `GuidedPhotoRequestPanel` is now mounted in `case-detail-main.tsx`'s Chasers
tab, feeding `ChaserPanel`'s `guidedPhotoLink` prop — exactly what this ticket proposed. Reclassified as a
duplicate now that the fix has already landed; TKT-200 owns the remaining live-proof acceptance line.
