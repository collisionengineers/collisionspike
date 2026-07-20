import { describe, expect, it } from 'vitest';
import {
  assessedObservation,
  cloneClientCaptureObservation,
  unassessedObservation
} from './captureObservation';

const signals = {
  brightness: 0.5,
  contrast: 0.2,
  sharpness: 0.1,
  motion: 0.01
};

describe('client capture observations', () => {
  it('keeps unassessed observations minimal and versioned', () => {
    expect(unassessedObservation('guided', 'quality-v2')).toEqual({
      route: 'guided',
      disposition: 'unassessed',
      stableFrames: 0,
      rulesVersion: 'quality-v2'
    });
  });

  it('records a stable passing guided assessment as ready', () => {
    expect(assessedObservation({
      route: 'guided',
      rulesVersion: 'quality-v2',
      evaluation: { issue: null, instruction: 'Ready.', passing: true },
      signals,
      stableFrames: 3,
      ready: true
    })).toEqual({
      route: 'guided',
      disposition: 'ready',
      signals,
      stableFrames: 3,
      rulesVersion: 'quality-v2'
    });
  });

  it('records early or failing assessments as take-anyway and clamps transport values', () => {
    expect(assessedObservation({
      route: 'guided',
      rulesVersion: 'quality-v2',
      evaluation: { issue: 'too-dark', instruction: 'Move.', passing: false },
      signals: { brightness: -2, contrast: 4, sharpness: Number.NaN, motion: 0.25 },
      stableFrames: 999,
      ready: false
    })).toEqual({
      route: 'guided',
      disposition: 'take_anyway',
      issue: 'too-dark',
      signals: { brightness: 0, contrast: 1, sharpness: 0, motion: 0.25 },
      stableFrames: 120,
      rulesVersion: 'quality-v2'
    });
  });

  it('deep-clones signals before local persistence', () => {
    const original = assessedObservation({
      route: 'os_fallback',
      rulesVersion: 'quality-v2',
      evaluation: { issue: null, instruction: 'Ready.', passing: true },
      signals,
      stableFrames: 0,
      ready: true
    });
    const cloned = cloneClientCaptureObservation(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.signals).not.toBe(original.signals);
  });
});
