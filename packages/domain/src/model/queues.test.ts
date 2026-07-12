/**
 * packages/domain/src/model/queues.test.ts — the queue IA + funnel-stage mapping.
 *
 * Pins the superseding TKT-130 rule (2026-07-12): Review is strictly the
 * theoretically EVA-ready set. needs_review is incomplete and belongs in Not
 * ready. The funnel remains in lockstep with the queue contract (TKT-012).
 */

import { describe, it, expect } from 'vitest';
import { QUEUES, caseToQueue, isRetiredMerged, queueByName, statusToQueue, statusToStage } from './queues';
import type { CaseStatus } from './types';

describe('isRetiredMerged — the TKT-141 retired-duplicate predicate (one source)', () => {
  it('true ONLY for linked_to_instruction WITH a mergedInto survivor marker', () => {
    expect(isRetiredMerged({ status: 'linked_to_instruction', mergedInto: 'surv-1' })).toBe(true);
  });
  it('a plain linked_to_instruction case (no marker) keeps its historical meaning', () => {
    expect(isRetiredMerged({ status: 'linked_to_instruction' })).toBe(false);
    expect(isRetiredMerged({ status: 'linked_to_instruction', mergedInto: undefined })).toBe(false);
  });
  it('the marker alone never retires a non-merged status', () => {
    expect(isRetiredMerged({ status: 'needs_review', mergedInto: 'surv-1' })).toBe(false);
    expect(isRetiredMerged({ status: 'duplicate_risk', mergedInto: 'surv-1' })).toBe(false);
  });
});

describe('statusToQueue — TKT-130 queue routing', () => {
  it('needs_review lands in Not ready under the superseding rule', () => {
    expect(statusToQueue('needs_review')).toBe('not-ready');
  });

  it('ready_for_eva stays in the Review queue', () => {
    expect(statusToQueue('ready_for_eva')).toBe('review');
  });

  it('the Not ready queue holds every arrived-but-incomplete state', () => {
    for (const s of [
      'new_email',
      'ingested',
      'missing_images',
      'missing_required_fields',
      'linked_to_instruction',
      'needs_review',
    ] as CaseStatus[]) {
      expect(statusToQueue(s)).toBe('not-ready');
    }
    expect(queueByName('review')?.statuses).toEqual(['ready_for_eva']);
  });

  it('an explicit hold takes precedence over a passing status', () => {
    expect(caseToQueue({ status: 'ready_for_eva', onHold: true })).toBe('held');
    expect(caseToQueue({ status: 'ready_for_eva', onHold: false })).toBe('review');
  });

  it('Held holds error + duplicate_risk; terminals own no queue', () => {
    expect(statusToQueue('error')).toBe('held');
    expect(statusToQueue('duplicate_risk')).toBe('held');
    expect(statusToQueue('eva_submitted')).toBeUndefined();
    expect(statusToQueue('box_synced')).toBeUndefined();
    expect(statusToQueue('removed')).toBeUndefined();
  });

  it('no status is claimed by two queues (the IA stays a partition)', () => {
    const seen = new Map<string, string>();
    for (const q of QUEUES) {
      for (const s of q.statuses) {
        expect(seen.has(s), `${s} appears in both ${seen.get(s)} and ${q.name}`).toBe(false);
        seen.set(s, q.name);
      }
    }
  });
});

describe('statusToStage — the funnel stays in lockstep with the queues (TKT-012/130)', () => {
  it('needs_review counts in Not ready while ready_for_eva counts in Review', () => {
    expect(statusToStage('needs_review')).toBe('not_ready');
    expect(statusToStage('ready_for_eva')).toBe('review');
  });

  it('every queue-owned, non-Held status maps to the stage matching its queue', () => {
    const stageForQueue: Record<string, string> = {
      'not-ready': 'not_ready',
      review: 'review',
    };
    for (const q of QUEUES) {
      if (q.name === 'held') continue; // Held never inflates a funnel stage
      for (const s of q.statuses) {
        const stage = statusToStage(s);
        // new_email/ingested sit in the 'new' stage but the not-ready queue (by design).
        if (s === 'new_email' || s === 'ingested') {
          expect(stage).toBe('new');
        } else {
          expect(stage).toBe(stageForQueue[q.name]);
        }
      }
    }
  });

  it('Held states never inflate a funnel stage', () => {
    expect(statusToStage('error')).toBeUndefined();
    expect(statusToStage('duplicate_risk')).toBeUndefined();
  });
});
