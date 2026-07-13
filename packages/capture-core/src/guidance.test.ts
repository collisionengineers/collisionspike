import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_THRESHOLDS,
  advanceGuidanceStability,
  analyseFrameQuality,
  evaluateFrameQuality,
  type FrameQualitySignals,
  type GuidanceStabilityState,
  type QualityThresholds
} from './guidance';

function rgba(...pixels: Array<[number, number, number, number?]>): Uint8ClampedArray {
  return new Uint8ClampedArray(
    pixels.flatMap(([red, green, blue, alpha = 255]) => [red, green, blue, alpha])
  );
}

const passingSignals: FrameQualitySignals = {
  brightness: 0.5,
  contrast: 0.2,
  sharpness: 0.2,
  motion: 0.01
};

const thresholds: QualityThresholds = {
  minBrightness: 0.2,
  maxBrightness: 0.8,
  minContrast: 0.1,
  minSharpness: 0.1,
  maxMotion: 0.1
};

describe('analyseFrameQuality', () => {
  it('calculates normalized brightness and luminance while ignoring alpha', () => {
    const analysis = analyseFrameQuality(
      rgba([0, 0, 0, 0], [255, 255, 255, 12]),
      2,
      1
    );

    expect(analysis.signals.brightness).toBeCloseTo(0.5);
    expect(analysis.signals.contrast).toBeCloseTo(0.5);
    expect(analysis.signals.sharpness).toBeCloseTo(1);
    expect(analysis.signals.motion).toBe(0);
    expect([...analysis.currentLuma]).toEqual([0, 1]);
  });

  it('uses relative-luminance channel weighting', () => {
    const { currentLuma } = analyseFrameQuality(
      rgba([255, 0, 0], [0, 255, 0], [0, 0, 255]),
      3,
      1
    );

    expect(currentLuma[0]).toBeCloseTo(0.2126, 4);
    expect(currentLuma[1]).toBeCloseTo(0.7152, 4);
    expect(currentLuma[2]).toBeCloseTo(0.0722, 4);
  });

  it('reports more sharpness for alternating pixels than for a flat frame', () => {
    const flat = analyseFrameQuality(
      rgba([128, 128, 128], [128, 128, 128], [128, 128, 128], [128, 128, 128]),
      2,
      2
    );
    const alternating = analyseFrameQuality(
      rgba([0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]),
      2,
      2
    );

    expect(flat.signals.sharpness).toBe(0);
    expect(alternating.signals.sharpness).toBe(1);
  });

  it('calculates motion against the previous luminance frame', () => {
    const previous = analyseFrameQuality(rgba([0, 0, 0], [255, 255, 255]), 2, 1);
    const current = analyseFrameQuality(
      rgba([255, 255, 255], [255, 255, 255]),
      2,
      1,
      previous.currentLuma
    );

    expect(current.signals.motion).toBeCloseTo(0.5);
    expect([...previous.currentLuma]).toEqual([0, 1]);
  });

  it('supports a single-pixel frame without producing non-finite values', () => {
    const { signals } = analyseFrameQuality(rgba([128, 128, 128]), 1, 1);

    expect(signals.sharpness).toBe(0);
    expect(Object.values(signals).every(Number.isFinite)).toBe(true);
  });

  it.each([
    { name: 'zero width', pixels: rgba(), width: 0, height: 1 },
    { name: 'fractional height', pixels: rgba([0, 0, 0]), width: 1, height: 1.5 },
    { name: 'wrong RGBA length', pixels: rgba([0, 0, 0]), width: 2, height: 1 }
  ])('rejects $name', ({ pixels, width, height }) => {
    expect(() => analyseFrameQuality(pixels, width, height)).toThrow(RangeError);
  });

  it('rejects a previous frame with different dimensions', () => {
    expect(() =>
      analyseFrameQuality(rgba([0, 0, 0], [0, 0, 0]), 2, 1, new Float32Array(1))
    ).toThrow('previousLuma length');
  });
});

describe('evaluateFrameQuality', () => {
  it('accepts a frame when every signal is within the supplied thresholds', () => {
    expect(evaluateFrameQuality(passingSignals, thresholds)).toEqual({
      issue: null,
      instruction: 'Photo quality looks good.',
      passing: true
    });
  });

  it.each([
    {
      signal: { brightness: 0.19 },
      issue: 'too-dark',
      instruction: 'Move to a brighter position.'
    },
    {
      signal: { brightness: 0.81 },
      issue: 'too-bright',
      instruction: 'Move away from the bright light.'
    },
    {
      signal: { motion: 0.11 },
      issue: 'camera-moving',
      instruction: 'Hold the camera steady.'
    },
    {
      signal: { sharpness: 0.09 },
      issue: 'not-sharp',
      instruction: 'Tap to focus and hold steady.'
    },
    {
      signal: { contrast: 0.09 },
      issue: 'low-contrast',
      instruction: 'Move to a clearer view.'
    }
  ])('returns one instruction for $issue', ({ signal, issue, instruction }) => {
    expect(evaluateFrameQuality({ ...passingSignals, ...signal }, thresholds)).toEqual({
      issue,
      instruction,
      passing: false
    });
  });

  it('uses deterministic issue priority when several checks fail', () => {
    expect(
      evaluateFrameQuality(
        { brightness: 0.1, contrast: 0, sharpness: 0, motion: 1 },
        thresholds
      ).issue
    ).toBe('too-dark');
    expect(
      evaluateFrameQuality(
        { brightness: 0.5, contrast: 0, sharpness: 0, motion: 1 },
        thresholds
      ).issue
    ).toBe('camera-moving');
    expect(
      evaluateFrameQuality(
        { brightness: 0.5, contrast: 0, sharpness: 0, motion: 0 },
        thresholds
      ).issue
    ).toBe('not-sharp');
  });

  it('treats exact minimum and maximum threshold values as passing', () => {
    expect(
      evaluateFrameQuality(
        {
          brightness: thresholds.minBrightness,
          contrast: thresholds.minContrast,
          sharpness: thresholds.minSharpness,
          motion: thresholds.maxMotion
        },
        thresholds
      ).passing
    ).toBe(true);
  });

  it('uses the exported feasibility defaults when thresholds are omitted', () => {
    expect(
      evaluateFrameQuality({
        brightness: DEFAULT_QUALITY_THRESHOLDS.minBrightness - 0.01,
        contrast: 1,
        sharpness: 1,
        motion: 0
      }).issue
    ).toBe('too-dark');
  });
});

describe('advanceGuidanceStability', () => {
  const pass = { passing: true };
  const fail = { passing: false };

  it('becomes ready only after the required consecutive passing frames', () => {
    let state: GuidanceStabilityState | undefined;

    state = advanceGuidanceStability(state, pass, 3);
    expect(state).toEqual({ stableFrames: 1, ready: false });
    state = advanceGuidanceStability(state, pass, 3);
    expect(state).toEqual({ stableFrames: 2, ready: false });
    state = advanceGuidanceStability(state, pass, 3);
    expect(state).toEqual({ stableFrames: 3, ready: true });
  });

  it('resets immediately when a frame fails', () => {
    expect(advanceGuidanceStability({ stableFrames: 2, ready: false }, fail, 3)).toEqual({
      stableFrames: 0,
      ready: false
    });
    expect(advanceGuidanceStability({ stableFrames: 3, ready: true }, fail, 3)).toEqual({
      stableFrames: 0,
      ready: false
    });
  });

  it('caps stable frames after becoming ready', () => {
    expect(advanceGuidanceStability({ stableFrames: 3, ready: true }, pass, 3)).toEqual({
      stableFrames: 3,
      ready: true
    });
  });

  it('does not mutate the previous state', () => {
    const previous = { stableFrames: 1, ready: false };
    advanceGuidanceStability(previous, pass, 3);
    expect(previous).toEqual({ stableFrames: 1, ready: false });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid required frame count: %s', value => {
    expect(() => advanceGuidanceStability(undefined, pass, value)).toThrow(RangeError);
  });
});
