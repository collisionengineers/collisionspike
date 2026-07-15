/**
 * services/data-api/src/features/cases/dashboard-routes.ts — dashboard / queue aggregate HTTP routes.
 *
 * DataAccess methods 14–19 (plan 21 §21.1) + the work-todo-spike amalgamated dashboard:
 *   14 GET /api/dashboard/live-counts        liveCounts        -> LiveCounts
 *   15 GET /api/dashboard/throughput         throughput        -> Throughput
 *   16 GET /api/dashboard/aging-exceptions   agingExceptions   -> AgingExceptions
 *   17 GET /api/dashboard/queue-counts       queueCounts       -> Record<QueueName, number>
 *   18 GET /api/dashboard/reason-counts      reasonCounts      -> ReasonFacet[] (zero dropped)
 *   19 GET /api/dashboard/pipeline-stages    pipelineStages    -> PipelineStage[]
 *   -- GET /api/dashboard                     dashboardSummary  -> DashboardSummary (ONE call:
 *      the case overview AND the inbound-email overview, so the compact cockpit needs a
 *      single request — work-todo-spike: amalgamated-dashboard / dashboard-logic).
 *
 * Each read accepts ?now=<ISO-8601> (absent => server now()). The Monday-anchored week
 * windowing + statusToQueue/statusToStage logic runs server-side here over the adapted
 * Case[] using @cs/domain helpers, so the numbers are identical for identical data. The
 * per-metric math is extracted into pure compute* helpers (exported, unit-tested) so the
 * standalone endpoints and the combined summary share ONE implementation.
 */

import { app, type HttpRequest } from '@azure/functions';
import {
  INBOUND_COUNTS_ZERO,
  type Case,
  type DashboardSummary,
  type InboundCounts,
} from '@cs/domain';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query } from '../../platform/db/client.js';
import {
  CASE_SELECT,
  rowToCase,
  tallyActiveInboundCounts,
  type Row,
} from '../../shared/mapping/index.js';
import {
  computeAgingExceptions,
  computeLiveCounts,
  computePipelineStages,
  computeQueueCounts,
  computeReasonFacets,
  computeThroughput,
} from './dashboard-metrics.js';

function nowParam(req: HttpRequest): Date {
  const raw = req.query.get('now');
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function loadAllCases(now: Date): Promise<Case[]> {
  const rows = await query<Row>(`${CASE_SELECT} ORDER BY c.created_at DESC`);
  return rows.map((r) => rowToCase(r, { now }));
}

// 14 — GET /api/dashboard/live-counts
app.http('liveCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/live-counts',
  handler: withRole('CollisionSpike.User', async (req) => {
    const all = await loadAllCases(nowParam(req));
    return { status: 200, jsonBody: computeLiveCounts(all) };
  }),
});

// 15 — GET /api/dashboard/throughput
app.http('throughput', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/throughput',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);
    return { status: 200, jsonBody: computeThroughput(all, now) };
  }),
});

// 16 — GET /api/dashboard/aging-exceptions
app.http('agingExceptions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/aging-exceptions',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);
    return { status: 200, jsonBody: computeAgingExceptions(all, now) };
  }),
});

// 17 — GET /api/dashboard/queue-counts
app.http('queueCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/queue-counts',
  handler: withRole('CollisionSpike.User', async (req) => {
    const all = await loadAllCases(nowParam(req));
    return { status: 200, jsonBody: computeQueueCounts(all) };
  }),
});

// 18 — GET /api/dashboard/reason-counts
app.http('reasonCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/reason-counts',
  handler: withRole('CollisionSpike.User', async (req) => {
    const all = await loadAllCases(nowParam(req));
    return { status: 200, jsonBody: computeReasonFacets(all) };
  }),
});

// 19 — GET /api/dashboard/pipeline-stages
app.http('pipelineStages', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/pipeline-stages',
  handler: withRole('CollisionSpike.User', async (req) => {
    const all = await loadAllCases(nowParam(req));
    return { status: 200, jsonBody: computePipelineStages(all) };
  }),
});

/* ============================================================
   GET /api/dashboard   (combined case + inbound overview — ONE call)
   work-todo-spike: amalgamated-dashboard. The compact cockpit gets case progress AND
   incoming-mail pressure in a single request instead of two. Inbound counts are
   ACTIVE-FIRST (handled rows excluded) and honest-zero on any inbound read failure, so a
   not-yet-wired inbound table never sinks the case overview.
   ============================================================ */
app.http('dashboardSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);

    let inbound: InboundCounts = { ...INBOUND_COUNTS_ZERO };
    try {
      const inboundRows = await query<Row>('SELECT category_code, triage_state FROM inbound_email');
      inbound = tallyActiveInboundCounts(inboundRows);
    } catch {
      /* honest-zero: a missing/unwired inbound table must not sink the case overview. */
    }

    const summary: DashboardSummary = {
      liveCounts: computeLiveCounts(all),
      throughput: computeThroughput(all, now),
      queueCounts: computeQueueCounts(all),
      pipelineStages: computePipelineStages(all),
      reasonFacets: computeReasonFacets(all),
      agingExceptions: computeAgingExceptions(all, now),
      inbound,
    };
    return { status: 200, jsonBody: summary };
  }),
});
