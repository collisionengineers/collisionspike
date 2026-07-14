# Verification — TKT-184: Treat automatic out-of-office replies as no action needed

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — exact out-of-office classification and label | The supplied EML is pinned to non_actionable/out_of_office in parser/domain/API/UI tests with the exact handler label. | Signed-in inbox detail and filter show “No action needed · Out of office” for the safely probed sample. | PENDING |
| A2 — headers plus corroboration | Decision tests combine Auto-Submitted, suppression and standard headers with subject/body cues and reject display-name/phrase-only spoofing. | Read-only live message metadata and the deployed classification explanation show the grounded automatic-response signals. | PENDING |
| A3 — automated-mail and human negatives | Fixtures for human absence text, calendar, delivery failure, mailbox full, read receipt and status automation retain their expected distinct outcomes. | Naturally occurring operator-designated examples do not appear in the out-of-office filter unless they meet the full rule. | PENDING |
| A4 — absolute no-work invariant | Routing tests fail if out_of_office invokes case create/reconstruction, status, evidence, chaser, reply-needed or urgent-suggestion paths despite quoted requests/refs/VRMs. | Postgres/audit and browser/network evidence show zero case/work mutation and no reply/urgent advice for the deployed sample. | PENDING |
| A5 — contextual thread link only | Correlation tests preserve a trusted thread relation without creating action and keep untrusted reference/name matches uncased. | Naturally occurring operator-designated threaded and unthreaded examples show context only and no guessed link; an unavailable shape remains PENDING. | PENDING |
| A6 — taxonomy/filter/action parity | Codec, schema, mapper, counts/filter, classifier and SPA tests agree on the append-only subtype and handling/folder behavior. | Signed-in filtering and mark-handled flow work with plain copy; no Outlook move occurs during proof. | PENDING |
| A7 — idempotent replay | Duplicate delivery/rerun tests assert one inbound row, stable classification and no later side effect. | Safe replay leaves one message and unchanged case/work counts in the live database. | PENDING |
| A8 — complete corpus and deployed proof | All exact/negative fixtures and acknowledgement/reference-gate regressions pass. | Recorded signed-in sample proof shows corrected label, no action controls and no production mutation. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the exact/negative classifier suites and the safe signed-in probe in the matrix, attach one concrete artifact to every row, and retain PENDING until an independent verifier has checked all eight acceptance lines.
