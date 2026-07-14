# Verification — TKT-194: Explain why an email needs sorting

## Verdict
PENDING — no approved reason mapping, implementation, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — Unidentified uses the correct heading | Rendered tests assert “Why this needs sorting” for Unidentified and permit “Why this label” only on identified fixtures. | Signed-in screenshots of one Unidentified and one identified email show the correct distinct headings. | PENDING |
| A2 — at least one concrete failure/weakness reason | Reason-mapping tests cover every listed insufficiency, weak, conflict, unreadable and missing-context code and reject an empty reason set. | Signed-in examples for each naturally occurring reason reconcile the displayed explanation to the email/attachment/thread facts and stored reason code. | PENDING |
| A3 — generic clues do not masquerade as explanations | Negative rendered tests use recognised-sender, conversation and automated-pattern clues alone and require wording that names the resulting ambiguity or missing decision evidence. | The supplied automatic-reply example, viewed signed in after deployment, no longer lists generic positive clues as a self-sufficient explanation. | PENDING |
| A4 — each reason offers an available next action | Mapping/interaction tests pair every reason with an actionable, available destination and reject actions whose attachment/thread/type control is absent. | Signed-in pointer and keyboard use of each representative next action reaches the promised control/content. | PENDING |
| A5 — pending suggestion remains separate and auditable | Component and audit tests keep current type, suggestion card, Accept and Ignore separate and preserve existing append-only outcomes. | Signed-in supplied example shows the suggestion as pending; Accept/Ignore on operator-approved examples changes only the intended state and records the audit event. | PENDING |
| A6 — safe plain fallback and remediation signal | Unknown/null reason fixtures render the exact fallback, emit the remediation signal and expose no blank/raw value. | A signed-in controlled unknown-reason example shows the fallback while monitoring/audit evidence captures the unmapped code without breaking the preview. | PENDING |
| A7 — no banned app copy | Rendered-string scan across heading, reasons, actions, fallback and suggestion states passes the repository banned-language list. | Signed-in DOM text capture of all representative states is reviewed against the same list and contains no banned implementation/specification terms. | PENDING |
| A8 — accessible, responsive and preview-safe | Keyboard, accessibility-tree, narrow, 200% zoom and preview-overlap visual tests pass for long combined reasons and suggestions. | Signed-in keyboard/screen-reader proof and screenshots at narrow/200% show the explanation and actions readable without obscuring the email preview. | PENDING |

## Required artifact
- [Unidentified reason live proof](./evidence/unidentified-reason-live.md) — PENDING.
