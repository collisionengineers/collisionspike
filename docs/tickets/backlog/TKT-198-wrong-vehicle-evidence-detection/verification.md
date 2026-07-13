# Verification — TKT-198: Flag photos that show a different vehicle

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — normalized comparison and versioned threshold | Domain/classifier tests compare canonical plates and persist raw observation, classifier, numeric threshold version and source. | A real operator-designated image detail reconciles case/observed registration and versioned source record. | PENDING |
| A2 — calibrated activation and TKT-179 default | Full-corpus reports prove zero unsupported auto-exclusions at the chosen threshold; gate tests keep shadow-only before approval and then set Photo use “Do not use” with the named reason. | After approved activation, a naturally occurring qualifying mismatch shows the TKT-179 state and is absent from EVA preparation; otherwise PENDING. | PENDING |
| A3 — uncertainty never auto-excludes | Negative fixtures cover unreadable/partial/low-confidence/colour-only/missing-case-registration paths and assert no automatic exclusion. | Controlled low-confidence and colour-only images show check wording but remain awaiting a handler decision. | PENDING |
| A4 — useful, safe warning detail | API/UI snapshots include case/observed identity and plain reasons while excluding raw scores, model terms and internal ids. | Signed-in warning displays understandable comparison details and no banned implementation language. | PENDING |
| A5 — three explanations use one Photo use control | API/UI/integration tests map Correct vehicle to prior/Not decided, the other two to Do not use with reasons, and prove no parallel state or automatic deletion. | Genuine signed-in decisions show the TKT-179 state/reason and retained bytes; no decision is made solely for proof. | PENDING |
| A6 — staff authority, audit and idempotency | Override/rerun/replay tests preserve the human decision, record each transition once and prevent repeated warning/audit churn. | A signed-in decision survives reload/reclassification and the activity history shows the correct source/actor/time. | PENDING |
| A7 — consistent downstream exclusion/recompute | Readiness, image-gap, ordering and EVA-export tests omit excluded images but general evidence retains them; correction recomputes once. | Signed-in queues/case/EVA preparation and downloaded controlled export agree before and after one override. | PENDING |
| A8 — parity across every source lane | Email/PDF, Manual Intake, direct upload and Archive-upload integration tests use the same decision contract. | Operator-approved signed-in samples from available controlled lanes show identical warning/decision behavior. | PENDING |
| A9 — approved corpus and calibrated report | All named positive/negative/source/decision/rerun slices pass with published threshold, precision/recall and zero unsupported auto-exclusions. | Read-only live distribution is compared with the approved corpus slices and any drift blocks/rolls back activation. | PENDING |
| A10 — real deployed proof without seeded data | Full domain/API/orchestration/SPA/export suites plus isolated end-to-end scenarios pass. | Recorded operator-designated real evidence proves naturally available outcomes and no deletion; unavailable outcomes stay PENDING. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the approved corpus/calibration and isolated decision/downstream suites, then gather signed-in evidence only from genuine operator-designated work. Do not seed the live app; retain unavailable live rows as PENDING.
