import { describe, expect, it } from 'vitest';
import { containedMediaRect, insetRect } from './geometry';

describe('containedMediaRect', () => {
  it('letterboxes a landscape sensor inside a portrait stage', () => {
    expect(containedMediaRect(390, 700, 1920, 1080)).toEqual({
      x: 0,
      y: 240.3125,
      width: 390,
      height: 219.375
    });
  });

  it('pillarboxes a portrait sensor inside a landscape stage', () => {
    expect(containedMediaRect(800, 400, 1080, 1920)).toEqual({
      x: 287.5,
      y: 0,
      width: 225,
      height: 400
    });
  });

  it('rejects unusable dimensions', () => {
    expect(() => containedMediaRect(0, 400, 1920, 1080)).toThrow(RangeError);
  });
});

describe('insetRect', () => {
  it('keeps the guide centred inside the visible media', () => {
    expect(insetRect({ x: 0, y: 100, width: 400, height: 200 }, 0.1)).toEqual({
      x: 40,
      y: 120,
      width: 320,
      height: 160
    });
  });
});
