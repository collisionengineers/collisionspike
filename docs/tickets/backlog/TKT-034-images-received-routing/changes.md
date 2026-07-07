# Changes — TKT-034: Inbound images: match to case / create Box folder by reg / flag

## Status
Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; not yet built.

## Commits
- No code changes yet.

## Summary
Part of the email-classification cluster (relates TKT-006). An image-bearing email was mislabelled a generic "query"; needs split Enquiries vs Case Queries categories plus a match → reg-keyed Box folder → flag fallback chain (ties to TKT-003 Box-sync and TKT-004 Case/PO).

## Reconciliation note (2026-07-07) — stays backlog, rescoped
Half of this is **already shipped**: the Enquiries-vs-Case-Queries category split exists on `main` —
`query_existing_work` (100000003) + `query_new_enquiry` (100000004) in
`packages/domain/src/data/choicesets/inbound-email-classification.json:32-33`, with the DTO/outlook-folder
plumbing. What remains is the **image-received fallback chain** (match → reg-keyed Box folder → flag), and
that **overlaps the active [TKT-043] (now/)** image-routing work. **Rescope:** narrow this ticket to the
image-routing residue not covered by TKT-043, or fold it into TKT-043 — do not re-do the category split.
