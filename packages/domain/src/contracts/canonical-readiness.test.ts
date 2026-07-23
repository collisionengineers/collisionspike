import { describe, expect, it } from 'vitest';
import { caseToQueue } from '../model/queues';
import {
  evaluateCaseReadiness,
  statusForReviewCase,
  type ReviewableField,
  type StatusEvaluationInput,
} from './case-status';
import { EVA_FIELD_ORDER, type EvaFieldKey } from './eva-export';
import type { ImageRuleEvidence } from './image-rules';

function field(value: string, reviewState: ReviewableField['reviewState'] = 'reviewed') {
  return { value, reviewState };
}

function completeFields(
  over: Partial<Record<EvaFieldKey, ReviewableField>> = {},
): Record<EvaFieldKey, ReviewableField> {
  const fields = {} as Record<EvaFieldKey, ReviewableField>;
  for (const desc of EVA_FIELD_ORDER) {
    fields[desc.key] = field(desc.key === 'inspectionAddress' ? '1 Test Road' : `value-${desc.key}`);
  }
  return { ...fields, ...over };
}

function image(over: Partial<ImageRuleEvidence> = {}): ImageRuleEvidence {
  return {
    kind: 'image',
    imageRole: 'additional',
    registrationVisible: false,
    acceptedForEva: true,
    excluded: false,
    ...over,
  };
}

const validImages = (): ImageRuleEvidence[] => [
  image({ imageRole: 'overview', registrationVisible: true }),
  image({ imageRole: 'damage_closeup' }),
];

function input(over: Partial<StatusEvaluationInput> = {}): StatusEvaluationInput {
  return {
    status: 'needs_review',
    evaFields: completeFields(),
    evidence: validImages(),
    inspectionDecision: 'confirmed_physical',
    hasIdentity: true,
    instructionCount: 1,
    ...over,
  };
}

function verdict(value: StatusEvaluationInput, onHold = false) {
  const readiness = evaluateCaseReadiness(value);
  const status = statusForReviewCase(value);
  return {
    readiness,
    status,
    queue: caseToQueue({ status, onHold }),
    failed: readiness.checks.filter((check) => !check.ok).map((check) => check.id),
  };
}

describe('TKT-130 canonical readiness matrix', () => {
  it('QDOS26079-shaped gaps stay Not ready with specific field and image reasons', () => {
    const result = verdict(input({
      evaFields: completeFields({
        vehicleModel: field('', 'needs_review'),
        claimantName: field('', 'needs_review'),
        dateOfLoss: field('', 'needs_review'),
        accidentCircumstances: field('', 'needs_review'),
      }),
      evidence: [image({ imageRole: 'unknown', acceptedForEva: false })],
    }));

    expect(result.readiness.ready).toBe(false);
    expect(result.queue).toBe('not-ready');
    expect(result.failed).toEqual(expect.arrayContaining([
      'field-vehicleModel',
      'field-claimantName',
      'field-dateOfLoss',
      'field-accidentCircumstances',
      'images',
    ]));
    // The blockers are the empty values and the image set — never a review marker.
    expect(result.failed).not.toContain('no-conflicts');
  });

  it.each([
    ['blank claimant', 'claimantName'],
    ['blank vehicle model', 'vehicleModel'],
  ] as const)('%s can never enter Review', (_name, key) => {
    const result = verdict(input({
      evaFields: completeFields({ [key]: field('') }),
    }));
    expect(result.status).toBe('missing_required_fields');
    expect(result.queue).toBe('not-ready');
    expect(result.failed).toContain(`field-${key}`);
  });

  /* TKT-130, operator ruling 2026-07-21. These previously asserted the OPPOSITE:
     any field marked needs_review or conflict held an otherwise-complete case in
     Not ready behind a "No unresolved field reviews" blocker. That marker was
     never a real signal — needs_review is the field_level_provenance DB default,
     and the read mapping also falls back to it when no provenance row matches the
     current value, so well-populated parsed fields arrived "unresolved" with no
     way to clear them except retyping the value. */
  it.each(['needs_review', 'conflict'] as const)(
    'a populated %s field reaches Review when every EVA requirement is met',
    (reviewState) => {
      const result = verdict(input({
        evaFields: completeFields({ vehicleModel: field('Audi A3', reviewState) }),
      }));
      expect(result.status).toBe('ready_for_eva');
      expect(result.queue).toBe('review');
      expect(result.readiness.ready).toBe(true);
      expect(result.failed).toEqual([]);
    },
  );

  it.each(['needs_review', 'conflict'] as const)(
    'a BLANK %s field is still Not ready — the value, not the marker, is the blocker',
    (reviewState) => {
      const result = verdict(input({
        evaFields: completeFields({ vehicleModel: field('', reviewState) }),
      }));
      expect(result.status).toBe('missing_required_fields');
      expect(result.queue).toBe('not-ready');
      expect(result.failed).toContain('field-vehicleModel');
    },
  );

  it('no readiness check is a review-state check', () => {
    const result = verdict(input());
    expect(result.readiness.checks.map((check) => check.id)).not.toContain('no-conflicts');
    // The forbidden label must not exist on any surface (TKT-130 acceptance).
    expect(result.readiness.checks.map((check) => check.label))
      .not.toContain('No unresolved field reviews');
    // The 'conflicts' group is gone from ReadinessCheckGroup itself, so a
    // runtime assertion for it no longer compiles — the type is the guarantee.
  });

  /* P1-E, operator ruling 2026-07-21 (superseding this test's earlier assertion):
     the image contract is now advisory. All images excluded still reports on the
     checklist (imagesReady: false, a detail string) but no longer withholds
     ready_for_eva/Review. */
  it('all images excluded is advisory — reaches Review with the gap still on the checklist', () => {
    const result = verdict(input({
      evidence: validImages().map((e) => ({ ...e, excluded: true })),
    }));
    expect(result.status).toBe('ready_for_eva');
    expect(result.queue).toBe('review');
    expect(result.readiness.imagesReady).toBe(false);
    expect(result.readiness.checks.find((check) => check.id === 'images')?.detail)
      .toContain('have 0');
  });

  /* TKT-130, operator ruling 2026-07-21. This previously asserted that an
     unconfirmed classifier exclusion blocked an otherwise valid set. The excluded
     photo never counted toward the three image rules in the first place, so
     holding the case for it was not a missing requirement. The classifier's
     opinion survives as advisory copy on the Evidence tab. */
  it('an unconfirmed classifier exclusion does not block an otherwise valid set', () => {
    const result = verdict(input({
      evidence: [...validImages(), image({ excluded: true })],
    }));
    expect(result.status).toBe('ready_for_eva');
    expect(result.queue).toBe('review');
    expect(result.readiness.imagesReady).toBe(true);
  });

  it('a non-empty inspection address without a saved decision is Not ready', () => {
    const result = verdict(input({ inspectionDecision: 'unknown' }));
    expect(result.status).toBe('missing_required_fields');
    expect(result.queue).toBe('not-ready');
    expect(result.failed).toContain('address-decision');
  });

  it('an explicit Image Based Assessment choice satisfies inspection readiness', () => {
    const result = verdict(input({
      inspectionDecision: 'image_based',
      evaFields: completeFields({
        inspectionAddress: field('Image Based Assessment'),
      }),
    }));
    expect(result.readiness.ready).toBe(true);
    expect(result.status).toBe('ready_for_eva');
    expect(result.queue).toBe('review');
  });

  it.each([
    [
      'registration-visible overview',
      [image({ imageRole: 'overview', registrationVisible: false }), image({ imageRole: 'damage_closeup' })],
      'no overview with a visible registration',
    ],
    [
      'damage close-up',
      [image({ imageRole: 'overview', registrationVisible: true }), image({ imageRole: 'additional' })],
      'no main-damage close-up',
    ],
  ] as const)('missing %s is advisory — reaches Review with the gap still on the checklist (P1-E)', (_name, evidence, detail) => {
    const result = verdict(input({ evidence }));
    expect(result.status).toBe('ready_for_eva');
    expect(result.queue).toBe('review');
    expect(result.readiness.imagesReady).toBe(false);
    expect(result.readiness.checks.find((check) => check.id === 'images')?.detail)
      .toContain(detail);
  });

  it('a complete, reviewed case is the only shape that enters Review', () => {
    const result = verdict(input());
    expect(result.readiness.ready).toBe(true);
    expect(result.status).toBe('ready_for_eva');
    expect(result.queue).toBe('review');
    expect(result.failed).toEqual([]);
  });

  it('a stale ready_for_eva status cannot override the current contract', () => {
    const result = verdict(input({
      status: 'ready_for_eva',
      evaFields: completeFields({ claimantName: field('') }),
    }));
    expect(result.readiness.ready).toBe(false);
    expect(result.status).toBe('missing_required_fields');
    expect(result.queue).toBe('not-ready');
  });

  it('an explicit hold remains Held even when canonical readiness passes', () => {
    const result = verdict(input(), true);
    expect(result.readiness.ready).toBe(true);
    expect(result.status).toBe('ready_for_eva');
    expect(result.queue).toBe('held');
  });
});
