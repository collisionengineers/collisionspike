# Regression follow-up — 2026-07-11

PR 55's functionality audit found that the Archive report-PDF detector treated the final
`mark-done` call as best-effort. Transport and non-success responses were swallowed after the webhook
returned 200, preventing redelivery and permanently missing the required case transition. The receiver's
same-worker delivery cache could also return 200 to a duplicate while the owning request was still in
flight; if the owner then failed, Box had already observed a false success.

## Acceptance

- A report-PDF delivery settles only after a successful `mark-done` response; a guarded
  `{updated:false}` response remains a valid idempotent no-op.
- Transport, malformed-response and non-success failures return 503 so Box redelivers.
- Redelivery reuses durable evidence existence and the guarded transition, without duplicating evidence.
- An in-flight same-id duplicate never receives a settled 200; it receives a retry response until the
  owning request settles.
- Tests cover fresh evidence followed by mark-done failure, deduplicated redelivery recovery, and a
  concurrent first-request failure with a duplicate arriving before it completes.

## Implementation

- The Box webhook client now treats an unset Data API URL, transport failure, non-success response or
  malformed response as a retryable failure. Only a successful response settles the delivery; a
  successful `{updated:false}` remains the intended idempotent guard result.
- Delivery deduplication now distinguishes `in_flight` from `settled`. A same-id delivery arriving
  while the owner is still running receives 503 and cannot acknowledge work that the owner may later
  fail.
- Evidence persistence remains durable and idempotent before the terminal call, so a Box redelivery
  retries `mark-done` without creating a second engineer-report row.
- `services/functions/box-webhook/tests/test_data_api_client.py` covers success, guarded no-op, transport and
  HTTP failure. `services/functions/box-webhook/tests/test_webhook.py` covers fresh-evidence failure,
  deduplicated recovery and a
  concurrent duplicate arriving before the first request fails. The shared API transition is also
  rollback-tested in `services/data-api/src/features/cases/terminal-transition.test.ts`.
