import { describe, expect, it } from 'vitest';
import { createMockManifest, requiredShotsComplete } from '@collisioncapture/core';

describe('capture app readiness', () => {
  it('keeps submit blocked until required shots upload', () => {
    expect(requiredShotsComplete(createMockManifest())).toBe(false);
  });
});

