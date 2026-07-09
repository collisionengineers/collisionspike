/**
 * orchestration/src/functions/gated/eva-report-poll.ts — TKT-095 detector (c), DARK SKELETON.
 *
 * EVA Sentry report-retrieval polling → case `done` (ADR-0023). EVA REST is gated OFF
 * indefinitely (`EVA_API_ENABLED` — Minotaur's Sentry API supports only ONE principal
 * code per submission, so the whole REST path stays dark until Minotaur patches it;
 * see docs/gated.md + the eva-sentry-api skill). This file is therefore the SMALLEST
 * HONEST seam: the keyed starter + the eternal-orchestration shape + the gate check
 * exist, and NOTHING can fire — the tick activity is an explicit documented no-op.
 *
 * DESIGN (documented now, built when EVA REST activates — per the eva-sentry-api skill):
 *   - auth: POST /Token (client-credentials-style form) mints a bearer valid ~5 MINUTES —
 *     every poll pass must mint a fresh token (never cache across passes);
 *   - poll: GET /Report/GetAvailableReports lists reports EVA has released; match each
 *     released report to an `eva_submitted` case by claim ref / Case-PO;
 *   - transition: dataApi.markDone(caseId, 'eva_poll', <report ref>) — the shared
 *     guarded endpoint (`WHERE status_code = eva_submitted`) keeps the poll idempotent
 *     under Durable at-least-once + overlapping passes;
 *   - cadence: the subscriptionMonitorOrchestrator pattern — eternal orchestration,
 *     durable timer (wakes a scaled-to-zero Flex app), continueAsNew;
 *   - the EVA client route itself (functions/evasentry/eva_client.py GetAvailableReports)
 *     is NOT built here — it lands with EVA REST activation (changes.md remainder).
 *
 * Gates: EVA_API_ENABLED read INSIDE the starter AND the activity (the retro-case
 * convention: never in the orchestrator body — replay-safe). Off → honest refusals.
 * Deploying this file starts nothing: the orchestrator only runs if the KEYED HTTP
 * starter is invoked, and the starter refuses while the gate is off.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';

export const EVA_REPORT_POLL_INSTANCE_ID = 'eva-report-poll-singleton';

const INTERVAL_MINUTES = Number(process.env.EVA_REPORT_POLL_INTERVAL_MINUTES ?? '60');
const INTERVAL_MS =
  (Number.isFinite(INTERVAL_MINUTES) && INTERVAL_MINUTES > 0 ? INTERVAL_MINUTES : 60) * 60_000;

/* ============================================================
   Keyed manual starter (the retro-case pattern: authLevel 'function' — this
   lever would drive EVA reads + case writes when live, so it is keyed).
   Refuses while EVA_API_ENABLED is off; singleton-dedupes while on.
   ============================================================ */
app.http('eva-report-poll-start', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'eva-report-poll',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.evaApi()) {
      ctx.log('[eva-report-poll] skipped — EVA_API_ENABLED off (Minotaur single-principal limitation; docs/gated.md)');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off (EVA_API_ENABLED)' } };
    }
    const client = df.getClient(ctx);
    let existing;
    try {
      existing = await client.getStatus(EVA_REPORT_POLL_INSTANCE_ID);
    } catch {
      existing = undefined; // 404 = never run
    }
    const runtimeStatus = existing?.runtimeStatus as string | undefined;
    if (runtimeStatus && !['Failed', 'Terminated', 'Completed'].includes(runtimeStatus)) {
      ctx.log(`[eva-report-poll] singleton already ${runtimeStatus} — not restarted`);
      return { status: 200, jsonBody: { instanceId: EVA_REPORT_POLL_INSTANCE_ID, deduped: true, runtimeStatus } };
    }
    await client.startNew('evaReportPollOrchestrator', { instanceId: EVA_REPORT_POLL_INSTANCE_ID });
    return client.createCheckStatusResponse(req, EVA_REPORT_POLL_INSTANCE_ID);
  },
});

/* ============================================================
   The eternal-poll orchestration STUB — the transition seam.
   ============================================================ */
df.app.orchestration('evaReportPollOrchestrator', function* (ctx) {
  // One tick per pass. The tick owns ALL gate reads + (future) I/O; the orchestrator
  // body stays deterministic (the subscriptionMonitor doctrine).
  const tick = (yield ctx.df.callActivity('evaReportPollTick')) as {
    skipped?: string;
    marked?: number;
  };

  // Today the tick ALWAYS returns skipped ('gate_off' or 'poll_not_built'), so the
  // orchestration STOPS here — it never loops dark. When the poll body lands (EVA REST
  // activation), a non-skipped tick falls through to the eternal timer + continueAsNew
  // below, giving the subscriptionMonitor-style cadence with zero re-plumbing.
  if (tick.skipped) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[eva-report-poll] stopped: ${tick.skipped}`);
    }
    return { outcome: 'stopped', reason: tick.skipped };
  }

  const next = new Date(ctx.df.currentUtcDateTime.getTime() + INTERVAL_MS);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

/** The poll tick — gate check + the documented no-op (the honest dark state). */
df.app.activity('evaReportPollTick', {
  handler: async (_input: unknown, ctx): Promise<{ skipped?: string; marked?: number }> => {
    if (!gates.evaApi()) {
      ctx.log('[eva-report-poll] tick skipped — EVA_API_ENABLED off');
      return { skipped: 'gate_off' };
    }
    // Gate ON but the poll body is deliberately NOT built (EVA REST inactive — the
    // GetAvailableReports route in functions/evasentry/eva_client.py lands with
    // activation). Trace loudly so a premature gate flip is visible, and stop.
    ctx.warn(
      '[eva-report-poll] EVA_API_ENABLED is on but the GetAvailableReports poll body is not built ' +
        '(TKT-095 detector (c) skeleton — see the module doc + changes.md). No-op.',
    );
    return { skipped: 'poll_not_built' };
  },
});
