import { describe, expect, it } from 'vitest';
import type { Chaser } from '../data';
import { overviewChaserForPanel, overviewChaserStatusText } from './ChaserPanel';

function chaser(overrides: Partial<Chaser> = {}): Chaser {
  return {
    id: 'ch-1',
    targetType: 'work_provider',
    targetName: 'Provider',
    channel: 'email',
    templateUsed: 'Overview photo request',
    status: 'drafted',
    summary: 'Ask for a whole-vehicle photo',
    createdAt: '11/07/2026',
    ...overrides,
  };
}

describe('overview-photo chase visibility', () => {
  it('keeps an eligible backend draft visible even when ordinary missing-item templates are inapplicable', () => {
    const existing = overviewChaserForPanel([chaser()]);
    expect(existing?.templateUsed).toBe('Overview photo request');
    expect(overviewChaserStatusText(existing!)).toBe(
      'Drafted overview photo request — ready to copy and send.',
    );
  });

  it('preserves truthful sent wording', () => {
    expect(overviewChaserStatusText(chaser({ status: 'sent', sentAt: '11/07/2026 14:30' })))
      .toBe('Overview photo request sent on 11/07/2026 14:30.');
  });

  it('does not revive a responded overview request', () => {
    expect(overviewChaserForPanel([chaser({ status: 'responded' })])).toBeUndefined();
  });
});
