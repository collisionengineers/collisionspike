# Regression follow-up — 2026-07-11

PR 55 review found several correctness gaps in the queued backfill path: its case target can become
stale after enqueue, same-named attachments share a blob key, provider AI opt-out fails open on a
lookup error, attachment fetch failures can be reported as success, and terminal/reporting failures
can either create a false manual-attachment note or be acknowledged without retry. Failure-note
idempotency is also case-wide rather than inbound-email-specific.

## Acceptance

- A job persists only while the inbound email is still linked to its queued target case.
- Distinct Graph attachments always receive distinct storage keys even when filenames match.
- Provider AI permission uncertainty fails closed without sending image bytes to the model.
- Every listed attachment either lands or makes the job incomplete; partial fetches cannot report success.
- Post-persist status/report failures never tell staff to attach evidence that already landed.
- A failed terminal report is retried/poisoned instead of acknowledged.
- Failure-note idempotency is scoped to the inbound email so separate failures remain visible.
- Tests cover detach/relink races, duplicate filenames, lookup/fetch/report failures, and replays.

## Second-pass additions

- A case merge and a queued backfill cannot interleave so that newly recovered evidence remains on
  the retired source case; the merge locks and moves the source email/evidence set atomically.
- Attachment enumeration follows every Graph page, so messages with more than one response page
  cannot lose later files.
- A retryable Graph failure while corroborating a search candidate is retried rather than converted
  into a false "message not found" result.
- The generated API and orchestration publish bundles contain every source fix before release.

## Implementation

- Backfill persistence is target-guarded and idempotent, attachment Blob names include the Graph
  attachment id, provider-policy uncertainty fails closed, and per-email recovery notes reconcile
  failed/partial/completed outcomes (`0266f03`).
- Merge/backfill share ordered locks; Graph attachment and subject-search enumeration is bounded,
  cycle-safe and paginated (`e22b4a1`).
- Message relocation/null/404 gaps retry through the final dequeue, a survivor redirect forces
  reclassification against the new case, and committed evidence returns a durable status generation
  that is atomically evaluated without turning a transient status failure into a failed backfill
  (`0e30f89`).
- Accepting a case-link now commits a durable recovery generation with the link and review decision;
  a timer/re-review drain can enqueue it after a host failure, so an accepted suggestion cannot strand
  its attachments between the database commit and queue send (`070a0bf`).
- Completed/partial/failed reporting is stored under the inbound row lock. Exact response-loss replays
  return success without duplicate notes or audit events, while a genuine outcome transition remains
  visible once (`070a0bf`).
- Backfill target probing now detects a mixed READ COMMITTED owner/lineage snapshot and retries, while
  managed-identity and storage 429/5xx failures remain queue-retryable (`c22433c`, `85f6f59`).
- Each queued job now carries its recovery generation. Evidence rows, the completed generation and
  the exact committed `completed`/`partial` counts are written atomically; reporting reads that stored
  result instead of inferring success from a later snapshot. A lost response therefore replays the
  same truth, while an older generation cannot overwrite a newer result. Legacy jobs without a
  generation remain compatible but do not invent a completion marker.
- Publisher paging advances beyond a full page of lineage-ineligible legacy rows, so a poison page
  cannot starve later valid requests. A later generation remains bound to the case accepted for that
  generation and may follow only a verified `mergedInto` lineage; an unrelated relink is not silently
  adopted. `api/src/functions/ai-suggestions.test.ts` pins poison-page progress, later generations and
  real merge lineage.
- A fixed-id eternal Durable monitor publishes pending recovery generations every five minutes via the
  service-authenticated API drain. Repeated starts are singleton-safe, and enqueue acknowledgement is
  generation/owner guarded (`evidence-backfill-publisher-monitor.test.ts`,
  `evidence-backfill-drain.test.ts`).
- `internal-evidence-backfill.test.ts` and orchestration `evidence-backfill.test.ts` cover exact-result
  replay, partial persistence, stale/superseded generations, merge redirection, Graph pagination and
  retryable fetch/report failures. These are offline results; the schema, monitor and repaired bundles
  have not yet been deployed.
