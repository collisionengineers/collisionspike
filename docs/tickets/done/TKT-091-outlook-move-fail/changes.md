# Changes — TKT-091: Outlook File-to move failing live

## Status
Root-caused with App Insights + management-plane evidence; queue provisioned; error mapping + SPA
failure UX deployed (2026-07-09, PLAN-003 intake wave).

## The 503's root cause (azure-diagnostician dispatch — NOT cold start, NOT the B4 403)

The one live request (2026-07-06 12:39:41Z, operation `99f0ce3fbcd60feb989d353e5309db4d`, 173ms,
handler-completed) was OUR deliberate 503 mapping: `enqueueOutlookMove` threw because the Queue REST
POST to `cespkorchstdev01/outlook-move` returned **404 QueueNotFound — the `outlook-move` queue was
never provisioned** (management-plane listing confirmed: control/workitems/intake queues only). The
api MI already held `Storage Queue Data Message Sender` (send-only — it could never create the
queue), `OUTLOOK_MOVE_ENABLED=true` and the queue URL were set, and the orch `outlook-move` consumer
is deployed but had ZERO executions in 30d (nothing ever landed). The Exchange `Mail.ReadWrite`
grant (done 2026-07-03) was never reached.

## Shipped

- **Provisioned the queue** (the actual fix): management-plane PUT created
  `cespkorchstdev01/queueServices/default/queues/outlook-move` (2026-07-09; listing now shows it).
  Enqueue → consumer → Graph move → write-back is now end-to-end unblocked.
- **Error mapping** (`services/data-api/src/features/inbound/outlook-queue.ts` + `inbound.ts`): new `classifyEnqueueFailure`
  maps the failure families to machine-readable reasons + staff-facing sentences —
  `queue_missing` / `not_authorised` / `not_configured` / `no_identity` / `unavailable`; the route
  now `ctx.error`s the real exception (it previously lived only in the audit row), audits the
  reason, and returns `503 {error, reason, message}`; the gate-off 409 also carries a message.
  Unit tests: `services/data-api/src/features/inbound/outlook-queue.test.ts` (incl. the live QueueNotFound literal and a
  no-engineering-language assertion on every rendered sentence).
- **SPA failure UX** (`apps/web/src/data/rest-client.ts` + `screens/Inbox.tsx`): the rest client
  now attaches the server's `message` to thrown errors (`serverMessageOf`); the File-to toast
  renders THAT plain-English sentence (e.g. "Outlook filing is not fully set up yet — the filing
  queue is missing. Ask the administrator.") instead of the raw technical line.

## Deploy state
api redeployed (89 fns); SPA redeployed (200 + CSP verified); queue exists. Registry updated.

## Remainders (honest)
- **No live move was performed** — a real "File to…" moves an email (mailbox mutation, operator-only
  per the wave's rules). The operator's next click is the live probe: expect 202 → the orch
  `outlook-move` execution → the row flipping queued→moved → the email in the target folder +
  audit. The previously-failed row `a137d98f…` is latched `failed` and re-clickable by design.
- If that click 403s, THAT would be the (separate) Exchange-RBAC path — LIVE_FACTS records the
  grant as completed 2026-07-03, so none is expected.
