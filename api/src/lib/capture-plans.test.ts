import { describe, expect, it } from 'vitest';
import {
  captureExpiryHours,
  captureShotPlan,
  configuredCaptureGuidanceMode,
} from './capture-plans.js';

describe('capture plan snapshots', () => {
  it('defaults to the essential two-photo readiness set', () => {
    const plan = captureShotPlan(undefined);
    expect(plan?.id).toBe('essential-v1');
    expect(plan?.shots.map((shot) => [shot.id, shot.required])).toEqual([
      ['overview', true],
      ['damage-closeup', true],
    ]);
  });

  it('offers the standard exterior set without adding more required shots', () => {
    const plan = captureShotPlan('standard-exterior-v1');
    expect(plan?.shots.length).toBeGreaterThan(2);
    expect(plan?.shots.filter((shot) => shot.required).map((shot) => shot.id)).toEqual([
      'overview',
      'damage-closeup',
    ]);
    expect(plan?.shots.every((shot) => !('repeatable' in shot))).toBe(true);
  });

  it('allows only the approved expiry windows', () => {
    expect(captureExpiryHours(undefined)).toBe(72);
    expect([24, 72, 168].map(captureExpiryHours)).toEqual([24, 72, 168]);
    expect(captureExpiryHours(48)).toBeUndefined();
  });

  it('validates and defaults the immutable guidance-mode snapshot', () => {
    expect(configuredCaptureGuidanceMode(undefined)).toBe('advisory');
    expect(configuredCaptureGuidanceMode(' SHADOW ')).toBe('shadow');
    expect(configuredCaptureGuidanceMode('off')).toBe('off');
    expect(configuredCaptureGuidanceMode('enforced')).toBe('enforced');
    expect(configuredCaptureGuidanceMode('automatic')).toBeUndefined();
  });
});
