/**
 * services/data-api/src/features/providers/intake-validate.test.ts — the provider submission validator.
 *
 * Pins (1) a valid submission normalises correctly (VRM upper/stripped, free text
 * clipped, dates/enums accepted, defaults filled), and (2) every DB-CHECK-mirroring
 * rule rejects with the right machine-readable error code — so a bad submission is a
 * 400, never a 500 on a constraint violation downstream.
 */
import { describe, it, expect } from 'vitest';
import { validateProviderApiSubmission } from './intake-validate.js';

const B64 = Buffer.from('hello').toString('base64');

/** A minimal valid submission (instruction only). Override fields per test. */
function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerReference: 'ABC-123',
    vrm: 'ab12 cde',
    claimantName: 'Jane Doe',
    dateOfLoss: '01/02/2026',
    dateOfInstruction: '03/02/2026',
    accidentCircumstances: 'Rear-ended at a junction.',
    instructions: [{ filename: 'instr.pdf', contentType: 'application/pdf', base64Data: B64 }],
    images: [],
    ...over,
  };
}

describe('validateProviderApiSubmission — happy path', () => {
  it('accepts and normalises a valid instruction-only submission', () => {
    const r = validateProviderApiSubmission(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.vrm).toBe('AB12CDE'); // upper-cased, spaces stripped
    expect(r.value.providerReference).toBe('ABC-123');
    expect(r.value.vatStatus).toBe(''); // default
    expect(r.value.mileageUnit).toBe('');
    expect(r.value.instructions).toHaveLength(1);
    expect(r.value.images).toHaveLength(0);
  });

  it('accepts an image-only submission and defaults imageRole to unknown', () => {
    const r = validateProviderApiSubmission(
      base({
        instructions: [],
        images: [{ filename: 'front.jpg', contentType: 'image/jpeg', base64Data: B64 }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.images[0].imageRole).toBe('unknown');
    expect(r.value.images[0].excluded).toBe(false);
    expect(r.value.images[0].exclusionReason).toBeNull();
  });

  it('carries a valid imageRole, sequenceIndex and exclusion', () => {
    const r = validateProviderApiSubmission(
      base({
        images: [
          { filename: 'o.jpg', contentType: 'image/jpeg', base64Data: B64, imageRole: 'overview', sequenceIndex: 2 },
          { filename: 'x.jpg', contentType: 'image/jpeg', base64Data: B64, excluded: true, exclusionReason: 'reflection' },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.images[0].imageRole).toBe('overview');
    expect(r.value.images[0].sequenceIndex).toBe(2);
    expect(r.value.images[1].excluded).toBe(true);
    expect(r.value.images[1].exclusionReason).toBe('reflection');
  });

  it('clips over-long free text to the column widths', () => {
    const r = validateProviderApiSubmission(base({ claimantName: 'x'.repeat(300) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.claimantName.length).toBe(200);
  });

  it('normalises a legacy standalone mileage-unit suffix without accepting prose', () => {
    const r = validateProviderApiSubmission(base({ mileage: '50,000 miles', mileageUnit: 'Miles' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mileage).toBe('50000');
  });

  it('infers a standalone mileage suffix and rejects a conflicting explicit unit', () => {
    const inferred = validateProviderApiSubmission(base({ mileage: '50,000 km', mileageUnit: '' }));
    expect(inferred.ok).toBe(true);
    if (inferred.ok) expect(inferred.value.mileageUnit).toBe('Km');

    const conflict = validateProviderApiSubmission(base({ mileage: '50,000 km', mileageUnit: 'Miles' }));
    expect(conflict).toMatchObject({ ok: false, code: 'invalid_mileage_unit' });
  });
});

describe('validateProviderApiSubmission — rejections (mirror DB CHECKs)', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['non-object body', { __replace: true } as never, 'invalid_body'],
    ['missing providerReference', { providerReference: '  ' }, 'missing_provider_reference'],
    ['missing vrm', { vrm: '' }, 'missing_vrm'],
    ['missing claimantName', { claimantName: '' }, 'missing_claimant_name'],
    ['bad dateOfLoss', { dateOfLoss: '2026-02-01' }, 'invalid_date_of_loss'],
    ['bad dateOfInstruction', { dateOfInstruction: '3/2/26' }, 'invalid_date_of_instruction'],
    ['missing accidentCircumstances', { accidentCircumstances: '' }, 'missing_accident_circumstances'],
    ['bad vatStatus', { vatStatus: 'maybe' }, 'invalid_vat_status'],
    ['bad mileageUnit', { mileageUnit: 'furlongs' }, 'invalid_mileage_unit'],
    ['bad mileage', { mileage: 'about 50,000 miles' }, 'invalid_mileage'],
    ['bad inspectionAddress type', { inspectionAddress: 123 }, 'invalid_inspection_address'],
    ['instructions not array', { instructions: 'nope' }, 'invalid_instructions'],
    ['images not array', { images: 'nope' }, 'invalid_images'],
    ['empty submission', { instructions: [], images: [] }, 'empty_submission'],
    [
      'instruction missing base64',
      { instructions: [{ filename: 'a.pdf', contentType: 'application/pdf', base64Data: '' }] },
      'invalid_instructions',
    ],
    [
      'bad image role',
      { images: [{ filename: 'a.jpg', contentType: 'image/jpeg', base64Data: B64, imageRole: 'side' }] },
      'invalid_image_role',
    ],
    [
      'excluded image without reason',
      { images: [{ filename: 'a.jpg', contentType: 'image/jpeg', base64Data: B64, excluded: true }] },
      'missing_exclusion_reason',
    ],
  ];

  for (const [name, over, code] of cases) {
    it(`rejects: ${name} -> ${code}`, () => {
      const input = '__replace' in over ? 'not an object' : base(over);
      const r = validateProviderApiSubmission(input);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe(code);
    });
  }

  it('rejects a null body', () => {
    const r = validateProviderApiSubmission(null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('invalid_body');
  });
});
