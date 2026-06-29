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

/** An instruction-kind evidence row (counts toward instructionCount, not images). */
function instrEv(): ImageRuleEvidence {
  return {
    kind: 'instruction',
    imageRole: 'unknown',
    registrationVisible: false,
    acceptedForEva: false,
    excluded: false,
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
  it('has exactly the 12 prototype values', () => {
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
        'removed',
      ].sort(),
    );
    expect(CASE_STATUSES).toHaveLength(12);
  });

  it('marks the four terminal statuses (incl. the soft-remove terminal)', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ['box_synced', 'error', 'eva_submitted', 'removed'].sort(),
    );
    for (const s of TERMINAL_STATUSES) expect(isTerminalStatus(s)).toBe(true);
    expect(isTerminalStatus('needs_review')).toBe(false);
    // linked_to_instruction is a BRANCH state (set by the dedup flow), not a
    // terminal — the guard may recompute it. Plan §5.4.
    expect(isTerminalStatus('linked_to_instruction')).toBe(false);
  });

  it('locks a removed case — the guard never re-promotes it', () => {
    const input: StatusEvaluationInput = caseInput({ status: 'removed', evidence: [] });
    expect(statusForReviewCase(input)).toBe('removed');
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

describe('statusForReviewCase — missing_required_fields branch (FIX-3: reserved for image-bearing cases)', () => {
  // FIX-3: missing_required_fields fires ONLY when the case holds accepted image
  // evidence (imagesValid) but a required field is empty — "Images only".
  it.each<EvaFieldKey>(REQUIRED_FIELD_KEYS as EvaFieldKey[])(
    'returns missing_required_fields when images pass but required %s is empty',
    (key) => {
      const input = caseInput({ evaFields: fullFields({ [key]: field('', 'needs_review') }) });
      expect(statusForReviewCase(input)).toBe('missing_required_fields');
    },
  );

  it('treats whitespace-only as empty (with valid images)', () => {
    const input = caseInput({ evaFields: fullFields({ vehicleModel: field('   ') }) });
    expect(statusForReviewCase(input)).toBe('missing_required_fields');
  });

  it('does NOT trip on an empty optional field', () => {
    const input = caseInput({ evaFields: fullFields({ mileage: field('') }) });
    expect(statusForReviewCase(input)).toBe('ready_for_eva');
  });

  it('does NOT mint missing_required_fields for an evidence-less, field-incomplete case (the stuck-case fix)', () => {
    // The 3 live stuck cases: ZERO evidence, missing required fields. Under the
    // old fields-first tree these wrongly minted missing_required_fields; FIX-3
    // routes them to needs_review (nothing usable arrived yet).
    const input = caseInput({
      evaFields: fullFields({ inspectionAddress: field('') }),
      evidence: [],
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });
});

describe('statusForReviewCase — missing_images branch', () => {
  it('returns missing_images when required fields are present but images fail', () => {
    const input = caseInput({ evidence: [] });
    expect(statusForReviewCase(input)).toBe('missing_images');
  });

  it('missing_images fires even with instructions present, when fields are complete', () => {
    const input = caseInput({ evidence: [instrEv()] });
    expect(statusForReviewCase(input)).toBe('missing_images');
  });
});

describe('statusForReviewCase — needs_review branch (FIX-3 evidence-aware)', () => {
  it('returns needs_review when nothing usable has arrived (no images, no instructions)', () => {
    const input = caseInput({
      evaFields: fullFields({ claimantName: field('') }),
      evidence: [],
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('returns needs_review for an instructions-only, field-incomplete case', () => {
    // Instructions arrived (instructionCount>0) but no usable images and a
    // required field is missing -> a human reviews; never "Images only".
    const input = caseInput({
      evaFields: fullFields({ vehicleModel: field('') }),
      evidence: [instrEv()],
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('honours an explicit instructionCount even when no instruction rows are in evidence', () => {
    const input = caseInput({
      evaFields: fullFields({ vehicleModel: field('') }),
      evidence: [],
      instructionCount: 2,
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('a populated case with an open conflict is ready_for_eva (FIX-3 does not gate on review state)', () => {
    // Divergence from the old tree: fieldsValid is field-presence only.
    const input = caseInput({
      evaFields: fullFields({ vehicleModel: field('Audi A3', 'conflict') }),
    });
    expect(statusForReviewCase(input)).toBe('ready_for_eva');
  });

  it('image rules take precedence over an open review state', () => {
    const input = caseInput({
      evaFields: fullFields({ mileage: field('1000', 'needs_review') }),
      evidence: [],
    });
    expect(statusForReviewCase(input)).toBe('missing_images');
  });
});

describe('statusForReviewCase — error branch (something arrived, but unidentifiable + field-incomplete)', () => {
  // The error branch is reached only when fields are incomplete, images fail,
  // AND something DID arrive (instructions and/or unusable images) — so the
  // "genuinely empty -> needs_review" branch does not catch it first — and the
  // case has no identity at all.
  it('returns error for an instructions-bearing, field-incomplete case with no identity', () => {
    const input = caseInput({
      evaFields: fullFields({
        workProvider: field(''),
        claimantName: field(''),
        inspectionAddress: field(''),
      }),
      evidence: [instrEv()], // instructionCount=1 -> skips the empty branch
      hasIdentity: false,
    });
    expect(statusForReviewCase(input)).toBe('error');
  });

  it('a genuinely empty case (no evidence, no instructions) is needs_review even with no identity', () => {
    // No accepted images AND no instructions short-circuits to needs_review
    // BEFORE the identity check — never a premature error.
    const input = caseInput({
      evaFields: fullFields({
        workProvider: field(''),
        claimantName: field(''),
        inspectionAddress: field(''),
      }),
      evidence: [],
      hasIdentity: false,
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('an explicit hasIdentity=true keeps an instructions-bearing incomplete case in needs_review, not error', () => {
    const input = caseInput({
      evaFields: fullFields({
        workProvider: field(''),
        claimantName: field(''),
        inspectionAddress: field(''),
      }),
      evidence: [instrEv()],
      hasIdentity: true,
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('derives identity from workProvider when hasIdentity is not passed', () => {
    // workProvider present (identity) + instructions arrived + fields incomplete
    // -> needs_review (identifiable), NOT error.
    const input = caseInput({
      evaFields: fullFields({
        workProvider: field('SBL'),
        claimantName: field(''),
        inspectionAddress: field(''),
      }),
      evidence: [instrEv()],
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });
});

describe('statusForReviewCase — ready_for_eva', () => {
  it('returns ready_for_eva when fields are complete and images pass', () => {
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
