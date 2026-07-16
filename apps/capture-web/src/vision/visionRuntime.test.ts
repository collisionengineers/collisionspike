import { describe, expect, it } from 'vitest';
import {
  NullVisionRuntime,
  isVisionModelManifest,
  resolveVisionRuntime
} from './visionRuntime';

function frame(): ImageData {
  return { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
}

describe('vision runtime seam', () => {
  it('resolves to an unavailable null runtime until a model is shipped', async () => {
    const runtime = resolveVisionRuntime();
    expect(runtime).toBeInstanceOf(NullVisionRuntime);
    expect(runtime.available).toBe(false);
    await expect(runtime.analyze(frame())).resolves.toEqual({ available: false });
    runtime.dispose();
  });

  it('validates a content-addressed model manifest shape', () => {
    expect(
      isVisionModelManifest({
        modelSha256: 'a'.repeat(64),
        modelVersion: 'yolo11n-det-v1',
        rulesVersion: 'deterministic-quality-v1',
        labels: ['front', 'unknown'],
        preprocessingVersion: 'letterbox-v1'
      })
    ).toBe(true);
  });

  it('rejects malformed or untrusted manifests', () => {
    expect(isVisionModelManifest(null)).toBe(false);
    expect(isVisionModelManifest({})).toBe(false);
    expect(isVisionModelManifest({ modelSha256: 'not-a-hash', modelVersion: 'v', rulesVersion: 'r', preprocessingVersion: 'p', labels: [] })).toBe(false);
    expect(isVisionModelManifest({ modelSha256: 'a'.repeat(64), modelVersion: 'v', rulesVersion: 'r', preprocessingVersion: 'p', labels: [1, 2] })).toBe(false);
  });
});
