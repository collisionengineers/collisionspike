# TKT-060 — changes

The retained ticket describes the delivered read-only assistant surface:

- an authenticated `POST /api/assistant/chat` route;
- a streamed web drawer for grounded case, queue, and inbox questions;
- read-only tools and a refusal path for mutation requests;
- staff-scoped data access, audit recording, per-principal rate limiting, and a default-off feature
  gate;
- managed-identity model access rather than a client-visible secret.

This artifact restores lifecycle parity for the existing done record. It does not claim a new deploy
or configuration change during PLAN-006.
