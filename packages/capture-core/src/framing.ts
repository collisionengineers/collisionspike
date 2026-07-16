import { insetRect, type Rect } from './geometry';

/**
 * Per-shot framing keys mirrored from the server shot plan
 * (`guidanceProfile.framing`). Any unrecognised value falls back to the neutral
 * `additional` guide, so the client never breaks on a newer server profile.
 *
 * These drive only the on-screen guide RECTANGLE — a visual aid. They do not
 * detect a vehicle, angle, or the requested subject; that is the on-device
 * vision runtime's job once a model is present.
 */
export type CaptureFraming =
  | 'whole_vehicle'
  | 'damage_closeup'
  | 'damage_context'
  | 'front_left'
  | 'front_right'
  | 'rear_left'
  | 'rear_right'
  | 'vin'
  | 'odometer'
  | 'additional';

export interface FramingGuideSpec {
  /** Fraction inset from the visible media rect before aspect fitting (0..0.5). */
  inset: number;
  /** Target width/height for the guide. `0` keeps the inset rect's own shape. */
  aspect: number;
}

/**
 * Distinct guide shape per shot so a VIN detail, a dashboard odometer, a tight
 * damage close-up, and a whole-vehicle overview no longer share one identical
 * box. Values are deliberate UX defaults, not calibrated measurements.
 */
const FRAMING_GUIDES: Readonly<Record<CaptureFraming, FramingGuideSpec>> = Object.freeze({
  whole_vehicle: { inset: 0.05, aspect: 4 / 3 },
  damage_closeup: { inset: 0.14, aspect: 1 },
  damage_context: { inset: 0.09, aspect: 4 / 3 },
  front_left: { inset: 0.06, aspect: 4 / 3 },
  front_right: { inset: 0.06, aspect: 4 / 3 },
  rear_left: { inset: 0.06, aspect: 4 / 3 },
  rear_right: { inset: 0.06, aspect: 4 / 3 },
  vin: { inset: 0.26, aspect: 3 / 1 },
  odometer: { inset: 0.24, aspect: 2 / 1 },
  additional: { inset: 0.07, aspect: 0 }
});

const DEFAULT_FRAMING: CaptureFraming = 'additional';

/** Resolve any string to a known framing, defaulting to the neutral guide. */
export function resolveCaptureFraming(value: unknown): CaptureFraming {
  return typeof value === 'string' && value in FRAMING_GUIDES
    ? (value as CaptureFraming)
    : DEFAULT_FRAMING;
}

/**
 * Compute the guide rectangle for a shot, centred inside the visible media rect.
 * Falls back to the neutral inset guide for an unknown framing.
 */
export function framingGuideRect(framing: unknown, visible: Readonly<Rect>): Rect {
  const spec = FRAMING_GUIDES[resolveCaptureFraming(framing)];
  const base = insetRect(visible, spec.inset);
  if (spec.aspect <= 0) return base;

  const baseAspect = base.width / base.height;
  // Fit the target aspect inside the inset base: height-limited when the base is
  // wider than the target, width-limited otherwise.
  const heightLimited = baseAspect > spec.aspect;
  const width = heightLimited ? base.height * spec.aspect : base.width;
  const height = heightLimited ? base.height : base.width / spec.aspect;

  return {
    x: base.x + (base.width - width) / 2,
    y: base.y + (base.height - height) / 2,
    width,
    height
  };
}
