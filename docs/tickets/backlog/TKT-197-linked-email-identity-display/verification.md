# Verification — TKT-197: Show a trustworthy registration and email reference on linked emails

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — source VRM then authorized case fallback | Projection/API/UI tests prove source-first registration, case fallback, normalized equality and zero view-time writes. | Real affected linked rows display the correct VRM/source; DB/audit remains unchanged after viewing. | PENDING |
| A2 — Ref remains email-owned | Contract and negative tests fail if case reference or Case/PO populates email Ref; Status tests carry Case/PO separately. | Signed-in inbox/detail shows source Ref and Status Case/PO as distinct values/labels, including a missing-source-Ref row. | PENDING |
| A3 — conflicts remain visible and non-mutating | Conflict tests return both sourced values, preserve email Ref and prohibit overwrite/relink. | A naturally occurring conflict shows “Details do not match”; source and case values remain unchanged. | PENDING |
| A4 — truthful email-only or genuinely unknown state | Tests cover email-only VRM and both-empty identity without candidate borrowing. | Real examples show “From email” or honest unknown state without an implied case update. | PENDING |
| A5 — case edits affect VRM fallback only | Cache/client tests update case registration and prove only fallback VRMs refresh; case-reference changes do not rewrite Ref. | Observe an approved genuine case edit or retain this live class PENDING; no field is edited solely for proof. | PENDING |
| A6 — unlinked and accessible distinction | UI/API tests keep unlinked source identity isolated and verify accessible labels for linked state, Status, VRM source and Ref. | Keyboard/screen-reader signed-in pass distinguishes the identity columns/sources on real rows. | PENDING |
| A7 — one projection across surfaces/search | Contract tests compare inbox/detail/history/search/filter output and assert separate Ref versus Case/PO search semantics with stable counts. | Signed-in navigation/search shows identical sourced identity on every surface without label conflation. | PENDING |
| A8 — authorization boundary | API tests deny cross-case/unassigned fallback access and prove list/search payloads leak no candidate identity. | Assigned access shows fallback; an unauthorized request is refused without leaked details. | PENDING |
| A9 — attachment extraction and residual remediation | Exact RA6458909 fixture tests cover subject/body/attachment/image extraction, provenance, census, backup/idempotent repair and residual accounting. | Approved read-only census plus any authorized remediation ledger accounts for every affected AX/MP row and preserves source hashes. | PENDING |
| A10 — full matrix and real affected-row proof | All projection, parsing, remediation, AX/MP, linked/unlinked and UI suites pass. | Recorded operator-designated real rows prove source Ref, Status Case/PO and VRM fallback separately with no manufactured data. | PENDING |

## Pending / gaps
Implementation, the affected-row census, offline suites and all signed-in/live proof are pending.

## How to re-verify
Run the canonical projection and attachment-extraction/remediation suites, then gather signed-in evidence
from operator-designated real affected rows. Attach one artifact per line and retain unavailable natural
live classes as PENDING.
