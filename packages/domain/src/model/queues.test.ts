/**
 * packages/domain/src/model/queues.test.ts — the queue IA + funnel-stage mapping.
 *
 * Pins TKT-130 (2026-07-08 operator direction): needs_review cases belong in the
 * REVIEW queue (the human-in-the-loop queue), not "Not ready" — and the funnel
 * stage mapping stays in lockstep with the queues so the dashboard tiles, the
 * pipeline strip, and the queue tabs all agree (TKT-012 single-sourcing).
 */

import { describe, it, expect } from 'vitest';
import { QUEUES, queueByName, statusToQueue, statusToStage } from './queues';
import type { CaseStatus } from './types';

describe('statusToQueue — TKT-130 queue routing', () => {
  it('needs_review lands in the Review queue (operator direction 2026-07-08)', () => {
    expect(statusToQueue('needs_review')).toBe('review');
  });

  it('ready_for_eva stays in the Review queue', () => {
    expect(statusToQueue('ready_for_eva')).toBe('review');
  });

  it('the Not ready queue holds the arrived-but-incomplete states (no needs_review)', () => {
    for (const s of [
      'new_email',
      'ingested',
      'missing_images',
      'missing_required_fields',
      'linked_to_instruction',
    ] as CaseStatus[]) {
      expect(statusToQueue(s)).toBe('not-ready');
    }
    expect(queueByName('not-ready')?.statuses).not.toContain('needs_review');
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
  it('needs_review counts in the review stage (matches its queue)', () => {
    expect(statusToStage('needs_review')).toBe('review');
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
