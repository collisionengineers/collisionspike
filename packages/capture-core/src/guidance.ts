/**
 * Normalized measurements derived from a preview frame.
 *
 * These are lightweight image heuristics. They do not detect a vehicle or
 * assert that a photograph is suitable as evidence.
 */
export interface FrameQualitySignals {
  /** Mean relative luminance, from 0 (black) to 1 (white). */
  brightness: number;
  /** Population standard deviation of relative luminance. */
  contrast: number;
  /** Mean luminance difference between neighbouring pixels. */
  sharpness: number;
  /** Mean luminance difference from the supplied previous frame. */
  motion: number;
}

export interface FrameQualityAnalysis {
  signals: FrameQualitySignals;
  /** Reuse this value as `previousLuma` for the next frame. */
  currentLuma: Float32Array;
}

export interface QualityThresholds {
  minBrightness: number;
  maxBrightness: number;
  minContrast: number;
  minSharpness: number;
  maxMotion: number;
}

/**
 * Feasibility defaults for an early browser prototype.
 *
 * They are not vehicle-detection, damage-assessment, or evidential acceptance
 * thresholds. Calibrate them against labelled frames from the supported device
 * and environment matrix before using them to gate a production capture.
 */
export const DEFAULT_QUALITY_THRESHOLDS: Readonly<QualityThresholds> = Object.freeze({
  minBrightness: 0.18,
  maxBrightness: 0.88,
  minContrast: 0.08,
  minSharpness: 0.025,
  maxMotion: 0.08
});

export type FrameQualityIssue =
  | 'too-dark'
  | 'too-bright'
  | 'camera-moving'
  | 'not-sharp'
  | 'low-contrast'
  | null;

export interface FrameQualityEvaluation {
  issue: FrameQualityIssue;
  instruction: string;
  passing: boolean;
}

export interface GuidanceStabilityState {
  stableFrames: number;
  ready: boolean;
}

export const DEFAULT_REQUIRED_STABLE_FRAMES = 3;

/**
 * Analyse an RGBA preview frame without mutating its pixels or prior luminance.
 * Alpha is intentionally ignored.
 */
export function analyseFrameQuality(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  previousLuma?: Float32Array
): FrameQualityAnalysis {
  assertFrameDimensions(rgba, width, height);

  const pixelCount = width * height;
  if (previousLuma && previousLuma.length !== pixelCount) {
    throw new RangeError('previousLuma length must match the current frame dimensions.');
  }

  const currentLuma = new Float32Array(pixelCount);
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  let motionSum = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const rgbaIndex = pixel * 4;
    const luma =
      (0.2126 * rgba[rgbaIndex]! +
        0.7152 * rgba[rgbaIndex + 1]! +
        0.0722 * rgba[rgbaIndex + 2]!) /
      255;

    currentLuma[pixel] = luma;
    lumaSum += luma;
    lumaSquaredSum += luma * luma;

    if (previousLuma) {
      motionSum += Math.abs(luma - previousLuma[pixel]!);
    }
  }

  let neighbourDifferenceSum = 0;
  let neighbourComparisons = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const luma = currentLuma[pixel]!;

      if (x > 0) {
        neighbourDifferenceSum += Math.abs(luma - currentLuma[pixel - 1]!);
        neighbourComparisons += 1;
      }
      if (y > 0) {
        neighbourDifferenceSum += Math.abs(luma - currentLuma[pixel - width]!);
        neighbourComparisons += 1;
      }
    }
  }

  const brightness = lumaSum / pixelCount;
  const variance = Math.max(0, lumaSquaredSum / pixelCount - brightness * brightness);

  return {
    signals: {
      brightness,
      contrast: Math.sqrt(variance),
      sharpness:
        neighbourComparisons === 0 ? 0 : neighbourDifferenceSum / neighbourComparisons,
      motion: previousLuma ? motionSum / pixelCount : 0
    },
    currentLuma
  };
}

/** Return the single highest-priority instruction for the current frame. */
export function evaluateFrameQuality(
  signals: FrameQualitySignals,
  thresholds: Readonly<QualityThresholds> = DEFAULT_QUALITY_THRESHOLDS
): FrameQualityEvaluation {
  if (signals.brightness < thresholds.minBrightness) {
    return failure('too-dark', 'Move to a brighter position.');
  }
  if (signals.brightness > thresholds.maxBrightness) {
    return failure('too-bright', 'Move away from the bright light.');
  }
  if (signals.motion > thresholds.maxMotion) {
    return failure('camera-moving', 'Hold the camera steady.');
  }
  if (signals.sharpness < thresholds.minSharpness) {
    return failure('not-sharp', 'Tap to focus and hold steady.');
  }
  if (signals.contrast < thresholds.minContrast) {
    return failure('low-contrast', 'Move to a clearer view.');
  }

  return {
    issue: null,
    instruction: 'Photo quality looks good.',
    passing: true
  };
}

/**
 * Require consecutive passing frames before exposing a ready state.
 * Any failing frame resets stability immediately.
 */
export function advanceGuidanceStability(
  previous: Readonly<GuidanceStabilityState> | undefined,
  evaluation: Pick<FrameQualityEvaluation, 'passing'>,
  requiredStableFrames = DEFAULT_REQUIRED_STABLE_FRAMES
): GuidanceStabilityState {
  if (!Number.isInteger(requiredStableFrames) || requiredStableFrames < 1) {
    throw new RangeError('requiredStableFrames must be a positive integer.');
  }

  if (!evaluation.passing) {
    return { stableFrames: 0, ready: false };
  }

  const previousStableFrames = previous?.stableFrames ?? 0;
  const stableFrames = Math.min(requiredStableFrames, Math.max(0, previousStableFrames) + 1);

  return {
    stableFrames,
    ready: stableFrames >= requiredStableFrames
  };
}

function failure(
  issue: Exclude<FrameQualityIssue, null>,
  instruction: string
): FrameQualityEvaluation {
  return { issue, instruction, passing: false };
}

function assertFrameDimensions(rgba: Uint8ClampedArray, width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Frame width and height must be positive integers.');
  }

  const expectedLength = width * height * 4;
  if (rgba.length !== expectedLength) {
    throw new RangeError(`RGBA length must be exactly ${expectedLength} bytes.`);
  }
}
