# Verification — TKT-186: Separate provider chases from case queries

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — supplied samples reach Provider chase | Exact corpus fixtures assert general/report/estimate subtypes for every singular and multi sample. | Signed-in inbox captures at least one safely probed sample of each subtype with the correct label. | PENDING |
| A2 — provider plus chase intent | Decision tests require corroborated provider identity and progress wording and reject keyword/display-name-only near matches. | Deployed classification explanations for controlled positive/negative messages show both required signals. | PENDING |
| A3 — explicit precedence | A matrix proves Provider chase beats generic Case query but loses to grounded instruction, cancellation, amendment, payment and evidence rules. | Signed-in controlled examples retain each stronger category and are absent from the Provider chase filter. | PENDING |
| A4 — never mint or reconstruct | Domain/API/orchestration tests fail any create/retro/Case-PO path and keep unmatched chase items with a reason despite old attachments/quoted instructions. | Live database/audit counts remain unchanged after safe sample probes; unmatched UI says “Case not found”. | PENDING |
| A5 — handoff to canonical association | Integration tests prove one-case association and itemized multi-case handoff without duplicating/dropping the inbound message. | Signed-in single/multi samples show the expected association entry points; TKT-187 proof supplies the full multi-link outcome. | PENDING |
| A6 — plain inbox category and next action | SPA/count/filter tests cover Provider chase and its subtypes with open-related-case actions and no create-case prompt. | Signed-in row/detail/filter/count captures show the exact plain labels and next action. | PENDING |
| A7 — taxonomy parity and durable override | Codec/schema/mapper/classifier/API/UI parity tests plus override/rerun tests all pass. | A signed-in controlled override survives refresh/reprocessing and is present in activity history. | PENDING |
| A8 — idempotent replay | Duplicate delivery/classification tests assert one row, current category, association intent and audit sequence. | Safe replay leaves one message, no duplicate task/association and no extra Archive item. | PENDING |
| A9 — full positive/negative corpus | All named samples, near matches and existing email classification regressions pass with precision/recall report. | Recorded signed-in proof covers subtype/filter/no-mint behavior without changing production work. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the full classifier/precedence/routing suites and the safe signed-in sample probes, attach one concrete artifact to every row, and retain PENDING until an independent verifier has checked all nine acceptance lines.
