# Verification — TKT-141: merged twins exclusion

## Verdict
PENDING

## Evidence
- Offline: the dashboard.test.ts TKT-141 suite reproduces the PK20FWT shape (survivor +
  2 retired `mergedInto` rows + 1 un-marked linked case) and pins: aging/needs-action
  rows exclude the retired pair, PK20FWT same-VRM tally = 1, stage counts skip the pair,
  the un-marked `linked_to_instruction` case still counts Not-ready. Domain + api suites
  green (1061 + 352).
- Deployed: api republished (94 re-verified) + SPA redeployed 2026-07-09.

## Pending / gaps
- **Live check outstanding** (Acceptance): on the deployed SPA dashboard, PK20FWT's twin
  badge must read 1 genuinely-open case (was "3 open cases share this registration"),
  the retired PCH26018/PCH26020 rows absent from Check-the-flagged-details and the
  Not-ready counts, yet still openable via their direct case URLs / search.

## How to re-verify
Operator/verifier session: dashboard → needs-action groups (no PK20FWT twin chip >1);
Queues → Not ready (no PCH26018/PCH26020); open `/case/<retired-id>` directly (renders,
badge "Linked to instruction"); `GET /api/cases?vrm=PK20FWT&open=true` returns only the
survivor. DB cross-check: the two retired rows carry `duplicate_keys.mergedInto`
(evidence in TKT-092's data-fix postcheck).
