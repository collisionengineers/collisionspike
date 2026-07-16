# Diagnostics

Diagnostics are read-only unless the task explicitly authorizes a fix. Establish the failing boundary
before changing code or configuration.

## Triage order

1. Reproduce the user-visible symptom and capture time, user role, Case/PO or operation identity, and the
   exact response status.
2. Confirm which deployed component handled the request.
3. Inspect that component's resource health and its own Application Insights instance.
4. Trace the correlation/operation identity across web, Data API, orchestration, queue, Python service,
   and database records.
5. Check current feature flags and identity assignments without returning secret values.
6. Compare observed routes/function registrations with the reviewed build artifact.
7. State one evidence-backed root cause and the narrowest recommended fix.

## Common boundaries

| Symptom | First checks |
| --- | --- |
| Web request blocked | Browser network response, API CORS origin, bearer presence, audience, and app role |
| 401/403 | Token audience/expiry, role claim, API assignment, then database request context |
| Mail missing | Current Graph subscription, mailbox scope, notification receipt, fetch result, and durable instance |
| Intake stalled | Operation status, queue message, orchestration history, poison/retry state, and last committed audit |
| Parser disagreement | Exact source digest, parser version, extracted record, and fixture reproduction |
| Vehicle lookup failure | Data API audit, service outcome, provider-specific status, and credential reference health |
| Archive failure | Scope check, signature/replay result, stable operation key, folder identity, and Archive service logs |
| Database error | Application role, row-level context, migration level, lock/timeout, and server logs |

## Anti-churn rule

After the same live command or operation fails twice, stop. Preserve the outputs, route the diagnosis to
the relevant specialist, and consult authoritative vendor documentation before another attempt.
