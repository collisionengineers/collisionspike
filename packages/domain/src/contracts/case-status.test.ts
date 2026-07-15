import { describe, it, expect } from 'vitest';
import {
  statusForReviewCase,
  isTerminalStatus,
  TERMINAL_STATUSES,
  CASE_STATUSES,
  missingRequiredFieldKeys,
  conflictFieldKeys,
  evaluateCaseReadiness,
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
    inspectionDecision: 'confirmed_physical',
    ...over,
  };
}

/* ----------  Union / terminal authority  ---------- */

describe('CaseStatus union authority', () => {
  it('has exactly the 13 prototype values', () => {
    expect([...CASE_STATUSES].sort()).toEqual(
      [
        'box_synced',
        'done',
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
    expect(CASE_STATUSES).toHaveLength(13);
  });

  it('marks the five terminal statuses (incl. soft-remove + delivery)', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ['box_synced', 'done', 'error', 'eva_submitted', 'removed'].sort(),
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

  it('locks a done (delivered) case — the guard never re-promotes it (TKT-094)', () => {
    const input: StatusEvaluationInput = caseInput({ status: 'done', evidence: [] });
    expect(statusForReviewCase(input)).toBe('done');
  });
});

/* ----------  Guard order  ---------- */

describe('registration image adoption blocker',()=>{
  it('keeps an otherwise complete case Not Ready until held images finish filing',()=>{
    expect(statusForReviewCase(caseInput({archiveHoldingPending:true}))).toBe('missing_images');
  });
  it('does not override a terminal case',()=>{
    expect(statusForReviewCase(caseInput({status:'done',archiveHoldingPending:true}))).toBe('done');
  });
});

describe('statusForReviewCase — terminal lock', () => {
  it.each<CaseStatus>(['eva_submitted', 'box_synced', 'error', 'done'])(
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

describe('registration vehicle-detail readiness', () => {
  it('keeps an otherwise complete registration case Not Ready when mileage is unresolved', () => {
    const input = caseInput({
      vehicleData: {
        hasRegistration: true,
        modelResolved: true,
        mileageResolved: false,
        warning: 'No usable mileage history was found.',
      },
    });
    const readiness = evaluateCaseReadiness(input);
    expect(readiness.vehicleDetailsReady).toBe(false);
    expect(readiness.checks.find((check) => check.id === 'vehicle-details')?.detail)
      .toBe('No usable mileage history was found.');
    expect(statusForReviewCase(input)).toBe('missing_required_fields');
  });

  it('does not invent a vehicle lookup requirement for a case without a registration', () => {
    const input = caseInput({
      vehicleData: { hasRegistration: false, modelResolved: false, mileageResolved: false },
    });
    expect(statusForReviewCase(input)).toBe('ready_for_eva');
  });
});

describe('statusForReviewCase — merge-retired lock (TKT-141)', () => {
  const SURVIVOR = '68442a2a-998c-4a16-89ba-8fe226303734';

  it('preserves linked_to_instruction for a merge-retired case even when fields+images would pass', () => {
    // Pre-lock this recomputed to ready_for_eva — the exact un-retire regression
    // (the merged case keeps its fields; only its evidence moved to the survivor).
    const input = caseInput({ status: 'linked_to_instruction', mergedInto: SURVIVOR });
    expect(statusForReviewCase(input)).toBe('linked_to_instruction');
  });

  it('preserves linked_to_instruction for a merge-retired case on the evidence-less shape too', () => {
    // Post-merge reality: evidence reparented onto the survivor, fields incomplete
    // -> pre-lock this recomputed to needs_review (the live 2026-07-10 regression).
    const input = caseInput({
      status: 'linked_to_instruction',
      mergedInto: SURVIVOR,
      evaFields: fullFields({ vehicleModel: field('') }),
      evidence: [],
    });
    expect(statusForReviewCase(input)).toBe('linked_to_instruction');
  });

  it('keeps an incomplete manual-intake source batch Not Ready without breaking terminal/merge locks', () => {
    const complete = caseInput({
      status: 'ingested',
      evaFields: fullFields(),
      evidence: goodEvidence,
      sourceEvidencePending: true,
    });
    expect(statusForReviewCase(complete)).toBe('needs_review');
    const readiness = evaluateCaseReadiness(complete);
    expect(readiness.ready).toBe(false);
    expect(readiness.sourceEvidenceReady).toBe(false);
    expect(readiness.checks).toContainEqual(expect.objectContaining({
      id: 'source-evidence',
      ok: false,
      group: 'source',
    }));
    expect(statusForReviewCase({ ...complete, status: 'done' })).toBe('done');
    expect(statusForReviewCase({ ...complete, mergedInto: 'survivor-case' })).toBe(
      'linked_to_instruction',
    );
  });

  it('keeps a terminal manual-source archive failure Not Ready with recovery guidance', () => {
    const complete = caseInput({
      status: 'ready_for_eva',
      evaFields: fullFields(),
      evidence: goodEvidence,
      sourceEvidenceArchiveFailed: true,
    });
    expect(statusForReviewCase(complete)).toBe('needs_review');
    expect(evaluateCaseReadiness(complete).checks).toContainEqual(expect.objectContaining({
      id: 'source-evidence',
      ok: false,
      detail: expect.stringContaining('Retry it from Evidence'),
    }));
  });

  it('converges a wrongly un-retired marker-bearing case back to linked_to_instruction (self-heal)', () => {
    // The regression population: marker present but status already flipped to
    // needs_review. The next recompute re-retires it rather than perpetuating it.
    const input = caseInput({ status: 'needs_review', mergedInto: SURVIVOR });
    expect(statusForReviewCase(input)).toBe('linked_to_instruction');
  });

  it('a blank/whitespace marker is NO marker (mirrors mergedIntoFrom)', () => {
    expect(statusForReviewCase(caseInput({ mergedInto: '   ' }))).toBe('ready_for_eva');
    expect(statusForReviewCase(caseInput({ mergedInto: '' }))).toBe('ready_for_eva');
  });

  it('a NON-merged linked_to_instruction case still recomputes once its fields/images resolve (no over-lock)', () => {
    // The historical branch semantics: a partial joined to its other half is
    // released by the guard when complete — unchanged by the retired-lock.
    const input = caseInput({ status: 'linked_to_instruction' });
    expect(statusForReviewCase(input)).toBe('ready_for_eva');
  });

  it('a NON-merged linked_to_instruction case with incomplete fields recomputes to its pending branch', () => {
    const input = caseInput({
      status: 'linked_to_instruction',
      evaFields: fullFields({ vehicleModel: field('') }),
      evidence: [instrEv()],
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('the terminal lock still wins over the marker (removed/done never rewritten)', () => {
    for (const status of ['removed', 'done'] as CaseStatus[]) {
      const input = caseInput({ status, mergedInto: SURVIVOR, evidence: [] });
      expect(statusForReviewCase(input)).toBe(status);
    }
  });
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

  it('a populated case with an open conflict stays needs_review', () => {
    const input = caseInput({
      evaFields: fullFields({ vehicleModel: field('Audi A3', 'conflict') }),
    });
    expect(statusForReviewCase(input)).toBe('needs_review');
  });

  it('a concrete image failure remains the persisted reason when a field also needs review', () => {
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
