import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../../../contracts/eva-payload.schema.json';
import { buildEvaPayload, EVA_FIELD_ORDER, type EvaPayloadInput } from './eva-export';

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

/** A fully-valid 13-field payload. */
function validPayload() {
  return {
    work_provider: 'CCP',
    vehicle_model: 'Audi A3',
    claimant_name: 'Jane Doe',
    claimant_telephone: '07700900000',
    claimant_email: 'jane@example.com',
    date_of_loss: '01/02/2026',
    date_of_instruction: '03/02/2026',
    accident_circumstances: 'Rear-ended at a junction.',
    inspection_address: 'Line1\nLine2\nLine3\nLine4\nLine5\nLine6',
    vat_status: 'Yes',
    mileage: '42000',
    mileage_unit: 'Miles',
    engineer_allocation: 'Unassigned',
  };
}

describe('eva-payload.schema.json — valid payloads', () => {
  it('accepts a fully-populated 13-field payload', () => {
    expect(validate(validPayload())).toBe(true);
  });

  it('accepts empty optionals and empty (but pattern-valid) dates', () => {
    const p = validPayload();
    p.claimant_telephone = '';
    p.claimant_email = '';
    p.date_of_loss = '';
    p.vat_status = '';
    p.mileage = '';
    p.mileage_unit = '';
    expect(validate(p)).toBe(true);
  });

  it('accepts "Image Based Assessment" for inspection_address', () => {
    const p = validPayload();
    p.inspection_address = 'Image Based Assessment';
    expect(validate(p)).toBe(true);
  });

  it('validates the output of buildEvaPayload', () => {
    const fields = {} as EvaPayloadInput['evaFields'];
    for (const desc of EVA_FIELD_ORDER) fields[desc.key] = { value: '' };
    // Set the schema-constrained required + format fields to valid values.
    fields.workProvider = { value: 'CCP' };
    fields.vehicleModel = { value: 'Audi A3' };
    fields.dateOfLoss = { value: '01/02/2026' };
    fields.dateOfInstruction = { value: '02/02/2026' };
    fields.inspectionAddress = { value: 'Image Based Assessment' };
    fields.vatStatus = { value: 'No' };
    fields.mileageUnit = { value: 'Km' };
    expect(validate(buildEvaPayload({ evaFields: fields }))).toBe(true);
  });
});

describe('eva-payload.schema.json — invalid payloads', () => {
  it('rejects an empty work_provider (required non-empty)', () => {
    const p = validPayload();
    p.work_provider = '';
    expect(validate(p)).toBe(false);
  });

  it('rejects an empty vehicle_model (required non-empty)', () => {
    const p = validPayload();
    p.vehicle_model = '';
    expect(validate(p)).toBe(false);
  });

  it('rejects a malformed date', () => {
    const p = validPayload();
    p.date_of_loss = '2026-02-01';
    expect(validate(p)).toBe(false);
  });

  it('rejects an inspection_address that is neither 6 lines nor the literal', () => {
    const p = validPayload();
    p.inspection_address = 'Line1\nLine2';
    expect(validate(p)).toBe(false);
  });

  it('rejects an out-of-enum vat_status', () => {
    const p = validPayload();
    p.vat_status = 'yes';
    expect(validate(p)).toBe(false);
  });

  it('rejects non-digit mileage', () => {
    const p = validPayload();
    p.mileage = '42,000';
    expect(validate(p)).toBe(false);
  });

  it('rejects an out-of-enum mileage_unit', () => {
    const p = validPayload();
    p.mileage_unit = 'miles';
    expect(validate(p)).toBe(false);
  });

  it('rejects an extra (unknown) property', () => {
    const p = { ...validPayload(), vrm: 'AB12CDE' };
    expect(validate(p)).toBe(false);
  });

  it('rejects a missing field (only 12 present)', () => {
    const p: Record<string, string> = validPayload();
    delete p.engineer_allocation;
    expect(validate(p)).toBe(false);
  });
});
