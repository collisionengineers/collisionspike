import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '../data';
import {
  EVIDENCE_SAVE_ERROR,
  GUIDED_CAPTURE_EXCLUDED_WARNING,
  GUIDED_CAPTURE_REVIEW_WARNING,
  guidedCaptureReviewWarning,
  mergeEvidenceReviewDecision,
  persistEvidenceReview,
  releaseEvidenceMutation,
  tryAcquireEvidenceMutation,
} from './evidence-review';

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
  it('shows a plain-language warning only for excluded submitted capture photos', () => {
    const submitted = { ...evidence, sourceLabel: 'public_guided_capture', excluded: true };

    expect(guidedCaptureReviewWarning(submitted)).toBe(
      'Review this submitted photo before using it for EVA.',
    );
    expect(guidedCaptureReviewWarning({ ...submitted, excluded: false })).toBeUndefined();
    expect(guidedCaptureReviewWarning(evidence)).toBeUndefined();
    expect(GUIDED_CAPTURE_REVIEW_WARNING).not.toContain('public_guided_capture');
    expect(
      guidedCaptureReviewWarning({ ...submitted, excludedByStaff: true }),
    ).toBe('This photo was excluded. Review it again before including it for EVA.');
    expect(GUIDED_CAPTURE_EXCLUDED_WARNING).not.toContain('public_guided_capture');
  });

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

  it('serialises review and reflection actions through one synchronous per-image lock', () => {
    const active = new Set<string>();
    expect(tryAcquireEvidenceMutation(active, 'ev-1')).toBe(true);
    expect(tryAcquireEvidenceMutation(active, 'ev-1')).toBe(false);
    expect(tryAcquireEvidenceMutation(active, 'ev-2')).toBe(true);
    releaseEvidenceMutation(active, 'ev-1');
    expect(tryAcquireEvidenceMutation(active, 'ev-1')).toBe(true);
  });

  it('adopts the complete authoritative Evidence row returned by the server', () => {
    const current = {
      ...evidence,
      reflectionDismissed: true,
      personReflection: true,
      boxFileUrl: 'https://archive.test/new',
    };
    const serverResponse = {
      ...evidence,
      acceptedForEva: false,
      excluded: true,
      reflectionDismissed: false,
      personReflection: undefined,
      boxFileUrl: 'https://archive.test/old',
    } as Evidence;

    expect(mergeEvidenceReviewDecision(current, serverResponse)).toEqual(serverResponse);
    expect(mergeEvidenceReviewDecision(current, serverResponse)).toMatchObject({
      acceptedForEva: false,
      excluded: true,
      reflectionDismissed: false,
      personReflection: undefined,
      boxFileUrl: 'https://archive.test/old',
    });
  });
});
