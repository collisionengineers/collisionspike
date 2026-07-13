# Verification — TKT-188: Keep report amendments with the existing case

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — exact Report amendment classification | The supplied EML/PDF fixture resolves to case_update/report_amendment and UI tests show the requested correction. | Signed-in inbox capture shows “Case update · Report amendment” and the name correction on the safely probed sample. | PENDING |
| A2 — engineer report is not instruction paperwork | Document-classification tests identify the supplied CE report from grounded layout/provenance signals and suppress embedded instruction phrases. | Signed-in classification explanation identifies the attachment as the prior report, not instruction paperwork. | PENDING |
| A3 — safe precedence with genuine-instruction recall | Decision tests prove amendment wins over generic wording and genuine provider-instruction controls remain Receiving work. | Naturally occurring operator-designated amendment and true-instruction examples retain their distinct labels. | PENDING |
| A4 — existing-case association without new work | Any-status/provider-scoped correlation tests assert one association and no create/Case-PO/reopen call. | A naturally occurring matched amendment appears on the existing case; database/audit show no second case or terminal-state change. | PENDING |
| A5 — corroborated reconstruction only | TKT-058 integration tests cover unique original instruction/Archive identity and refuse amendment-only, name-only, shared-VRM and multiple-source cases. | A genuine operator-approved historical matter reconstructed for operational need names its corroborated source; naturally occurring unsafe counterparts create nothing. | PENDING |
| A6 — TKT-193 durable unresolved holding state | Contract tests prove this route hands the email, PDF, correction, identity and reason to TKT-193 and supports later staff adoption without a second holding store. | Signed-in TKT-193 “Case needs finding” view shows all retained details and, when a genuine case becomes available, adopts them without evidence loss. | PENDING |
| A7 — one visible amendment task, not auto-complete | Case-history/lifecycle tests show one request/report and require a separate handler completion/sent action. | Signed-in case history shows the amendment pending after classification and completed only by a genuine handler action required for that matter. | PENDING |
| A8 — idempotent replay/adoption/retry | Integration tests assert one case/id/email/PDF/archive/task and protect staff association across every retry order. | Safe replay and later adoption leave one evidence/task set and the signed-in chosen case link intact. | PENDING |
| A9 — full corpus and deployed matched/unresolved proof | All exact, positive-control, matching, reconstruction and replay suites pass. | Recorded signed-in proof covers matched and unresolved paths with zero unintended production reconstruction. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the grounded email/report, precedence, correlation and reconstruction suites plus both signed-in scenarios, attach one concrete artifact to every row, and retain PENDING until an independent verifier has checked all nine acceptance lines.
