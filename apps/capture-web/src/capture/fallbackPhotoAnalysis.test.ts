import { describe, expect, it } from 'vitest';
import { analyseFallbackPixels } from './fallbackPhotoAnalysis';

function rgba(...pixels: Array<readonly [number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flatMap(([red, green, blue]) => [red, green, blue, 255]));
}

describe('fallback photo analysis', () => {
  it('evaluates decoded still pixels with motion fixed to zero', () => {
    const result = analyseFallbackPixels(
      rgba([0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]),
      2,
      2
    );

    expect(result.signals.brightness).toBeCloseTo(0.5);
    expect(result.signals.contrast).toBeCloseTo(0.5);
    expect(result.signals.motion).toBe(0);
    expect(result.signals.sharpness).toBe(1);
    expect(result.evaluation).toMatchObject({ passing: true, issue: null });
  });

  it('returns the deterministic exposure instruction for a dark still', () => {
    const result = analyseFallbackPixels(rgba([0, 0, 0], [0, 0, 0]), 2, 1);

    expect(result.signals.motion).toBe(0);
    expect(result.evaluation).toEqual({
      passing: false,
      issue: 'too-dark',
      instruction: 'Move to a brighter position.'
    });
  });
});
