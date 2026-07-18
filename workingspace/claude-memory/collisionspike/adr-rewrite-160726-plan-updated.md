---
name: adr-rewrite-160726-plan-updated
description: "160726 ADR rewrite EXECUTED 2026-07-17 on branch docs/adr-review-160726 (commit local, push operator-gated); T1–T9 = TKT-238..246; TKT-219 merged so the old branch-only-0022 fact is obsolete"
metadata: 
  node_type: memory
  type: project
  originSessionId: d46108c8-49bc-4637-b001-79d6fafabae1
---

The ADR rewrite ("Review 160726 change set", spec `workingspace/adr-rewrite.txt` — now TRACKED and
ledger-registered via PR #104, no longer untracked) was **executed 2026-07-17** in the main checkout on
branch `docs/adr-review-160726`, all six phases: `docs/reviews/160726/` (overview/review/decisions
D1–D17/checklist), 0017 deleted, 0007 renamed, 9 rewrites + 3 amendments + 6 clarifications,
README/CONTEXT/back-link pass, T1–T9 minted as **TKT-238..TKT-246**, ledgers converged. Push/PR is
operator-gated and had not happened as of the execution session.

Corrections discovered/ruled during execution (all recorded in decisions.md):

- **TKT-219 merged into main** (`e5e8f6cd`, then `58d7ca09` TKT-225/226) BEFORE execution — the old
  "0022 amendment only on the branch" fact is obsolete; a Δ 2026-07-17 moved-base block was folded into
  adr-rewrite.txt (operator-approved edit). 0022 still untouched by the rewrite.
- **Operator renamed 0007 to `0007-receipt-of-images.md`** ("Receipt of images"), rejecting
  "image-acquisition-channels": "intake" is reserved for receiving a whole CASE (e.g. via WhatsApp,
  manual today). Never call image receipt "intake".
- **A. = repairable, AP. = total loss — the ORIGINAL engineer's verdict** decides the marker (D1b).
- **0016 subset rows merge** because some export rows just missed the first address line (D14).

**Why:** the branch is local-only until the operator asks for push/PR; a later session could wrongly
re-execute or miss that TKT-238..246 exist on that branch (not on main).
**How to apply:** before any ADR/ticket work, check whether `docs/adr-review-160726` has merged; mint
new tickets from TKT-247+ only after rescanning; ADR numbers 0026–0030 reserved by TKT-246, next free
ADR is 0031. Related: [[arch-simplification-series-state]], [[pr100-plan006-reset-review]].
