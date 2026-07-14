# Verification — TKT-181: Show truthful photo-checking states

## Verdict
PENDING — no production-state audit, implementation, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — missing means zero eligible images only | Domain/integration table tests compare zero, one pending, one unusable and mixed images and assert only zero produces the missing state. | Signed-in case examples for zero images and present-but-unresolved images show different reasons; read-only data counts confirm actual file presence. | PENDING |
| A2 — canonical analysis state, timing and preview separation | Schema/domain tests enforce the six-state enum including unclassified, attempt/timing/reason fields, and prove preview/rendition errors alone cannot mutate analysis/readiness. | For representative signed-in images, reconcile visible/stored analysis state and demonstrate a preview failure leaves it unchanged unless original loss is separately proved. | PENDING |
| A3 — deterministic case-level wording | Exhaustive reducer tests cover zero, queued/checking, complete-ready, incomplete-required-set, failed, unusable, unclassified, expired and mixed combinations with exact rendered copy/counts. | Signed-in screenshots of no photos, checking, more-needed, attention and ready states match stored per-image composition, required-photo coverage and affected count. | PENDING |
| A4 — checking always expires and recovers after restart | Fake-clock state-machine and integration tests cross the configured deadline, restart the worker/app and prove stale work reaches attention with no active spinner. | Observe a real or operator-approved controlled live attempt beyond its deadline, including a wake/restart boundary where available, and capture the signed-in transition plus monitoring timestamps. | PENDING |
| A5 — unresolved-only idempotent retry | Concurrency/integration tests issue duplicate retry requests, prove one active attempt, skip ready images, and exercise both completion and repeat expiry. | Signed in, retry an unresolved image twice, show one new active attempt and no ready-image work, then capture its finite completion/attention result and stored attempts. | PENDING |
| A6 — useful per-image actions in plain language | Rendered tests cover each problem reason/action, action availability and a banned-language scan of all visible image-state copy. | Signed-in keyboard/pointer proof on failed and unusable images shows the correct affected image and working Retry/Open/Replace action without internal terms. | PENDING |
| A7 — evidence, readiness and queues agree | Contract tests feed every state through evidence, readiness, reason/count and queue filters and assert one canonical code/label path with no-photos, more-needed, checking, attention and ready kept distinct. | For signed-in examples of all five outcomes, reconcile evidence view, Not ready reason, queue membership/count and API/read-only record to the same state. | PENDING |
| A8 — stale/duplicate completions cannot corrupt newer truth | State-machine and integration tests replay late and duplicate completions across attempts and assert no duplicate evidence, decision overwrite or false ready transition; audit entries remain append-only. | Reconcile a naturally occurring duplicate/late completion if available; do not inject one into production solely for proof, and otherwise retain this live class as PENDING. | PENDING |

## Required artifact
- [Image analysis state audit](./evidence/image-analysis-state-audit.md) — PENDING.
