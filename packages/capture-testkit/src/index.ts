import type { CaptureSessionManifest } from '@collisioncapture/contracts';
import { createMockManifest } from '@collisioncapture/core';

export function fixtureManifest(overrides: Partial<CaptureSessionManifest> = {}): CaptureSessionManifest {
  return createMockManifest(overrides);
}

