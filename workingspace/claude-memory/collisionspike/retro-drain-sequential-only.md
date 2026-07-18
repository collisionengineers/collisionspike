---
name: retro-drain-sequential-only
description: Retro drain/re-drive runs must be SEQUENTIAL — concurrent starts trip Graph MailboxConcurrency 429s and taint not-found verdicts; also durabletask status polling needs the extension system key
metadata: 
  node_type: memory
  type: project
  originSessionId: 0aa70cef-1137-4eea-aaa9-7f9073dea412
---

Retro drain and force re-drive runs (POST /api/retro-case) must be driven ONE AT A TIME.
A 5-way concurrent sample on 2026-07-17 tripped Graph `ApplicationThrottled:
MailboxConcurrency` 429s — the per-mailbox salvage skips the throttled probe, so a
"trigger_not_found" verdict from a concurrent run can be throttle-tainted (false negative).
The 286-row sweep and 56-row re-drive both ran clean sequentially (~10-15s/row).

**Why:** each retro run makes several Graph calls per mailbox and the multi-mailbox
retroFindTrigger fallback (TKT-230) multiplies probes ×3; Graph allows only 4 concurrent
requests per app+mailbox pair.

**How to apply:** drive drains with a sequential loop polling each statusQueryGetUri to a
terminal state before the next POST (driver precedent: session scratchpad redrive-tnf.mjs /
the sweep agent's ledger driver — incremental JSONL ledger so interruptions lose nothing).
Poll-timeout rows keep running server-side under deterministic instance ids — reconcile
from the DB, never re-POST force while Running. Related: the durable runtime status URI
(`/runtime/webhooks/durabletask/instances/...`) needs the durabletask EXTENSION system key
(from createCheckStatusResponse), NOT the function key (403). See [[app-insights-retention-collapse]]
for evidence perishability during verification.
