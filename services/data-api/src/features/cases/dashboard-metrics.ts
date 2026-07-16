/** dashboard-metrics — reusable feature support. */

import { REASON_LABELS, isRetiredMerged, statusToStage, type ActionReason, type AgingExceptions, type AgingRow, type Case, type LiveCounts, type PipelineStage, type PipelineStageKey, type QueueName, type ReasonFacet, type Throughput } from '@cs/domain';
import { actionableCases, daysBetween, filterQueue, isSameDay, parseDmy, startOfDay, startOfWeek } from '../../shared/mapping/index.js';

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
  // The `new` funnel stage (new_email/ingested) is FOLDED into `not_ready` here so the
  // strip's "Not ready" equals the "Not ready" QUEUE (statusToQueue bundles them; the
  // funnel used to split them, which read as 123 vs 124). One general Not Ready field per
  // binding review 190626. The per-case spine still distinguishes `new` (statusToStage).
  const defs: { key: PipelineStageKey; label: string }[] = [
    { key: 'not_ready', label: 'Not ready' },
    { key: 'review', label: 'Review' },
    { key: 'submitted', label: 'Submitted' },
  ];
  const counts = new Map<PipelineStageKey, number>(defs.map((d) => [d.key, 0]));
  for (const c of all) {
    if (c.onHold) continue; // parked in Held, never a workflow-stage count
    if (isRetiredMerged(c)) continue; // TKT-141: a retired merged duplicate is resolved work, never a stage count
    const stage = statusToStage(c.status);
    if (stage === undefined) continue; // error/duplicate_risk/removed -> Held/none, never a funnel count
    const k = stage === 'new' ? 'not_ready' : stage; // fold just-arrived into Not ready
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    count: counts.get(d.key) ?? 0,
    tone: d.key === 'not_ready' ? 'stuck' : 'normal',
  }));
}
