---
name: box-rest-api
description: Current Box REST API reference for collisionspike archive integration, including server-side CCG authentication, folders, file requests, shared links, webhook signatures, retry behavior, and least-privilege scopes. Use when building or validating services/functions/box-webhook or an archive caller.
---

# Box REST API

Use this skill for the current server-side archive integration. Read only the
reference needed for the task:

- [endpoints.md](references/endpoints.md) for request and response shapes;
- [webhook-receiver.md](references/webhook-receiver.md) for the load-bearing
  verification, deduplication, and retry order;
- [filerequest-and-metadata.md](references/filerequest-and-metadata.md) for upload
  links and optional metadata.

## Binding rules

- Mint the CCG token only in the archive function. Never expose credentials to a
  browser or log them.
- Use App Access Only with the minimum approved scopes (`root_readwrite` and
  `manage_webhook` where webhook management is required).
- Preserve the existing function routes and Data API contracts.
- Treat the `box:file:<file-id>` source-message tag as the durable evidence
  idempotency key. `box_file_id` is correlation data, not the dedup key.
- Verify both webhook signatures in constant time inside the replay window.
- Process the durable write before returning success. Return a retryable non-2xx
  response for transient dependency failures because Box does not retry a 2xx.
- User-facing product copy calls this integration Archive.

Implementation lives in `services/functions/box-webhook`; current environment
facts live in `docs/operations/live-environment.md`.
