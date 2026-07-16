# Regression follow-up — 11 July 2026

## Why this ticket reopened

The PR 55 activation audit found that two advertised confirmation actions could not reach their
existing staff routes successfully:

- `reclassify_inbound` advertised `POST`, while the live route accepts `PATCH`;
- `create_case` emitted the compact assistant proposal shape, while the manual case route assumed a
  complete reviewed-case body and dereferenced missing `status` and `evaFields` values.

The write tier must remain dark until every advertised proposal can survive the human-confirm path
without a method mismatch or malformed body.

## Acceptance

- The capability registry and the inbound-classification route use the same HTTP method.
- A confirmed compact create-case proposal is normalised into a valid manual case without weakening
  the existing full Manual Intake contract.
- The claimant name is persisted in the claimant EVA field and the registration/provider identity is
  handled by the same server-side create path as a normal manual case.
- Contract tests exercise the registry-generated method, path and body against the actual routes.
- The gate remains off until the repaired API and SPA are deployed and smoke-tested.

## Second-pass additions

- Every confirmed mutation must survive a fast-path status failure, show the independently fetched
  target, retain its success result until staff dismiss it, and invalidate only the resource that
  actually committed.
- File Request creation must be durable across remote failure and host restart. The API is the sole
  owner; the former orchestration starter must not create a second request.
- An attachment batch must be immutable while the assistant resolves its target. A second selection
  or later conversation must not replace the bytes or retarget the first batch.

## Implementation

- Reclassification uses the route's real `PATCH` contract. Compact create proposals are normalised by
  the existing manual-create path, including claimant EVA data and server-side provider/registration
  handling. Shared EVA edit limits and normalisation now live in
  `packages/domain/src/contracts/eva-edit.ts`, used by both proposal validation and API writes.
- Confirmations fail closed when target state or a version is unavailable, keep state-setting replay
  detection separate from non-observable creates/chases, preserve successful results until Dismiss,
  return the created case id, and publish a committed-write event only after success. Case, queue,
  dashboard and inbound hooks subscribe to the exact resource/kind so mounted views refetch without a
  full reload (`ConfirmActionCard.test.ts`, `mutation-events.test.ts`, `rest-client.test.ts`).
- A File Request click now advances a database generation and drains through
  `box_file_request_outbox`. Repeated clicks share the pending generation; remote failure stays
  replayable; the public link and generation complete atomically. The earlier orchestration starter is
  a 410 tombstone, leaving the API/outbox as the only creator (`box-file-request-outbox.test.ts`,
  `box-maintenance-monitor.test.ts`).
- The assistant drawer freezes each accepted attachment selection into an immutable batch, prevents a
  second batch/new conversation until resolution, and captures the case target once. The pure
  regressions in `attach-validate.test.ts` prove replacement and retargeting cannot occur.
- The write gate remains disabled in the currently deployed stack. Offline tests and builds are green;
  repaired API/SPA deployment and a signed-in write smoke test are still required before activation.
