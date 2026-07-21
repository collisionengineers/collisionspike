# PLAN-014 D5 — OLD-vs-NEW classify_email() backtest (attachment_content_typings)

Compared: 58  ·  Skipped: 0

OLD accuracy (category+subtype exact): **51/58 (87.9%)**
NEW accuracy (category+subtype exact): **53/58 (91.4%)**
Changed outcomes: 2  ·  Regressions: 0  ·  Improvements: 2  ·  Neutral changes: 0

## Improvements (was wrong, now correct)

| id | expected | old | new |
|---|---|---|---|
| tkt023-original-reply | query/query_existing_work | receiving_work/existing_provider_instruction | query/query_existing_work |
| tkt032-pcd-diminution | query/query_existing_work | receiving_work/existing_provider_instruction | query/query_existing_work |

Items where at least one attachment produced a content typing: 27/58

SUMMARY: compared=58 skipped=0 old_accuracy=51/58 new_accuracy=53/58 changed=2 regressions=0 improvements=2
