import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '../data';
import { EVIDENCE_SAVE_ERROR, persistEvidenceReview } from './evidence-review';

const evidence = {
  id: 'ev-1',
  fileName: 'photo.jpg',
  kind: 'image',
  imageRole: 'overview',
  registrationVisible: true,
  acceptedForEva: true,
  excluded: false,
  sourceLabel: 'auto-intake',
} as Evidence;

describe('persistEvidenceReview', () => {
  it('returns only server-confirmed evidence on success', async () => {
    const updated = { ...evidence, excluded: true, acceptedForEva: false };
    const save = vi.fn().mockResolvedValue(updated);
    await expect(
      persistEvidenceReview('ev-1', { excluded: true, acceptedForEva: false }, save),
    ).resolves.toEqual({ updated });
  });

  it('returns no replacement row when the PATCH fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('503'));
    const result = await persistEvidenceReview('ev-1', { excluded: true }, save);
    expect(result).toEqual({ error: EVIDENCE_SAVE_ERROR });
    expect(result.updated).toBeUndefined();
  });
});
