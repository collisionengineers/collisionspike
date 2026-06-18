import { describe, it, expect } from 'vitest';
import {
  statusForReviewCase,
  isTerminalStatus,
  TERMINAL_STATUSES,
  CASE_STATUSES,
  missingRequiredFieldKeys,
  conflictFieldKeys,
  REQUIRED_FIELD_KEYS,
  type CaseStatus,
  type ReviewableField,
  type StatusEvaluationInput,
} from './case-status';
import { EVA_FIELD_ORDER, type EvaFieldKey } from './eva-export';
import type { ImageRuleEvidence } from './image-rules';

/* ----------  Fixtures  ---------- */

function field(value: string, reviewState: ReviewableField['reviewState'] = 'reviewed'): ReviewableField {
  return { value, reviewState };
}

/** All 12 fields populated + reviewed (so required + review checks pass). */
function fullFields(
  over: Partial<Record<EvaFieldKey, ReviewableField>> = {},
): Record<EvaFieldKey, ReviewableField> {
  const fields = {} as Record<EvaFieldKey, ReviewableField>;
  for (const desc of EVA_FIELD_ORDER) {
    fields[desc.key] = field(`val-${desc.key}`, 'reviewed');
  }
  return { ...fields, ...over };
}

function imgEv(over: Partial<ImageRuleEvidence> = {}): ImageRuleEvidence {
  return {
    kind: 'image',
    imageRole: 'additional',
    registrationVisible: false,
    acceptedForEva: true,
    excluded: false,
    ...over,
  };
}

/** A valid image set (passes the image rules). */
const goodEvidence: ImageRuleEvidence[] = [
  imgEv({ imageRole: 'overview', registrationVisible: true }),
  imgEv({ imageRole: 'damage_closeup' }),
];

function caseInput(over: Partial<StatusEvaluationInput> = {}): StatusEvaluationInput {
  return {
    status: 'ingested',
    evaFields: fullFields(),
    evidence: goodEvidence,
    ...over,
  };
}

/* ----------  Union / terminal authority  ---------- */

describe('CaseStatus union authority', () => {
  it('has exactly the 11 prototype values', () => {
    expect([...CASE_STATUSES].sort()).toEqual(
      [
        'box_synced',
        'duplicate_risk',
        'eva_submitted',
        'error',
        'ingested',
        'linked_to_instruction',
        'missing_images',
        'missing_required_fields',
        'needs_review',
        'new_email',
        'ready_for_eva',
      ].sort(),
    );
    expect(CASE_STATUSES).toHaveLength(11);
  });

  it('marks the three terminal statuses', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ['box_synced', 'error', 'eva_submitted'].sort(),
    );
    for (const s of TERMINAL_STATUSES) expect(isTerminalStatus(s)).toBe(true);
    expect(isTerminalStatus('needs_review')).toBe(false);
    // linked_to_instruction is a BRANCH state (set by the dedup flow), not a
    // terminal — the guard may recompute it. Plan §5.4.
    expect(isTerminalStatus('linked_to_instruction')).toBe(false);
  });
});

/* ----------  Guard order  ---------- */

describe('statusForReviewCase — terminal lock', () => {
  it.each<CaseStatus>(['eva_submitted', 'box_synced', 'error'])(
    'returns %s unchanged even when fields/images would otherwise fail',
    (status) => {
      const input = caseInput({
        status,
        evaFields: fullFields({ workProvider: field('', 'needs_review') }),
        evidence: [],
      });
      expect(statusForReviewCase(input)).toBe(status);
    },
  );
});

describe('statusForReviewCase — missing_required_fields branch', () => {
  it.each<EvaFieldKey>(REQUIRED_FIELD_KEYS as EvaFieldKey[])(
    'returns missing_required_fields when required %s is empty',
    (key) => {
      const input = caseInput({ evaFields: fullFields({ [key]: field('', 'needs_review') }) });
      expect(statusForReviewCase(input)).toBe('missing_required_fields');
    },
  );

  it('treats whitespace-only as empty', () => {
    const input = caseInput({ evaFields: fullFields({ vehicleModel: field('   ') }) });
    expect(statusForReviewCase(input)).toBe('missing_required_fields');
  });

  it('does NOT trip on an empty optional field', () => {
    const input = caseInput({ evaFields: fullFields({ mileage: field('') }) });
    expect(statusForReviewCase(input)).toBe('ready_for_eva');
  });
});

describe('statusForReviewCase — missing_images branch', () => {
  it('returns missing_images when required fields are present but images fail', () => {
    const input = caseInput({ evidence: [] });
    expect(statusForReviewCase(input)).toBe('missing_images');
  });

  it('missing_required_fields takes precedence over missing_images', () => {
    const input = caseInput({
      evaFields: fullFields({ claimantName: field('') }),
      evidence: [],
    });
    expect(statusForReviewCase(input)).toBe('missing_required_fields');
  });
});

describe('statusForReviewCase — needs_review branch', () => {
  it('returns needs_review when a field is still in needs_review', () => {
    const input = caseInput({
      evaFields: fullFields({ mileage: field('1000', 'needs_review') }),
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('returns needs_review when a field is in conflict', () => {
    const input = caseInput({
      evaFields: fullFields({ vehicleModel: field('Audi A3', 'conflict') }),
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('image rules take precedence over needs_review', () => {
    const input = caseInput({
      evaFields: fullFields({ mileage: field('1000', 'needs_review') }),
      evidence: [],
    });
    expect(statusForReviewCase(input)).toBe('missing_images');
  });
});

describe('statusForReviewCase — ready_for_eva', () => {
  it('returns ready_for_eva when everything passes and nothing is open', () => {
    expect(statusForReviewCase(caseInput())).toBe('ready_for_eva');
  });

  it('not_required review state does not block readiness', () => {
    const input = caseInput({
      evaFields: fullFields({ claimantTelephone: field('', 'not_required') }),
    });
    expect(statusForReviewCase(input)).toBe('ready_for_eva');
  });
});

/* ----------  Helpers  ---------- */

describe('helper functions', () => {
  it('missingRequiredFieldKeys lists empty required fields', () => {
    const fields = fullFields({ dateOfLoss: field(''), workProvider: field(' ') });
    expect(missingRequiredFieldKeys(fields).sort()).toEqual(
      ['dateOfLoss', 'workProvider'].sort(),
    );
  });

  it('conflictFieldKeys lists fields in conflict', () => {
    const fields = fullFields({ mileage: field('1', 'conflict') });
    expect(conflictFieldKeys(fields)).toEqual(['mileage']);
  });
});
