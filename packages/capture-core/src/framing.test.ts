import { describe, expect, it } from 'vitest';
import { framingGuideRect, resolveCaptureFraming } from './framing';
import type { Rect } from './geometry';

const visible: Rect = { x: 0, y: 0, width: 400, height: 300 };

describe('resolveCaptureFraming', () => {
  it('keeps a known framing and falls back to additional otherwise', () => {
    expect(resolveCaptureFraming('vin')).toBe('vin');
    expect(resolveCaptureFraming('whole_vehicle')).toBe('whole_vehicle');
    expect(resolveCaptureFraming('unknown-future-shape')).toBe('additional');
    expect(resolveCaptureFraming(undefined)).toBe('additional');
    expect(resolveCaptureFraming(42)).toBe('additional');
  });
});

describe('framingGuideRect', () => {
  it('gives distinct guides to a whole-vehicle overview and a VIN detail', () => {
    const overview = framingGuideRect('whole_vehicle', visible);
    const vin = framingGuideRect('vin', visible);
    // The overview fills far more of the frame than the tight VIN box.
    expect(overview.width * overview.height).toBeGreaterThan(vin.width * vin.height * 3);
  });

  it('honours the target aspect ratio for a shot', () => {
    const vin = framingGuideRect('vin', visible);
    expect(vin.width / vin.height).toBeCloseTo(3 / 1, 5);
    const odometer = framingGuideRect('odometer', visible);
    expect(odometer.width / odometer.height).toBeCloseTo(2 / 1, 5);
  });

  it('stays centred within the visible media rect', () => {
    const guide = framingGuideRect('damage_closeup', visible);
    const centreX = guide.x + guide.width / 2;
    const centreY = guide.y + guide.height / 2;
    expect(centreX).toBeCloseTo(visible.x + visible.width / 2, 5);
    expect(centreY).toBeCloseTo(visible.y + visible.height / 2, 5);
    // Fully contained.
    expect(guide.x).toBeGreaterThanOrEqual(visible.x);
    expect(guide.y).toBeGreaterThanOrEqual(visible.y);
    expect(guide.x + guide.width).toBeLessThanOrEqual(visible.x + visible.width + 1e-9);
    expect(guide.y + guide.height).toBeLessThanOrEqual(visible.y + visible.height + 1e-9);
  });

  it('falls back to the neutral inset guide for an unknown framing', () => {
    const unknown = framingGuideRect('mystery', visible);
    const additional = framingGuideRect('additional', visible);
    expect(unknown).toEqual(additional);
  });
});
