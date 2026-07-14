# Verification — TKT-173: Make AX instruction acceptance impossible to miss

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — persistent action-needed message | Domain/UI tests prove only a valid AX new instruction creates the banner and it survives until an explicit outcome. | Signed-in inbox and case recordings show the exact handler message before and after reload. | PENDING |
| A2 — exact safe AX link | Parser/safe-link tests assert the fixture href byte-for-byte after normalization and reject lookalike, quoted, attachment and unapproved targets. | Browser inspection shows the control’s exact approved href and a new-tab navigation from controlled data. | PENDING |
| A3 — navigation is never acceptance | API/SPA tests prove opening/returning cannot write an outcome; explicit accepted/declined calls require authentication and write actor/time. | Signed-in proof opens and returns with the warning intact, then separately confirms an outcome and shows its audit record. | PENDING |
| A4 — unsafe or missing-link fallback | Parameterized tests cover absent, malformed, duplicate/conflicting and invalid links and assert no promoted action button. | A controlled invalid-link instruction shows “Acceptance link needs checking” and opens only the original email. | PENDING |
| A5 — AX instruction scope and precedence | Classification tests distinguish genuine instructions from AX chase, cancellation, amendment, support and quoted-thread fixtures. | Signed-in inspection of controlled examples shows only the new instruction carries the acceptance action. | PENDING |
| A6 — durable, idempotent and correctable state | API/database tests cover replay, duplicate confirmation, reload and audited correction without history loss. | Reprocess/reload of controlled data leaves one current state and the complete signed-in activity history. | PENDING |
| A7 — no implied provider-side mutation | Contract tests assert outcome recording sends no email, moves no message, makes no AX request and changes no unrelated case field. | Browser/network and audit evidence show only the local explicit outcome write; handler copy never claims AX confirmed it. | PENDING |
| A8 — corpus and safe deployed proof | The exact fixture plus all named negative cases pass parser, domain, API, orchestration and SPA suites. | Operator-approved signed-in proof covers the link and both local outcomes without changing real AX work. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the grounded fixture/negative suites and the operator-approved signed-in scenario, attach one concrete artifact to every row, and retain PENDING until an independent verifier has checked all eight acceptance lines.
