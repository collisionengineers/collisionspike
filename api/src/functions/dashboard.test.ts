/**
 * api/src/functions/dashboard.test.ts — pure aggregate compute helpers (no DB/auth/host).
 * Covers the queue/stage taxonomy, on-hold override, the windowed-vs-lifetime throughput split
 * (work-todo-spike: amalgamated-dashboard / dashboard-logic), aging, and reason facets.
 */
import { describe, it, expect } from 'vitest';
import type { Case, EvaFields } from '@cs/domain';
import {
  computeAgingExceptions,
  computeLiveCounts,
  computePipelineStages,
  computeQueueCounts,
  computeReasonFacets,
  computeThroughput,
} from './dashboard';
import { filterQueue } from '../lib/mappers.js';

/** Minimal Case factory — the compute helpers read only status/onHold/dates/actionReason. */
function mkCase(over: Partial<Case> = {}): Case {
  const base: Case = {
    id: 'c1',
    vrm: '',
    provider: '',
    providerCode: '',
    vehicleModel: '',
    evaFields: {} as EvaFields,
    evidence: [],
    notes: [],
    chasers: [],
    overviewFacts: {},
    status: 'ingested',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: '' },
    ageDays: 0,
    inspectionDecision: 'unknown',
    createdAt: '01/06/2026',
  };
  return { ...base, ...over };
}

const NOW = new Date(2026, 5, 17); // Wed 17 June 2026 (week is Mon 15 → Sun 21)

describe('computeThroughput — windowed metrics + lifetime submittedTotal', () => {
  const cases = [
    mkCase({ id: 'A', status: 'ingested', createdAt: '17/06/2026' }), // entered today
    mkCase({ id: 'B', status: 'eva_submitted', submittedAt: '17/06/2026' }), // submitted today
    mkCase({ id: 'C', status: 'box_synced', submittedAt: '15/06/2026' }), // submitted Mon this week
    mkCase({ id: 'D', status: 'eva_submitted', submittedAt: '10/06/2026' }), // submitted last week
  ];
  const t = computeThroughput(cases, NOW);

  it('counts cases that entered today', () => {
    expect(t.inToday).toBe(1); // A only
  });
  it('counts cases submitted today (windowed)', () => {
    expect(t.submittedToday).toBe(1); // B only
  });
  it('counts cases cleared this Mon-anchored week (windowed)', () => {
    expect(t.clearedThisWeek).toBe(2); // B (17th) + C (15th); D (10th) is last week
  });
  it('counts ALL submitted-stage cases for the lifetime total (not windowed)', () => {
    expect(t.submittedTotal).toBe(3); // B + C + D; A is still ingested
  });
});

describe('computeLiveCounts / computeQueueCounts — queue taxonomy + on-hold override', () => {
  const cases = [
    mkCase({ id: '1', status: 'ingested' }), // not-ready
    mkCase({ id: '2', status: 'ready_for_eva' }), // review
    mkCase({ id: '3', status: 'error' }), // held
    mkCase({ id: '4', status: 'ingested', onHold: true }), // on-hold overrides -> held
    mkCase({ id: '5', status: 'eva_submitted' }), // terminal -> no queue
  ];
  it('buckets by queue with on-hold forcing Held', () => {
    expect(computeLiveCounts(cases)).toEqual({ notReady: 1, review: 1, held: 2 });
  });
  it('queue-counts matches live-counts shape', () => {
    expect(computeQueueCounts(cases)).toEqual({ 'not-ready': 1, review: 1, held: 2 });
  });
});

describe('computePipelineStages — funnel excludes Held/terminal-none', () => {
  const cases = [
    mkCase({ id: '1', status: 'new_email' }),
    mkCase({ id: '2', status: 'ingested' }),
    mkCase({ id: '3', status: 'needs_review' }),
    mkCase({ id: '4', status: 'ready_for_eva' }),
    mkCase({ id: '5', status: 'eva_submitted' }),
    mkCase({ id: '6', status: 'error' }), // Held -> no stage
    mkCase({ id: '7', status: 'removed' }), // soft-removed -> no stage
    mkCase({ id: '8', status: 'ingested', onHold: true }), // parked -> no stage
  ];
  it('folds new_email/ingested into Not ready so it matches the Not-ready queue', () => {
    const byKey = Object.fromEntries(computePipelineStages(cases).map((s) => [s.key, s.count]));
    // 2 new (new_email + ingested) = 2 Not ready; needs_review + ready_for_eva = 2 Review
    // (TKT-130: needs_review sits in the Review queue/stage); onHold/error/removed excluded.
    expect(byKey).toEqual({ not_ready: 2, review: 2, submitted: 1 });
  });
  it('the strip Not-ready count equals the Not-ready QUEUE (no 123-vs-124 split)', () => {
    const stages = Object.fromEntries(computePipelineStages(cases).map((s) => [s.key, s.count]));
    const queueNotReady = filterQueue(cases, 'not-ready').length;
    expect(stages.not_ready).toBe(queueNotReady);
  });
});

describe('computeReasonFacets — actionable cases, zero facets dropped', () => {
  const cases = [
    mkCase({ id: '1', status: 'ingested', actionReason: 'duplicate' }),
    mkCase({ id: '2', status: 'needs_review', actionReason: 'duplicate' }),
    mkCase({ id: '3', status: 'ready_for_eva', actionReason: 'conflict' }),
    mkCase({ id: '4', status: 'eva_submitted', actionReason: 'conflict' }), // terminal -> not actionable
  ];
  it('tallies reasons across the actionable queues and drops zero counts', () => {
    const facets = computeReasonFacets(cases);
    const byReason = Object.fromEntries(facets.map((f) => [f.reason, f.count]));
    expect(byReason.duplicate).toBe(2);
    expect(byReason.conflict).toBe(1); // the terminal case's reason is not counted
    expect(facets.every((f) => f.count > 0)).toBe(true); // zero facets dropped
  });
});

describe('computeAgingExceptions — past-due + reason tallies, oldest-first', () => {
  const cases: Case[] = [
    mkCase({ id: 'past', status: 'ingested', dateDue: '10/06/2026', actionReason: 'duplicate' }),
    mkCase({ id: 'future', status: 'ready_for_eva', dateDue: '20/06/2026', actionReason: 'conflict' }),
  ];
  const ex = computeAgingExceptions(cases, NOW);
  it('orders rows oldest-due-first', () => {
    expect(ex.rows.map((r) => r.case.id)).toEqual(['past', 'future']);
  });
  it('counts past-due, duplicate and conflict', () => {
    expect(ex.pastDueCount).toBe(1);
    expect(ex.duplicateCount).toBe(1);
    expect(ex.conflictCount).toBe(1);
  });
});
