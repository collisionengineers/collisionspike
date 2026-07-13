# Verification — TKT-196: Create evidence stills from case videos

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — safe availability and no run-time evidence change | UI/domain tests cover supported video/photo-gap conditions and assert opening/running leaves acceptance/order/readiness unchanged. | A naturally occurring operator-designated case shows the action at the right time and unchanged case state while extraction runs. | PENDING |
| A2 — bounded asynchronous terminal outcomes | Worker/job tests enforce every documented limit and terminal/retry behavior for unsupported/corrupt/encrypted/oversized/timeout inputs. | Naturally occurring deployed success/failure jobs remain responsive and show plain terminal/retry states; unavailable live outcomes remain PENDING. | PENDING |
| A3 — deterministic representative oriented frames | Known-frame/VFR/rotation/duplicate-scene fixtures produce pinned timestamps/hashes for the same source/version. | Candidates from a genuine operator-designated video visibly cover the timeline with correct orientation and no duplicate views above threshold. | PENDING |
| A4 — temporary reviewed candidates only | Persistence/readiness tests prove previews create no evidence; UI tests require keep/leave-out/order plus explicit confirmation. | Signed-in database/UI check during review shows zero new evidence and preserves candidate choices. | PENDING |
| A5 — selected-only derived evidence with provenance/order | Manifest tests assert selected frame count/order and every named source/version/actor/operation field. | After confirmation, UI/database/content hash and audit show only selected frames in chosen order. | PENDING |
| A6 — immutable original and independent derived deletion | Evidence tests compare original video bytes/metadata before/after and delete/exclude one derived still without sibling/source mutation. | Signed-in source video remains viewable and byte-identical after a genuine create and operationally required derived-still removal/exclusion; otherwise the removal row stays PENDING. | PENDING |
| A7 — canonical classification and readiness | Integration tests route accepted stills through existing classification/decision/readiness gates and reject bypasses. | A genuinely accepted still displays canonical role/decision state; readiness changes only when all normal requirements pass. | PENDING |
| A8 — idempotent retries/confirmation | Response-loss, rerun and double-confirm tests produce one row/blob/Archive item per frame identity; a different frame remains addable. | A safe retry required during genuine work reconciles no duplicates; absent that occurrence, live retry proof stays PENDING. | PENDING |
| A9 — safe temporary cleanup | Retention/cleanup tests remove rejected/unconfirmed temp items only and audit counts without touching accepted/source content. | After the retention window or controlled cleanup, rejected preview is absent while accepted still and original remain. | PENDING |
| A10 — authorization and hostile-input safety | API/RLS, filename/metadata injection, resource-boundary and no-external-egress tests pass. | Cross-case/unauthorized signed-in calls are denied; telemetry shows bounded local/approved processing and no source-byte egress. | PENDING |
| A11 — accessible truthful review surface | Keyboard/focus/viewport/state persistence and false-success tests cover preparing/ready/partial/failure/reload. | Keyboard-only desktop/narrow signed-in pass retains selections and reports success only after confirmed persistence. | PENDING |
| A12 — complete isolated and live scenario set | All named fixture, fault, lifecycle and cleanup scenarios pass with pinned outputs. | Recorded genuine operator-designated work reconciles every naturally available keep/reject/source/timestamp/hash/order/classification/audit outcome; unavailable live outcomes remain PENDING. | PENDING |

## Pending / gaps
No extractor, review surface, bounded job or signed-in/live proof has been implemented.

## How to re-verify
Run all isolated fixture/fault/security suites, then gather signed-in evidence only from genuine operator-designated case work. Attach evidence to every available row, retain unavailable live outcomes as `PENDING`, and do not create live cases or evidence solely for verification. An independent verifier must confirm all twelve acceptance lines.
