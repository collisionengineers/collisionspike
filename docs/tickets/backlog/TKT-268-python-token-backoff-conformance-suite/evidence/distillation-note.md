# Distillation note — TKT-268

**Source:** `05-python-doctrine-and-parity.md` ticket 2. **Plan:** PLAN-011. Re-verified read-only 2026-07-19
(`PLAN-011.dossier.json`).

**Why behavioural, not "copies-in-sync":** finding E is non-uniform (four backoff variants, three cache
shapes; two services with no cache, two with no bounded backoff). Pinning identical *implementation* would be
wrong — the clients legitimately differ by auth mechanism. So the suite pins **observable behaviour** each
client claims:
- token minted → cached → refreshed near expiry (for the clients that cache);
- bounded retry honours 429/5xx + `Retry-After` where the client claims it (for the clients that back off);
- a client that does neither (`location-assist/ai_reasoning.py`) declares that, so the suite does not demand
  behaviour it never promised.

**Guard property:** a synthetic divergence (cache ignoring expiry; retrying a non-transient 4xx) must fail.
Runs under `verify-all.mjs`. Reverse path (if TKT-267 chooses it): a minimal shared module mirroring
`@cs/server-runtime`'s shape.
