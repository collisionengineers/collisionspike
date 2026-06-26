/**
 * api/src/functions/dashboard.ts — dashboard / queue aggregate HTTP routes.
 *
 * DataAccess methods 14–19 (plan 21 §21.1):
 *   14 GET /api/dashboard/live-counts        liveCounts        -> LiveCounts
 *   15 GET /api/dashboard/throughput         throughput        -> Throughput
 *   16 GET /api/dashboard/aging-exceptions   agingExceptions   -> AgingExceptions
 *   17 GET /api/dashboard/queue-counts       queueCounts       -> Record<QueueName, number>
 *   18 GET /api/dashboard/reason-counts      reasonCounts      -> ReasonFacet[] (zero dropped)
 *   19 GET /api/dashboard/pipeline-stages    pipelineStages    -> PipelineStage[]
 *
 * Each read accepts ?now=<ISO-8601> (absent => server now()). The Monday-anchored
 * week windowing + statusToQueue/statusToStage logic (previously in dataverse-source.ts)
 * runs server-side here over the adapted Case[] using @cs/domain helpers (D10), so the
 * numbers are identical for identical data.
 */

import { app, type HttpRequest } from '@azure/functions';
import {
  REASON_LABELS,
  statusToStage,
  type ActionReason,
  type AgingExceptions,
  type AgingRow,
  type Case,
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

// 14 — GET /api/dashboard/live-counts
app.http('liveCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/live-counts',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);
    const result: LiveCounts = {
      notReady: filterQueue(all, 'not-ready').length,
      review: filterQueue(all, 'review').length,
      held: filterQueue(all, 'held').length,
    };
    return { status: 200, jsonBody: result };
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
    const today = startOfDay(now);
    const weekStart = startOfWeek(now);
    let inToday = 0;
    let submittedToday = 0;
    let clearedThisWeek = 0;
    for (const c of all) {
      if (isSameDay(parseDmy(c.createdAt), today)) inToday += 1;
      const sub = parseDmy(c.submittedAt);
      if (sub) {
        if (isSameDay(sub, today)) submittedToday += 1;
        if (startOfDay(sub).getTime() >= weekStart.getTime()) clearedThisWeek += 1;
      }
    }
    const result: Throughput = { inToday, submittedToday, clearedThisWeek };
    return { status: 200, jsonBody: result };
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
    const result: AgingExceptions = {
      rows,
      pastDueCount: rows.filter((r) => r.pastDue).length,
      duplicateCount: rows.filter((r) => r.reason === 'duplicate').length,
      conflictCount: rows.filter((r) => r.reason === 'conflict').length,
    };
    return { status: 200, jsonBody: result };
  }),
});

// 17 — GET /api/dashboard/queue-counts
app.http('queueCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/queue-counts',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);
    const result: Record<QueueName, number> = {
      'not-ready': filterQueue(all, 'not-ready').length,
      review: filterQueue(all, 'review').length,
      held: filterQueue(all, 'held').length,
    };
    return { status: 200, jsonBody: result };
  }),
});

// 18 — GET /api/dashboard/reason-counts
app.http('reasonCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/reason-counts',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);
    const tally = new Map<ActionReason, number>();
    for (const c of actionableCases(all)) {
      if (!c.actionReason) continue;
      tally.set(c.actionReason, (tally.get(c.actionReason) ?? 0) + 1);
    }
    const result: ReasonFacet[] = (Object.keys(REASON_LABELS) as ActionReason[])
      .map((reason) => ({ reason, label: REASON_LABELS[reason], count: tally.get(reason) ?? 0 }))
      .filter((f) => f.count > 0);
    return { status: 200, jsonBody: result };
  }),
});

// 19 — GET /api/dashboard/pipeline-stages
app.http('pipelineStages', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/pipeline-stages',
  handler: withRole('CollisionSpike.User', async (req) => {
    const now = nowParam(req);
    const all = await loadAllCases(now);
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
      if (k === undefined) continue; // error/duplicate_risk -> Held, never a funnel count
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const result: PipelineStage[] = defs.map((d) => ({
      key: d.key,
      label: d.label,
      count: counts.get(d.key) ?? 0,
      tone: d.key === 'not_ready' ? 'stuck' : 'normal',
    }));
    return { status: 200, jsonBody: result };
  }),
});
