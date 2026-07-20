import { describe, expect, it } from 'vitest';
import { analyseFallbackPixels } from './fallbackPhotoAnalysis';

function rgba(...pixels: Array<readonly [number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flatMap(([red, green, blue]) => [red, green, blue, 255]));
}

describe('fallback photo analysis', () => {
  it('evaluates decoded still pixels with motion fixed to zero', () => {
    // A sharp, contrasty, well-exposed still with no clipped highlights.
    const result = analyseFallbackPixels(
      rgba([64, 64, 64], [192, 192, 192], [192, 192, 192], [64, 64, 64]),
      2,
      2
    );

    expect(result.signals.brightness).toBeCloseTo(0.5);
    expect(result.signals.contrast).toBeGreaterThan(0.1);
    expect(result.signals.motion).toBe(0);
    expect(result.signals.sharpness).toBeGreaterThan(0.1);
    expect(result.evaluation).toMatchObject({ passing: true, issue: null });
  });

  it('flags glare on a still whose highlights are clipped despite a fine average', () => {
    const result = analyseFallbackPixels(
      rgba([255, 255, 255], [255, 255, 255], [0, 0, 0], [0, 0, 0]),
      2,
      2
    );

    expect(result.signals.brightness).toBeCloseTo(0.5);
    expect(result.evaluation).toMatchObject({ passing: false, issue: 'too-bright' });
    expect(result.evaluation.instruction).toContain('glare');
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
