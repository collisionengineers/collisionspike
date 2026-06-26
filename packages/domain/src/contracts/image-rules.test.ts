import { describe, it, expect } from 'vitest';
import {
  evaluateEvaImageRules,
  validateEvaImageRules,
  acceptedEvaImages,
  MIN_ACCEPTED_IMAGES,
  type ImageRuleEvidence,
} from './image-rules';

function img(over: Partial<ImageRuleEvidence> = {}): ImageRuleEvidence {
  return {
    kind: 'image',
    imageRole: 'additional',
    registrationVisible: false,
    acceptedForEva: true,
    excluded: false,
    ...over,
  };
}

const overview = img({ imageRole: 'overview', registrationVisible: true });
const closeup = img({ imageRole: 'damage_closeup' });

describe('acceptedEvaImages', () => {
  it('counts only accepted, non-excluded image-kind evidence', () => {
    const evidence: ImageRuleEvidence[] = [
      overview,
      closeup,
      img({ acceptedForEva: false }),
      img({ excluded: true }),
      img({ kind: 'instruction' }),
    ];
    expect(acceptedEvaImages(evidence)).toHaveLength(2);
  });
});

describe('evaluateEvaImageRules — passing', () => {
  it('passes with >=2 accepted incl. overview(reg visible) + damage_closeup', () => {
    const result = evaluateEvaImageRules([overview, closeup]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.acceptedCount).toBe(2);
    expect(result.hasOverview).toBe(true);
    expect(result.hasDamageCloseup).toBe(true);
  });

  it('MIN_ACCEPTED_IMAGES is 2', () => {
    expect(MIN_ACCEPTED_IMAGES).toBe(2);
  });
});

describe('evaluateEvaImageRules — failing branches', () => {
  it('fails min_count when only one accepted image', () => {
    const codes = validateEvaImageRules([overview]).map((f) => f.code);
    expect(codes).toContain('min_count');
  });

  it('fails missing_overview when overview lacks visible registration', () => {
    const badOverview = img({ imageRole: 'overview', registrationVisible: false });
    const result = evaluateEvaImageRules([badOverview, closeup]);
    expect(result.hasOverview).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain('missing_overview');
  });

  it('fails missing_damage_closeup when no close-up accepted', () => {
    const result = evaluateEvaImageRules([overview, img()]);
    expect(result.hasDamageCloseup).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain('missing_damage_closeup');
  });

  it('excluded overview does not satisfy the overview rule', () => {
    const excludedOverview = img({
      imageRole: 'overview',
      registrationVisible: true,
      excluded: true,
    });
    const result = evaluateEvaImageRules([excludedOverview, closeup, img()]);
    expect(result.hasOverview).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain('missing_overview');
  });

  it('reports all three failures for an empty evidence set, in stable order', () => {
    const codes = validateEvaImageRules([]).map((f) => f.code);
    expect(codes).toEqual(['min_count', 'missing_overview', 'missing_damage_closeup']);
  });
});
