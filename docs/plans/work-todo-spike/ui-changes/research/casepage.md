# Research pack: case page

## Source ticket

`docs/plans/work-todo-spike/ui-changes/casepage.md` is empty. The actionable source in this folder is `docs/plans/work-todo-spike/ui-changes/casepage.png`, which shows a sparse case page with many repeated field badges and required-field errors.

Because the Markdown stub is empty and the screenshot may be older than the current source, the first implementation step should verify the deployed case page before changing layout.

## What is happening

Current source is already ahead of the screenshot in several areas:

- The case detail screen now has a header, actions, tabs, sidebar readiness, and imported facts around `mockup-app/src/screens/CaseDetail.tsx:1010`, `mockup-app/src/screens/CaseDetail.tsx:1123`, and `mockup-app/src/screens/CaseDetail.tsx:1451`.
- Field required copy is now just `Required` in `mockup-app/src/components/EvaFields.tsx:106`.
- Imported details are rendered as plain case facts around `mockup-app/src/screens/CaseDetail.tsx:1494`.
- The no-image warning is collapsed into evidence readiness copy around `mockup-app/src/screens/CaseDetail.tsx:1230`.
- Chaser actions use handler-facing wording around `mockup-app/src/components/ChaserPanel.tsx:330`.

There are still meaningful case-page problems in the current source.

## Remaining issues found

### Rendered implementation language

The app charter bans engineering and file-format language in user-facing strings. The case page still exposes it:

- `Download JSON`, `EVA JSON downloaded`, and JSON-related tooltips appear around `mockup-app/src/screens/CaseDetail.tsx:973`, `mockup-app/src/screens/CaseDetail.tsx:1052`, and `mockup-app/src/screens/CaseDetail.tsx:1062`.
- `mockup-app/src/components/ProvenanceBadge.tsx:48` and `mockup-app/src/components/ProvenanceBadge.tsx:168` expose labels such as `Document AI`, `Azure Vision`, and `PDF extraction` through badge text, tooltips, or accessibility labels.

These should be replaced with handler-facing wording. For example, use labels like `Download case file`, `Source`, `From the instruction`, or `Checked from images` depending on the exact evidence shown.

### Edits are mostly local state

The case editor gives the impression of durable case editing, but several interactions do not have matching API persistence:

- Field edits update local state around `mockup-app/src/screens/CaseDetail.tsx:750`.
- Image role and exclusion changes update local state around `mockup-app/src/screens/CaseDetail.tsx:932`.
- Notes update local state around `mockup-app/src/screens/CaseDetail.tsx:944`.
- `api/src/functions/cases.ts` has GET, hold, merge, and image-read routes, but no general save route for field edits, notes, or evidence metadata.

This explains why the page can feel like a mock editor even when it is rendering real cases.

### Visual density from source badges

Every field row can render a provenance/source badge through `mockup-app/src/components/EvaFields.tsx:175`, with richer tooltip text in `mockup-app/src/components/ProvenanceBadge.tsx:168`. The screenshot's repeated badges likely came from this pattern. Source detail is useful, but it should not dominate the case page.

### Hold/release policy still needs product decision

`mockup-app/src/screens/CaseDetail.tsx:1031` exposes hold/release controls backed by `api/src/functions/cases.ts:328`. The binding review at `docs/reviews/190626/queues-cases/caseview/review.md:27` objected to a manual held state. If hold/release remains, the product rule should be confirmed and the copy should stay in handler terms.

## Affected files

- `mockup-app/src/screens/CaseDetail.tsx` - case page layout, action bar, local edit state, evidence controls, export actions.
- `mockup-app/src/components/EvaFields.tsx` - field row rendering, required labels, source badge placement.
- `mockup-app/src/components/ProvenanceBadge.tsx` - rendered source language and badge density.
- `mockup-app/src/components/ChaserPanel.tsx` - chaser interaction wording.
- `api/src/functions/cases.ts` - missing durable edit routes.
- `packages/domain/src/dto/index.ts` - shared DTO changes for case updates, notes, and evidence metadata.
- `migration/assets/schema/050_case.sql`, `migration/assets/schema/060_evidence.sql`, and `migration/assets/schema/070_case_notes.sql` - persistence targets for durable edits.
- `docs/reviews/190626/queues-cases/caseview/review.md` - binding case-view review.

## Changes that would resolve it

1. Verify the deployed page against the screenshot.
   - If the screenshot is stale, record that in the ticket and focus on the remaining current-source issues.

2. Remove rendered technical wording.
   - Replace file-format and implementation labels with plain case-handler wording.
   - Keep technical names only in code comments, logs, or developer docs.

3. Add real save paths before polishing edit affordances.
   - Add API routes for case field updates, notes, and evidence metadata.
   - Use database constraints and audit rows for all durable changes.
   - Make the UI show save/failure state instead of silently keeping local-only changes.

4. Reduce badge noise.
   - Show source detail on hover/focus, on changed/conflicting fields, or in a compact side panel rather than as a badge on every row.

5. Reconcile hold/release with the binding review.
   - Either remove the manual control or document and implement the handler workflow that justifies it.

## Open checks before implementation

- Confirm whether the empty `casepage.md` was meant to refer only to the screenshot, or whether a later review note was intended but not committed.
- Re-check `docs/reviews/190626/queues-cases/caseview/checklist.md` before changing this page, because that review outranks older plans.
