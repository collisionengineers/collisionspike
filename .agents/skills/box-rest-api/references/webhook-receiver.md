# Box webhook receiver order

The order is load-bearing:

1. Reject timestamps outside the ten-minute replay window, allowing only small
   clock skew.
2. Compute HMAC-SHA256 over raw body plus delivery timestamp with both active
   keys. Compare both signatures in constant time.
3. Parse only after signature verification. Use delivery id as a same-worker
   fast path, never as the durable key.
4. Distinguish `FILE.UPLOADED` from `FILE.MOVED`; a move is not a new upload.
5. Resolve the owning case from the parent folder id through the Data API.
6. Post evidence through the Data API with source-message id
   `box:file:<file-id>`. That idempotent write is the durable dedup authority.
7. Write the audit event and request idempotent status evaluation on fresh and
   already-present evidence paths.
8. Return `200` only for a settled outcome. Return `503` for retryable dependency
   failures and release any provisional in-process delivery mark.

An unresolved folder is routed for review, never guessed. Signature keys and the
client secret are secret references. The endpoint must use public HTTPS with a
trusted certificate.

A future reconciliation sweep may list archive folders and compare them with
evidence records, but it is not part of the current receiver contract.
