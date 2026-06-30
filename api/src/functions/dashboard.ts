/**
 * api/src/functions/dashboard.ts — dashboard / queue aggregate HTTP routes.
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
  REASON_LABELS,
  statusToStage,
  type ActionReason,
  type AgingExceptions,
  type AgingRow,
  type Case,
  type DashboardSummary,
  type InboundCounts,
  type LiveCounts,
  type PipelineStage,
  type PipelineStageKey,
  type QueueName,
  type ReasonFacet,
  type Throughput,
} from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import {
  CASE_SELECT,
  actionableCases,
  daysBetween,
  filterQueue,
  isSameDay,
  parseDmy,
  rowToCase,
  startOfDay,
  startOfWeek,
  tallyActiveInboundCounts,
  type Row,
} from '../lib/mappers.js';

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

/* ============================================================
   Pure aggregate compute helpers (exported; unit-tested) — ONE implementation
   shared by the standalone endpoints and the combined /api/dashboard summary.
   ============================================================ */

export function computeLiveCounts(all: Case[]): LiveCounts {
  return {
    notReady: filterQueue(all, 'not-ready').length,
    review: filterQueue(all, 'review').length,
    held: filterQueue(all, 'held').length,
  };
}

export function computeThroughput(all: Case[], now: Date): Throughput {
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  let inToday = 0;
  let submittedToday = 0;
  let clearedThisWeek = 0;
  let submittedTotal = 0;
  for (const c of all) {
    if (isSameDay(parseDmy(c.createdAt), today)) inToday += 1;
    // LIFETIME cumulative "reached the submitted stage" — distinct from the windowed metrics
    // so the UI labels a total tile honestly (work-todo-spike: dashboard-logic gap #3).
    if (statusToStage(c.status) === 'submitted') submittedTotal += 1;
    const sub = parseDmy(c.submittedAt);
    if (sub) {
      if (isSameDay(sub, today)) submittedToday += 1;
      if (startOfDay(sub).getTime() >= weekStart.getTime()) clearedThisWeek += 1;
    }
  }
  return { inToday, submittedToday, clearedThisWeek, submittedTotal };
}

export function computeAgingExceptions(all: Case[], now: Date): AgingExceptions {
  const today = startOfDay(now);
  const rows: AgingRow[] = actionableCases(all)
    .map((c) => {
      const due = parseDmy(c.dateDue);
      const daysToDue = due ? daysBetween(today, due) : Number.POSITIVE_INFINITY;
      return {
        case: c,
        daysToDue,
        pastDue: due ? daysToDue < 0 : false,
        ...(c.actionReason ? { reason: c.actionReason } : {}),
      };
    })
    .sort((a, b) => a.daysToDue - b.daysToDue);
  return {
    rows,
    pastDueCount: rows.filter((r) => r.pastDue).length,
    duplicateCount: rows.filter((r) => r.reason === 'duplicate').length,
    conflictCount: rows.filter((r) => r.reason === 'conflict').length,
  };
}

export function computeQueueCounts(all: Case[]): Record<QueueName, number> {
  return {
    'not-ready': filterQueue(all, 'not-ready').length,
    review: filterQueue(all, 'review').length,
    held: filterQueue(all, 'held').length,
  };
}

export function computeReasonFacets(all: Case[]): ReasonFacet[] {
  const tally = new Map<ActionReason, number>();
  for (const c of actionableCases(all)) {
    if (!c.actionReason) continue;
    tally.set(c.actionReason, (tally.get(c.actionReason) ?? 0) + 1);
  }
  return (Object.keys(REASON_LABELS) as ActionReason[])
    .map((reason) => ({ reason, label: REASON_LABELS[reason], count: tally.get(reason) ?? 0 }))
    .filter((f) => f.count > 0);
}

export function computePipelineStages(all: Case[]): PipelineStage[] {
  const defs: { key: PipelineStageKey; label: string }[] = [
    { key: 'new', label: 'New' },
    { key: 'not_ready', label: 'Not ready' },
    { key: 'review', label: 'Review' },
    { key: 'submitted', label: 'Submitted' },
  ];
  const counts = new Map<PipelineStageKey, number>(defs.map((d) => [d.key, 0]));
  for (const c of all) {
    if (c.onHold) continue; // parked in Held, never a workflow-stage count
    const k = statusToStage(c.status);
    if (k === undefined) continue; // error/duplicate_risk/removed -> Held/none, never a funnel count
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    count: counts.get(d.key) ?? 0,
    tone: d.key === 'not_ready' ? 'stuck' : 'normal',
  }));
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
