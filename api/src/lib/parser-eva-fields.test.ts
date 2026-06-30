import { describe, it, expect } from 'vitest';
import { selectParserEvaCandidates, type ParserEvaFields } from './parser-eva-fields.js';

/**
 * selectParserEvaCandidates is the constraint guard between the parser's 12-field extraction
 * and the case_ eva_* columns. These tests pin the two things that matter: (1) the full
 * parser-owned set maps to the right columns/provenance keys, and (2) a value that would
 * violate a column CHECK constraint (bad date, non-Yes/No VAT) is SKIPPED, never passed
 * through to break the intake UPDATE.
 */
describe('selectParserEvaCandidates', () => {
  it('returns [] for absent / empty input', () => {
    expect(selectParserEvaCandidates(undefined)).toEqual([]);
    expect(selectParserEvaCandidates(null)).toEqual([]);
    expect(selectParserEvaCandidates({})).toEqual([]);
    expect(
      selectParserEvaCandidates({ claimant_name: '', vehicle_model: '   ' }),
    ).toEqual([]);
  });

  it('maps every parser-owned field to its column + camelCase provenance key, in contract order', () => {
    const input: ParserEvaFields = {
      vehicle_model: 'Toyota Prius',
      claimant_name: 'Mazhar Hussain Butt',
      claimant_telephone: '07700 900123',
      claimant_email: 'claimant@example.com',
      date_of_loss: '01/02/2026',
      date_of_instruction: '05/02/2026',
      accident_circumstances: 'Client was stationary when the third party collided with the rear.',
      vat_status: 'No',
    };
    const out = selectParserEvaCandidates(input);
    expect(out.map((c) => [c.column, c.provenanceField, c.value])).toEqual([
      ['eva_vehicle_model', 'vehicleModel', 'Toyota Prius'],
      ['eva_claimant_name', 'claimantName', 'Mazhar Hussain Butt'],
      ['eva_claimant_telephone', 'claimantTelephone', '07700 900123'],
      ['eva_claimant_email', 'claimantEmail', 'claimant@example.com'],
      ['eva_date_of_loss', 'dateOfLoss', '01/02/2026'],
      ['eva_date_of_instruction', 'dateOfInstruction', '05/02/2026'],
      [
        'eva_accident_circumstances',
        'accidentCircumstances',
        'Client was stationary when the third party collided with the rear.',
      ],
      ['eva_vat_status', 'vatStatus', 'No'],
    ]);
  });

  it('trims surrounding whitespace before persisting', () => {
    const out = selectParserEvaCandidates({ claimant_name: '  Uzair Khan  ' });
    expect(out).toEqual([
      { column: 'eva_claimant_name', provenanceField: 'claimantName', value: 'Uzair Khan' },
    ]);
  });

  it('SKIPS a date that is not DD/MM/YYYY (would violate ck_case_eva_date_of_*)', () => {
    expect(selectParserEvaCandidates({ date_of_loss: '2026-02-01' })).toEqual([]);
    expect(selectParserEvaCandidates({ date_of_loss: 'February 2026' })).toEqual([]);
    expect(selectParserEvaCandidates({ date_of_instruction: '5/2/26' })).toEqual([]);
    // a valid one alongside an invalid one → only the valid one survives
    const out = selectParserEvaCandidates({ date_of_loss: '01/02/2026', date_of_instruction: 'soon' });
    expect(out).toEqual([
      { column: 'eva_date_of_loss', provenanceField: 'dateOfLoss', value: '01/02/2026' },
    ]);
  });

  it('SKIPS a VAT value that is not exactly Yes/No (would violate ck_case_eva_vat_status)', () => {
    expect(selectParserEvaCandidates({ vat_status: 'VAT Registered' })).toEqual([]);
    expect(selectParserEvaCandidates({ vat_status: 'yes' })).toEqual([]); // case-sensitive guard
    expect(selectParserEvaCandidates({ vat_status: 'Unknown' })).toEqual([]);
    expect(selectParserEvaCandidates({ vat_status: 'Yes' })).toEqual([
      { column: 'eva_vat_status', provenanceField: 'vatStatus', value: 'Yes' },
    ]);
  });

  it('length-caps values to their column width', () => {
    const longModel = 'X'.repeat(500);
    const longCirc = 'Y'.repeat(5000);
    const out = selectParserEvaCandidates({
      vehicle_model: longModel,
      accident_circumstances: longCirc,
    });
    const byCol = Object.fromEntries(out.map((c) => [c.column, c.value]));
    expect(byCol['eva_vehicle_model']).toHaveLength(200);
    expect(byCol['eva_accident_circumstances']).toHaveLength(4000);
  });
});
