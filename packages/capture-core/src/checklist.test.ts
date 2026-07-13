import { describe, expect, it } from 'vitest';
import { createMockManifest } from './mock-session';
import { completionCounts, requiredShotsComplete } from './checklist';

describe('capture checklist', () => {
  it('requires the overview and damage close-up before submission', () => {
    const manifest = createMockManifest({
      progress: [
        { shotId: 'overview', status: 'accepted' },
        { shotId: 'damage-closeup', status: 'empty' }
      ]
    });

    expect(requiredShotsComplete(manifest)).toBe(false);
  });

  it('reports required and total completion counts', () => {
    const manifest = createMockManifest({
      progress: [
        { shotId: 'overview', status: 'accepted' },
        { shotId: 'damage-closeup', status: 'pending_review' },
        { shotId: 'vin', status: 'accepted' }
      ]
    });

    expect(requiredShotsComplete(manifest)).toBe(true);
    expect(completionCounts(manifest)).toEqual({
      requiredDone: 2,
      requiredTotal: 2,
      totalDone: 3,
      total: 10
    });
  });
});
