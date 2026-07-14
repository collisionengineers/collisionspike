# PLAN-005 reopen follow-up — 2026-07-14

Independent live/source verification returned `FAILED`:

- the request and Function carry no provider corpus sites;
- backend production code cannot emit `corpus_match`;
- live telemetry proves Vision/Maps calls but cannot attribute Blob versus Archive bytes;
- Maps dependency telemetry currently records the subscription-key query parameter.

Reopen TKT-077 to implement the added acceptance in the ticket, rotate the exposed Maps key, deploy through
the approved Azure path, and repeat the two-source signed-in proof. No key value is recorded here.
