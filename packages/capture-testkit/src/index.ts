import type { CaptureSessionManifest } from '@cs/capture-contracts';
import { createMockManifest } from '@cs/capture-core';

export function fixtureManifest(overrides: Partial<CaptureSessionManifest> = {}): CaptureSessionManifest {
  return createMockManifest(overrides);
}

