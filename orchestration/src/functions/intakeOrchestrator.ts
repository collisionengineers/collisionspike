/**
 * orchestration/src/functions/intakeOrchestrator.ts
 *
 * Durable orchestrator: the intake pipeline (replaces the 7 live Power Automate flows).
 * Plan 22 §B — function-chaining pattern.
 *
 * Chain (activities run in order; each is at-least-once / must be idempotent):
 *   A0. fetchMessage     → Graph: GET message + attachments; land bytes → Blob cespkevidstdev01
 *   1.  providerMatch    → Data API: match sender domain → work-provider
 *   2.  caseResolve      → Data API: VRM merge / ADR-0010 dedup ladder (UNIQUE(sourcemessageid))
 *   3.  classifyPersist  → Data API: classify attachments + persist evidence rows
 *   4.  parse            → parser Python Function (gated PDF_MAPPER_ENABLED)
 *   5.  statusEvaluate   → Data API: EVA-readiness + status machine
 *   6.  enrich           → enrichment Python Function (gated ENRICHMENT_ENABLED)
 *
 * Retry policy: 5 s first retry, 2x backoff, max 60 s interval, 3 attempts per activity.
 * An exhausted activity throws — the orchestrator can catch to route to Held/error state.
 */

import * as df from 'durable-functions';

const retry = new df.RetryOptions(/*firstRetryIntervalInMilliseconds*/ 5_000, /*maxNumberOfAttempts*/ 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

df.app.orchestration('intakeOrchestrator', function* (ctx) {
  // `resource` (users/<mailbox>/…) is enqueued by graph-webhook so fetchMessage can derive the mailbox.
  const input = ctx.df.getInput() as { messageId: string; resource?: string; receivedAt?: string };

  // A0 — fetch message from Graph + land bytes in Blob; returns normalised inbound envelope
  const inbound: unknown = yield ctx.df.callActivityWithRetry('fetchMessage', retry, input);

  // 1 — provider-match (idempotent read; safe to retry)
  const provider: unknown = yield ctx.df.callActivityWithRetry('providerMatch', retry, inbound);

  // 2 — case-resolve (UNIQUE(sourcemessageid) backstop makes upsert idempotent)
  const resolved = (yield ctx.df.callActivityWithRetry('caseResolve', retry, {
    inbound,
    providerId: (provider as { workProviderId?: string }).workProviderId,
    matchState: (provider as { matchState?: string }).matchState,
  })) as { outcome: string; caseId: string };

  if (resolved.outcome === 'already_ingested') {
    return { skipped: true, caseId: resolved.caseId };
  }

  // 3 — classify + persist evidence rows
  yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
    caseId: resolved.caseId,
    inbound,
  });

  // 4 — parse (gate PDF_MAPPER_ENABLED checked inside the activity; no-op when off)
  yield ctx.df.callActivityWithRetry('parse', retry, { caseId: resolved.caseId });

  // 5 — status evaluate (EVA-readiness + status machine via Data API)
  const status = (yield ctx.df.callActivityWithRetry('statusEvaluate', retry, {
    caseId: resolved.caseId,
  })) as { value: string };

  // 6 — enrich (gate ENRICHMENT_ENABLED checked inside the activity; no-op when off)
  yield ctx.df.callActivityWithRetry('enrich', retry, { caseId: resolved.caseId });

  return { caseId: resolved.caseId, status: status.value };
});
